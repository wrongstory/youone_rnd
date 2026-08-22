import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.M09_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrations = [
  "20260821000100_m02_database_audit_kernel.sql",
  "20260821000200_m03_auth_rbac_scope.sql",
  "20260822000300_m04_approval_engine.sql",
  "20260822000400_m05_document_file.sql",
  "20260822000500_m06_project_wbs.sql",
  "20260822000600_m07_vendor_contract.sql",
  "20260822000700_m08_quality_inspection.sql",
  "20260822000800_m09_ncr_car.sql"
].map((name) => readFileSync(resolve(import.meta.dirname, `../../supabase/migrations/${name}`), "utf8")).join("\n");

const dbDescribe = url === undefined ? describe.skip : describe;

function run(sql: string): string {
  if (url === undefined) throw new Error("M09_TEST_DATABASE_URL required");
  const result = spawnSync(
    psql,
    ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url],
    { input: sql, encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`);
  return result.stdout.trim();
}

dbDescribe.sequential("M09 PostgreSQL NCR/CAR boundary", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") {
      throw new Error("clean dedicated M09 test DB required");
    }
    run(migrations);
  });

  it("clean-applies every migration and registers only canonical NCR/CAR transitions", () => {
    expect(run(`select count(*) from public.transition_definition
      where machine_id in ('SM-NCR-V1','SM-CAR-V1');`)).toBe("27");
    expect(run(`select count(*) from public.transition_definition
      where machine_id='SM-NCR-V1' and event_id='EVT-NCR-ASSESS-RESPONSIBILITY'
        and from_state=to_state;`)).toBe("10");
    expect(run(`select count(*) from public.transition_definition
      where machine_id='SM-NCR-V1' and from_state='REOPENED' and to_state<>'REOPENED';`)).toBe("0");
    expect(run(`select count(*) from public.state_definition
      where machine_id='SM-NCR-V1' and state_id='REOPENED' and not is_terminal;`)).toBe("1");
  });

  it("creates normalized append-only responsibility, action, verification, close and reopen evidence", () => {
    const expected = [
      "non_conformance",
      "ncr_responsibility_assessment",
      "ncr_responsibility_assessment_evidence",
      "ncr_evidence",
      "ncr_containment_action",
      "ncr_root_cause_request",
      "ncr_root_cause_analysis",
      "corrective_action",
      "car_action_execution",
      "car_verification",
      "car_rework_event",
      "car_close_event",
      "ncr_close_event",
      "ncr_reopen_event"
    ];
    const rows = run(`select table_name from information_schema.tables
      where table_schema='public' and table_name in (${expected.map((name) => `'${name}'`).join(",")})
      order by table_name;`).split("\n").filter(Boolean);
    expect(rows).toEqual([...expected].sort());
    expect(run(`select count(*) from pg_trigger
      where not tgisinternal and tgname like 'm09_%_append_only';`)).not.toBe("0");
  });

  it("keeps exact immutable InspectionAttempt lineage in foreign keys", () => {
    const definition = run(`select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.non_conformance'::regclass and contype='f'
        and pg_get_constraintdef(oid) like '%inspection_attempt%';`);
    for (const column of [
      "inspection_attempt_id",
      "inspection_id",
      "inspection_attempt_no",
      "inspection_attempt_checksum",
      "inspection_attempt_sealed_at",
      "contract_id",
      "deliverable_version_id",
      "assigned_vendor_id"
    ]) expect(definition).toContain(column);
  });

  it("forces RLS on every exposed M09 table and grants no direct writes", () => {
    expect(run(`select count(*) from pg_class
      where relnamespace='public'::regnamespace and relname in
        ('non_conformance','ncr_responsibility_assessment','ncr_evidence','ncr_containment_action',
         'ncr_root_cause_analysis','corrective_action','car_action_execution','car_verification',
         'car_rework_event','car_close_event','ncr_close_event','ncr_reopen_event')
        and relrowsecurity and relforcerowsecurity;`)).toBe("12");
    expect(run(`select count(*) from information_schema.role_table_grants
      where grantee='youone_request' and table_schema='public'
        and table_name in ('non_conformance','corrective_action','car_verification','ncr_reopen_event')
        and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES');`)).toBe("0");
  });

  it("exposes only the action-scoped Vendor projection", () => {
    const columns = run(`select string_agg(parameter_name,',' order by ordinal_position)
      from information_schema.parameters
      where specific_schema='public' and specific_name like 'read_ncr_vendor_action_%'
        and parameter_mode='OUT';`);
    for (const allowed of ["ncr_id", "ncr_no", "severity", "ncr_state", "contract_id", "project_id", "car_id", "car_state", "action_plan", "due_date"]) {
      expect(columns).toContain(allowed);
    }
    for (const forbidden of ["responsibility_status", "responsibility_party", "internal_owner_user_id", "amount", "payment", "approval"]) {
      expect(columns).not.toContain(forbidden);
    }
    expect(run(`select has_function_privilege('youone_request',
      'public.read_ncr_vendor_action(uuid,timestamptz)','EXECUTE');`)).toBe("t");
  });

  it("keeps guarded commands security-definer, search-path pinned and directly uncallable by public", () => {
    expect(run(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('create_ncr_draft','record_ncr_responsibility_assessment','verify_corrective_action_effectiveness',
         'close_non_conformance','reopen_non_conformance')
        and p.prosecdef and 'search_path=pg_catalog, public, app_private'=any(p.proconfig);`)).toBe("5");
    expect(run(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('create_ncr_draft','verify_corrective_action_effectiveness','close_non_conformance','reopen_non_conformance')
        and has_function_privilege('public',p.oid,'EXECUTE');`)).toBe("0");
  });
});

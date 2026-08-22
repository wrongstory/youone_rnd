import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.M10_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrations = [
  "20260821000100_m02_database_audit_kernel.sql",
  "20260821000200_m03_auth_rbac_scope.sql",
  "20260822000300_m04_approval_engine.sql",
  "20260822000400_m05_document_file.sql",
  "20260822000500_m06_project_wbs.sql",
  "20260822000600_m07_vendor_contract.sql",
  "20260822000700_m08_quality_inspection.sql",
  "20260822000800_m09_ncr_car.sql",
  "20260822000900_m10_ecr_eco.sql"
].map((name) => readFileSync(resolve(import.meta.dirname, `../../supabase/migrations/${name}`), "utf8")).join("\n");

const dbDescribe = url === undefined ? describe.skip : describe;
const now = "2026-08-22T09:00:00Z";
const manager = "a0000000-0000-4000-8000-000000000001";
const vendorActor = "a0000000-0000-4000-8000-000000000002";
const otherVendorActor = "a0000000-0000-4000-8000-000000000003";
const organization = "a0000000-0000-4000-8000-000000000004";
const project = "a0000000-0000-4000-8000-000000000005";
const vendor = "a0000000-0000-4000-8000-000000000006";
const otherVendor = "a0000000-0000-4000-8000-000000000007";
const vendorUser = "a0000000-0000-4000-8000-000000000008";
const otherVendorUser = "a0000000-0000-4000-8000-000000000009";
const contract = "a0000000-0000-4000-8000-000000000010";
const ecr = "a0000000-0000-4000-8000-000000000011";
const ecrVersion = "a0000000-0000-4000-8000-000000000012";
const rollbackEcr = "a0000000-0000-4000-8000-000000000013";
const rollbackVersion = "a0000000-0000-4000-8000-000000000014";

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("M10_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url],
    { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}

function runAsync(sql: string): Promise<number | null> {
  if (url === undefined) throw new Error("M10_TEST_DATABASE_URL required");
  return new Promise((resolvePromise) => {
    const child = spawn(psql, ["-X", "--no-psqlrc", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url]);
    child.stdin.end(sql);
    child.on("close", resolvePromise);
  });
}

function requestContext(actor: string): string {
  return `
    select set_config('app.actor_kind','USER',true);
    select set_config('app.actor_user_id','${actor}',true);
    select set_config('app.effective_actor_user_id','${actor}',true);
    select set_config('app.anonymous_subject_fingerprint','',true);
    select set_config('app.system_actor_id','',true);
    select set_config('app.correlation_id','request:m10-db',true);
    select set_config('app.causation_id','',true);
    select set_config('app.request_time','${now}',true);
    select set_config('app.acting_authority_id','',true);`;
}

function insertDraft(id: string, versionId: string, number: string): string {
  return `set constraints all deferred;
    insert into public.change_request(id,ecr_no,project_id,contract_id,assigned_vendor_id,originator_user_id,owner_user_id,
      current_version_id,current_version_no,state,version_no,created_at,updated_at)
    values('${id}','${number}','${project}','${contract}','${vendor}','${vendorActor}','${manager}','${versionId}',1,'DRAFT',1,'${now}','${now}');
    insert into public.change_request_version(id,change_request_id,version_no,title,rationale,proposed_change_summary,priority,state,
      created_by_user_id,created_at) values('${versionId}','${id}',1,'Vendor-safe title','Rationale','Requested change','NORMAL','DRAFT','${vendorActor}','${now}');`;
}

dbDescribe.sequential("M10 PostgreSQL ECR/ECO boundary", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M10 test DB required");
    run(migrations);
    run(`
      insert into public.organization(id,stable_code,legal_name,status) values('${organization}','M10-ORG','M10 Org','ACTIVE');
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values
        ('${manager}','m10-manager','INTERNAL','ACTIVE','2026-01-01'),
        ('${vendorActor}','m10-vendor-a','VENDOR','ACTIVE','2026-01-01'),
        ('${otherVendorActor}','m10-vendor-b','VENDOR','ACTIVE','2026-01-01');
      insert into public.user_organization_assignment(id,user_id,organization_id,valid_from,grant_reason_code)
        values('a1000000-0000-4000-8000-000000000001','${manager}','${organization}','2026-01-01','M10-FIXTURE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code) values
        ('a1000000-0000-4000-8000-000000000002','${manager}','20000000-0000-4000-8000-000000000001','2026-01-01','M10-FIXTURE'),
        ('a1000000-0000-4000-8000-000000000003','${vendorActor}','20000000-0000-4000-8000-000000000005','2026-01-01','M10-FIXTURE'),
        ('a1000000-0000-4000-8000-000000000004','${otherVendorActor}','20000000-0000-4000-8000-000000000005','2026-01-01','M10-FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
      select ('a2000000-0000-4000-8000-'||lpad(row_number() over(order by id)::text,12,'0'))::uuid,
        '20000000-0000-4000-8000-000000000001',id,'2026-01-01','M10-FIXTURE' from public.permission
        where stable_code in('change.request.create','change.request.manage','change.impact.analyze','change.request.review',
          'change.request.approve','change.order.manage','change.order.emergency_release','change.order.implement','change.order.verify');
      insert into public.vendor(id,vendor_code,legal_name,status) values
        ('${vendor}','M10-VENDOR-A','Vendor A','ACTIVE'),('${otherVendor}','M10-VENDOR-B','Vendor B','ACTIVE');
      insert into public.vendor_user(id,vendor_id,user_id,status,valid_from,grant_reason_code) values
        ('${vendorUser}','${vendor}','${vendorActor}','ACTIVE','2026-01-01','M10-FIXTURE'),
        ('${otherVendorUser}','${otherVendor}','${otherVendorActor}','ACTIVE','2026-01-01','M10-FIXTURE');
      insert into public.project(id,project_code,name,organization_id,owner_user_id,objective,period_start,period_end,visibility_code,state,created_at,updated_at)
        values('${project}','M10-PROJECT','Project','${organization}','${manager}','Objective','2026-01-01','2027-01-01','MEMBERS_ONLY','ACTIVE','${now}','${now}');
      insert into public.vendor_contract(id,contract_no,vendor_id,manager_user_id,title,state,created_at,updated_at)
        values('${contract}','M10-CONTRACT','${vendor}','${manager}','Contract','ACTIVE','${now}','${now}');
      insert into public.contract_project(id,contract_id,project_id,valid_from)
        values('a1000000-0000-4000-8000-000000000010','${contract}','${project}','2026-01-01');
      insert into public.project_vendor_grant(id,project_id,vendor_user_id,status,valid_from,granted_by_user_id,grant_reason_code)
        values('a1000000-0000-4000-8000-000000000011','${project}','${vendorUser}','ACTIVE','2026-01-01','${manager}','M10-FIXTURE');
      insert into public.project_vendor_grant_action(grant_id,permission_id)
        select 'a1000000-0000-4000-8000-000000000011',id from public.permission where stable_code in('change.request.read','change.request.create');
      insert into public.contract_vendor_grant(id,contract_id,project_id,vendor_user_id,status,valid_from,granted_by_user_id,grant_reason_code)
        values('a1000000-0000-4000-8000-000000000012','${contract}','${project}','${vendorUser}','ACTIVE','2026-01-01','${manager}','M10-FIXTURE');
      insert into public.contract_vendor_grant_action(grant_id,permission_id)
        select 'a1000000-0000-4000-8000-000000000012',id from public.permission where stable_code in('change.request.read','change.request.create');
      begin; ${insertDraft(ecr, ecrVersion, "M10-ECR-1")} commit;
      begin; ${insertDraft(rollbackEcr, rollbackVersion, "M10-ECR-2")} commit;
    `);
  }, 40_000);

  it("clean-applies M02 through M10 and registers canonical typed machines", () => {
    expect(run("select count(*) from public.transition_definition where machine_id in ('SM-ECR-V1','SM-ECO-V1');")).toBe("18");
    expect(run("select count(*) from public.state_definition where machine_id in ('SM-ECR-V1','SM-ECO-V1');")).toBe("17");
    expect(run("select count(*) from public.permission where stable_code like 'change.%' and status='ACTIVE';")).toBe("11");
  });

  it("creates all six typed target relations and exact Approval subject FKs", () => {
    const targets = ["change_order_requirement_target", "change_order_document_target", "change_order_deliverable_target",
      "change_order_inspection_checklist_target", "change_order_test_plan_target", "change_order_contract_target"];
    expect(run(`select count(*) from information_schema.tables where table_schema='public' and table_name in (${targets.map((name) => `'${name}'`).join(",")});`)).toBe("6");
    expect(run("select count(*) from pg_constraint where conrelid='public.approval_subject_change_request_version'::regclass and contype='f';")).toBe("3");
    expect(run("select count(*) from pg_constraint where conrelid='public.approval_subject_change_order_version'::regclass and contype='f';")).toBe("3");
  });

  it("forces RLS on every M10 record and grants request role no direct write", () => {
    const tables = ["change_request", "change_request_version", "ecr_impact_analysis", "change_impact_assessment", "change_impact_evidence",
      "emergency_change_exception", "change_order", "change_order_version", "change_target", "change_order_implementation",
      "change_order_verification", "change_order_retrospective_approval", "change_approval_negative_outcome"];
    expect(run(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in (${tables.map((name) => `'${name}'`).join(",")})
      and relrowsecurity and relforcerowsecurity;`)).toBe(String(tables.length));
    expect(run(`select count(*) from information_schema.role_table_grants where grantee='youone_request' and table_schema='public'
      and table_name in (${tables.map((name) => `'${name}'`).join(",")}) and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES');`)).toBe("0");
    run(`begin; set local role youone_request; ${requestContext(vendorActor)} update public.change_request set state='APPROVED' where id='${ecr}'; rollback;`, false);
  });

  it("denies Vendor base rows and requires exact active membership plus Project and Contract grants", () => {
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.change_request; rollback;`).split("\n").at(-1)).toBe("0");
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.read_vendor_change_request('${ecr}','${now}'); rollback;`).split("\n").at(-1)).toBe("1");
    expect(run(`begin; set local role youone_request; ${requestContext(otherVendorActor)} select count(*) from public.read_vendor_change_request('${ecr}','${now}'); rollback;`).split("\n").at(-1)).toBe("0");
    run(`update public.user_account set status='DISABLED' where id='${vendorActor}';`);
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.read_vendor_change_request('${ecr}','${now}'); rollback;`).split("\n").at(-1)).toBe("0");
    run(`update public.user_account set status='ACTIVE' where id='${vendorActor}'; update public.project_vendor_grant set valid_until='2026-08-22T08:00:00Z' where id='a1000000-0000-4000-8000-000000000011';`);
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.read_vendor_change_request('${ecr}','${now}'); rollback;`).split("\n").at(-1)).toBe("0");
    run("update public.project_vendor_grant set valid_until=null where id='a1000000-0000-4000-8000-000000000011';");
  });

  it("allows only one concurrent optimistic transition winner and writes Audit/Transition/Outbox atomically", async () => {
    const call = (suffix: string) => `begin; set local role youone_request; ${requestContext(manager)}
      select public.start_change_request_analysis('${ecr}',1,'a3000000-0000-4000-8000-0000000000${suffix}',
        'a4000000-0000-4000-8000-0000000000${suffix}','a5000000-0000-4000-8000-0000000000${suffix}','${now}'); commit;`;
    const results = await Promise.all([runAsync(call("01")), runAsync(call("02"))]);
    expect(results.filter((status) => status === 0)).toHaveLength(1);
    expect(run(`select state||':'||version_no from public.change_request where id='${ecr}';`)).toBe("IMPACT_ANALYSIS:2");
    expect(run(`select count(*) from public.audit_log a join public.state_transition_history t on t.audit_log_id=a.id
      join public.outbox_event o on o.initiating_audit_log_id=a.id where a.resource_id='${ecr}' and a.result='SUCCEEDED';`)).toBe("1");
  });

  it("rolls aggregate and evidence back when the Outbox insert fails", () => {
    const existingOutboxId = run(`select id from public.outbox_event where aggregate_id='${ecr}' order by occurred_at desc limit 1;`);
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.start_change_request_analysis('${rollbackEcr}',1,'a3000000-0000-4000-8000-000000000099',
        'a4000000-0000-4000-8000-000000000099','${existingOutboxId}','${now}'); commit;`, false);
    expect(run(`select state||':'||version_no from public.change_request where id='${rollbackEcr}';`)).toBe("DRAFT:1");
    expect(run("select count(*) from public.audit_log where id='a3000000-0000-4000-8000-000000000099';")).toBe("0");
  });

  it("keeps impact, target, implementation, verification and emergency evidence append-only", () => {
    run(`insert into public.change_impact_assessment(id,change_request_version_id,sequence_no,impact_kind,effect,severity,analysis,rationale,
      contract_amendment_required,acceptance_criteria_change,assessed_by_user_id,assessed_at)
      values('a6000000-0000-4000-8000-000000000001','${ecrVersion}',1,'QUALITY','NO_IMPACT','LOW','none','reason',false,false,'${manager}','${now}');`);
    run("update public.change_impact_assessment set analysis='forged' where id='a6000000-0000-4000-8000-000000000001';", false);
    expect(run("select count(*) from pg_trigger where not tgisinternal and tgname like 'm10_%_append_only';")).not.toBe("0");
  });

  it("rejects incomplete impact sealing and an untyped ECO target", () => {
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.seal_change_request_for_review('${ecr}','a6000000-0000-4000-8000-000000000010',2,
        'a6000000-0000-4000-8000-000000000011','a6000000-0000-4000-8000-000000000012',
        'a6000000-0000-4000-8000-000000000013','${now}'); commit;`, false);
    expect(run(`select state||':'||version_no from public.change_request where id='${ecr}';`)).toBe("IMPACT_ANALYSIS:2");

    run(`begin; set constraints all deferred;
      insert into public.change_target(id,change_order_version_id,target_kind)
      values('a6000000-0000-4000-8000-000000000020','a6000000-0000-4000-8000-000000000021','DOCUMENT_VERSION');
      commit;`, false);
  });
});

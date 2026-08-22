import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.M12_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrations = ["20260821000100_m02_database_audit_kernel.sql", "20260821000200_m03_auth_rbac_scope.sql",
  "20260822000300_m04_approval_engine.sql", "20260822000400_m05_document_file.sql", "20260822000500_m06_project_wbs.sql",
  "20260822000600_m07_vendor_contract.sql", "20260822000700_m08_quality_inspection.sql", "20260822000800_m09_ncr_car.sql",
  "20260822000900_m10_ecr_eco.sql", "20260822001000_m11_purchase_rnd.sql", "20260822001100_m12_research_note.sql"]
  .map((name) => readFileSync(resolve(import.meta.dirname, `../../supabase/migrations/${name}`), "utf8")).join("\n");
const dbDescribe = url === undefined ? describe.skip : describe;
const now = "2026-08-22T09:00:00Z";
const org = "c0000000-0000-4000-8000-000000000001";
const author = "c0000000-0000-4000-8000-000000000002";
const senior = "c0000000-0000-4000-8000-000000000003";
const director = "c0000000-0000-4000-8000-000000000004";
const representative = "c0000000-0000-4000-8000-000000000005";
const admin = "c0000000-0000-4000-8000-000000000006";
const vendor = "c0000000-0000-4000-8000-000000000007";
const project = "c0000000-0000-4000-8000-000000000008";
const attachment = "c0000000-0000-4000-8000-000000000009";

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("M12_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url],
    { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}
function runAsync(sql: string): Promise<number | null> {
  if (url === undefined) throw new Error("M12_TEST_DATABASE_URL required");
  return new Promise((done) => { const child = spawn(psql, ["-X", "--no-psqlrc", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url]); child.stdin.end(sql); child.on("close", done); });
}
function userContext(actor: string): string { return `select set_config('app.actor_kind','USER',true);select set_config('app.actor_user_id','${actor}',true);
 select set_config('app.effective_actor_user_id','${actor}',true);select set_config('app.anonymous_subject_fingerprint','',true);
 select set_config('app.system_actor_id','',true);select set_config('app.correlation_id','request:m12-db',true);
 select set_config('app.causation_id','',true);select set_config('app.request_time','${now}',true);select set_config('app.acting_authority_id','',true);`; }
function workerContext(): string { return `select set_config('app.actor_kind','SYSTEM',true);select set_config('app.actor_user_id','',true);
 select set_config('app.effective_actor_user_id','',true);select set_config('app.anonymous_subject_fingerprint','',true);
 select set_config('app.system_actor_id','DOCUMENT_ENGINE',true);select set_config('app.correlation_id','worker:m12-pdf',true);
 select set_config('app.causation_id','',true);select set_config('app.request_time','${now}',true);select set_config('app.acting_authority_id','',true);`; }

function createNote(note: string, entry: string, noteNo: string, targetAuthor = author): void {
  run(`begin;set local role youone_request;${userContext(targetAuthor)}select public.create_research_note('${note}','${entry}','${noteNo}','${project}',null,
    '${senior}','SEC_L2_INTERNAL','2026-08-22','Experiment','Objective','Method','Observations','Results','Conclusion',
    extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),'${now}');commit;`);
}
function submitDirect(note: string, expected: number, suffix: string): void {
  run(`begin;set local role youone_request;${userContext(author)}select public.submit_research_note('${note}',${expected},false,
    'c1${suffix}0000-0000-4000-8000-000000000001','c1${suffix}0000-0000-4000-8000-000000000002','c1${suffix}0000-0000-4000-8000-000000000003','${now}');commit;`);
}
function renderPdf(note: string, manifest: string, suffix: string): void {
  run(`begin;set local role youone_privileged_writer;${workerContext()}select public.record_research_note_pdf('${manifest}','${note}','DOCUMENT_ENGINE','V1',2,
    '${attachment}','c2${suffix}0000-0000-4000-8000-000000000001','c2${suffix}0000-0000-4000-8000-000000000002','${now}');commit;`);
}

dbDescribe.sequential("M12 PostgreSQL ResearchNote boundary", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M12 test DB required");
    run(migrations);
    run(`insert into public.organization(id,stable_code,legal_name,status) values('${org}','M12_ORG','M12 Org','ACTIVE');
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values
       ('${author}','m12-author','INTERNAL','ACTIVE','2026-01-01'),('${senior}','m12-senior','INTERNAL','ACTIVE','2026-01-01'),
       ('${director}','m12-director','INTERNAL','ACTIVE','2026-01-01'),('${representative}','m12-representative','INTERNAL','ACTIVE','2026-01-01'),
       ('${admin}','m12-admin','INTERNAL','ACTIVE','2026-01-01'),('${vendor}','m12-vendor','VENDOR','ACTIVE','2026-01-01');
      insert into public.user_organization_assignment(id,user_id,organization_id,valid_from,grant_reason_code) values
       ('c0100000-0000-4000-8000-000000000001','${author}','${org}','2026-01-01','M12_FIXTURE'),
       ('c0100000-0000-4000-8000-000000000002','${senior}','${org}','2026-01-01','M12_FIXTURE'),
       ('c0100000-0000-4000-8000-000000000003','${director}','${org}','2026-01-01','M12_FIXTURE'),
       ('c0100000-0000-4000-8000-000000000004','${representative}','${org}','2026-01-01','M12_FIXTURE'),
       ('c0100000-0000-4000-8000-000000000005','${admin}','${org}','2026-01-01','M12_FIXTURE');
      insert into public.user_position_assignment(id,user_id,position_id,valid_from,grant_reason_code) values
       ('c0200000-0000-4000-8000-000000000001','${author}','10000000-0000-4000-8000-000000000001','2026-01-01','M12_FIXTURE'),
       ('c0200000-0000-4000-8000-000000000002','${senior}','10000000-0000-4000-8000-000000000002','2026-01-01','M12_FIXTURE'),
       ('c0200000-0000-4000-8000-000000000003','${director}','10000000-0000-4000-8000-000000000003','2026-01-01','M12_FIXTURE'),
       ('c0200000-0000-4000-8000-000000000004','${representative}','10000000-0000-4000-8000-000000000004','2026-01-01','M12_FIXTURE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code) values
       ('c0300000-0000-4000-8000-000000000001','${author}','20000000-0000-4000-8000-000000000001','2026-01-01','M12_FIXTURE'),
       ('c0300000-0000-4000-8000-000000000002','${senior}','20000000-0000-4000-8000-000000000001','2026-01-01','M12_FIXTURE'),
       ('c0300000-0000-4000-8000-000000000003','${director}','20000000-0000-4000-8000-000000000003','2026-01-01','M12_FIXTURE'),
       ('c0300000-0000-4000-8000-000000000004','${representative}','20000000-0000-4000-8000-000000000004','2026-01-01','M12_FIXTURE'),
       ('c0300000-0000-4000-8000-000000000005','${admin}','20000000-0000-4000-8000-000000000006','2026-01-01','M12_FIXTURE'),
       ('c0300000-0000-4000-8000-000000000006','${vendor}','20000000-0000-4000-8000-000000000005','2026-01-01','M12_FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
       select ('c0400000-0000-4000-8000-'||lpad(row_number() over(order by p.id)::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000001',p.id,'2026-01-01','M12_FIXTURE'
       from public.permission p where p.stable_code in('research_note.record.create','research_note.record.review','research_note.record.correct','research_note.record.read');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
       select ('c0410000-0000-4000-8000-'||lpad(row_number() over(order by p.id)::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000003',p.id,'2026-01-01','M12_FIXTURE'
       from public.permission p where p.stable_code in('research_note.record.finalize','research_note.record.correct','research_note.record.read');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
       select ('c0420000-0000-4000-8000-'||lpad(row_number() over(order by p.id)::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000004',p.id,'2026-01-01','M12_FIXTURE'
       from public.permission p where p.stable_code='research_note.record.finalize';
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
       select ('c0430000-0000-4000-8000-'||lpad(row_number() over(order by p.id)::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000006',p.id,'2026-01-01','M12_FIXTURE'
       from public.permission p where p.stable_code='research_note.record.read';
      insert into public.project(id,project_code,name,organization_id,owner_user_id,objective,period_start,period_end,visibility_code,state,version_no,created_at,updated_at)
       values('${project}','M12_PROJECT','ResearchNote Project','${org}','${author}','Research','2026-01-01','2026-12-31','MEMBERS_ONLY','ACTIVE',1,'${now}','${now}');
      insert into public.project_member(id,project_id,user_id,project_role_id,state,valid_from,granted_by_user_id,grant_reason_code) values
       ('c0500000-0000-4000-8000-000000000001','${project}','${director}','REVIEWER','ACTIVE','2026-01-01','${author}','M12_FIXTURE');
      begin;
      insert into public.attachment(id,storage_provider,bucket_code,storage_key,declared_mime_type,declared_size_bytes,expected_sha256,detected_mime_type,
       detected_size_bytes,detected_sha256,signature_validation,scanner_id,scanner_version,scan_evidence_id,scan_verdict,security_level,uploader_user_id,
       state,row_version,intent_expires_at,created_at,verified_at,scanned_at) values('${attachment}','SUPABASE_PRIVATE','PRIVATE_BUSINESS',
       'private/m12/research-note.pdf','application/pdf',10,repeat('a',64),'application/pdf',10,repeat('a',64),'MATCH','M12_SCANNER','V1',
       'c0600000-0000-4000-8000-000000000001','CLEAN','SEC_L2_INTERNAL','${author}','AVAILABLE',3,'2027-01-01','2026-08-22T08:00:00Z','2026-08-22T08:10:00Z','2026-08-22T08:20:00Z');
      insert into public.file_scan_evidence(id,attachment_id,detected_sha256,scanner_id,scanner_version,verdict,scanned_at)
       values('c0600000-0000-4000-8000-000000000001','${attachment}',repeat('a',64),'M12_SCANNER','V1','CLEAN','2026-08-22T08:20:00Z');commit;`);
  }, 60_000);

  it("clean-applies M02 through M12 and registers exact canonical transitions", () => {
    expect(run("select count(*) from public.transition_definition where machine_id='SM-RESEARCH-NOTE-V1';")).toBe("9");
    expect(run("select count(*) from information_schema.tables where table_schema='public' and table_name like 'research_note%';")).toBe("6");
  });

  it("forces RLS and denies all direct request/privileged writes", () => {
    const names = ["research_note", "research_note_entry_version", "research_note_entry_attachment", "research_note_senior_review", "research_note_pdf_manifest", "research_note_finalization"];
    expect(run(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in(${names.map((n) => `'${n}'`).join(",")}) and relrowsecurity and relforcerowsecurity;`)).toBe("6");
    expect(run(`select count(*) from information_schema.role_table_grants where grantee in('youone_request','youone_privileged_writer') and table_schema='public'
      and table_name in(${names.map((n) => `'${n}'`).join(",")}) and privilege_type in('INSERT','UPDATE','DELETE');`)).toBe("0");
  });

  it("creates, seals, renders and finalizes one exact entry through the dedicated Director path", () => {
    const note = "c1000000-0000-4000-8000-000000000001"; const entry = "c1000000-0000-4000-8000-000000000002";
    createNote(note, entry, "M12-NOTE-1"); submitDirect(note, 1, "01");
    renderPdf(note, "c1000000-0000-4000-8000-000000000003", "01");
    run(`begin;set local role youone_request;${userContext(director)}select public.finalize_research_note('${note}',2,
      'c1000000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-000000000003',
      'c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000006','c1000000-0000-4000-8000-000000000007','${now}');commit;`);
    expect(run(`select n.state||':'||e.state from public.research_note n join public.research_note_entry_version e on e.id=n.current_entry_version_id where n.id='${note}';`)).toBe("FINALIZED:FINALIZED");
    expect(run(`select count(*) from public.audit_log a join public.state_transition_history t on t.audit_log_id=a.id join public.outbox_event o on o.initiating_audit_log_id=a.id where a.resource_type='RESEARCH_NOTE' and a.resource_id='${note}';`)).toBe("3");
  });

  it("adds a correction only as a new direct child of the exact finalized entry", () => {
    run(`begin;set local role youone_request;${userContext(author)}select public.add_research_note_correction(
      'c1000000-0000-4000-8000-000000000001','c1050000-0000-4000-8000-000000000001','CORRECTION','TYPO-CORRECTION',
      '2026-08-22','Correction','Objective','Method','Corrected observations','Results','Conclusion',3,
      'c1050000-0000-4000-8000-000000000002','c1050000-0000-4000-8000-000000000003','c1050000-0000-4000-8000-000000000004','${now}');commit;`);
    expect(run("select n.state||':'||e.entry_kind||':'||p.state from public.research_note n join public.research_note_entry_version e on e.id=n.current_entry_version_id join public.research_note_entry_version p on p.id=e.prior_entry_version_id where n.id='c1000000-0000-4000-8000-000000000001';")).toBe("CORRECTED_BY_ADDENDUM:CORRECTION:FINALIZED");
  });

  it("denies Representative and Senior official finalization even with the permission", () => {
    const note = "c1100000-0000-4000-8000-000000000001";createNote(note, "c1100000-0000-4000-8000-000000000002", "M12-NOTE-2");submitDirect(note, 1, "02");
    renderPdf(note, "c1100000-0000-4000-8000-000000000003", "02");
    for (const actor of [representative, senior]) {
      run(`begin;set local role youone_request;${userContext(actor)}select public.finalize_research_note('${note}',2,'c1100000-0000-4000-8000-000000000004',
       'c1100000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000005','c1100000-0000-4000-8000-000000000006',
       'c1100000-0000-4000-8000-000000000007','${now}');commit;`, false);
    }
  });

  it("records optional Senior review as review evidence, never official Approval", () => {
    const note = "c1200000-0000-4000-8000-000000000001";createNote(note, "c1200000-0000-4000-8000-000000000002", "M12-NOTE-3");
    run(`begin;set local role youone_request;${userContext(author)}select public.submit_research_note('${note}',1,true,
      'c1200000-0000-4000-8000-000000000003','c1200000-0000-4000-8000-000000000004','c1200000-0000-4000-8000-000000000005','${now}');commit;`);
    run(`begin;set local role youone_request;${userContext(senior)}select public.review_research_note('${note}',2,'REVISION_REQUESTED','revise',
      'c1200000-0000-4000-8000-000000000006','c1200000-0000-4000-8000-000000000007','c1200000-0000-4000-8000-000000000008',
      'c1200000-0000-4000-8000-000000000009','${now}');commit;`);
    expect(run(`select state from public.research_note where id='${note}';`)).toBe("REVISION_REQUIRED");
    expect(run(`select count(*) from public.approval_action where effective_actor_user_id='${senior}' and occurred_at='${now}';`)).toBe("0");
  });

  it("requires a direct revision-requested predecessor for resubmission", () => {
    const note = "c1300000-0000-4000-8000-000000000001";createNote(note, "c1300000-0000-4000-8000-000000000002", "M12-NOTE-4");
    run(`begin;set local role youone_request;${userContext(author)}select public.resubmit_research_note('${note}','c1300000-0000-4000-8000-000000000003',1,false,
     '2026-08-22','Revision','Objective','Method','Observations','Results','Conclusion','c1300000-0000-4000-8000-000000000004',
     'c1300000-0000-4000-8000-000000000005','c1300000-0000-4000-8000-000000000006','${now}');commit;`, false);
    expect(run("select count(*) from public.research_note_entry_version where id='c1300000-0000-4000-8000-000000000003';")).toBe("0");
  });

  it("allows only one concurrent optimistic Director finalization", async () => {
    const note = "c1400000-0000-4000-8000-000000000001";createNote(note, "c1400000-0000-4000-8000-000000000002", "M12-NOTE-5");submitDirect(note, 1, "05");
    renderPdf(note, "c1400000-0000-4000-8000-000000000003", "05");
    const call = (suffix: string) => `begin;set local role youone_request;${userContext(director)}select public.finalize_research_note('${note}',2,
      'c14${suffix}000-0000-4000-8000-000000000004','c1400000-0000-4000-8000-000000000003','c14${suffix}000-0000-4000-8000-000000000005',
      'c14${suffix}000-0000-4000-8000-000000000006','c14${suffix}000-0000-4000-8000-000000000007','${now}');commit;`;
    const statuses = await Promise.all([runAsync(call("01")), runAsync(call("02"))]);
    expect(statuses.filter((status) => status === 0)).toHaveLength(1);
  });

  it("denies Vendor and Admin-System source reads at RLS and function layers", () => {
    const note = "c1000000-0000-4000-8000-000000000001";
    for (const actor of [vendor, admin]) {
      expect(run(`begin;set local role youone_request;${userContext(actor)}select count(*) from public.research_note_entry_version;rollback;`).split("\n").at(-1)).toBe("0");
      run(`begin;set local role youone_request;${userContext(actor)}select count(*) from public.read_research_note_source('${note}','${now}');rollback;`, false);
    }
  });

  it("prevents update or delete of finalized entry, review, finalization and PDF evidence", () => {
    run("update public.research_note_entry_version set title='overwrite' where id='c1000000-0000-4000-8000-000000000002';", false);
    run("delete from public.research_note_finalization where research_note_id='c1000000-0000-4000-8000-000000000001';", false);
    run("update public.research_note_pdf_manifest set page_count=99 where research_note_id='c1000000-0000-4000-8000-000000000001';", false);
    run("delete from public.research_note_senior_review where research_note_id='c1200000-0000-4000-8000-000000000001';", false);
  });

  it("rolls back the aggregate when the Outbox identity conflicts", () => {
    const outbox = run("select id from public.outbox_event where aggregate_id='c1000000-0000-4000-8000-000000000001' limit 1;");
    run(`begin;set local role youone_request;${userContext(author)}select public.create_research_note('c1500000-0000-4000-8000-000000000001',
      'c1500000-0000-4000-8000-000000000002','M12-ROLLBACK','${project}',null,'${senior}','SEC_L2_INTERNAL','2026-08-22','Rollback',
      'Objective','Method','Observations','Results','Conclusion','c1500000-0000-4000-8000-000000000003','c1500000-0000-4000-8000-000000000004',
      '${outbox}','${now}');commit;`, false);
    expect(run("select count(*) from public.research_note where id='c1500000-0000-4000-8000-000000000001';")).toBe("0");
  });
});

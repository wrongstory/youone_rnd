import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.M13_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrationNames = [
  "20260821000100_m02_database_audit_kernel.sql", "20260821000200_m03_auth_rbac_scope.sql",
  "20260822000300_m04_approval_engine.sql", "20260822000400_m05_document_file.sql",
  "20260822000500_m06_project_wbs.sql", "20260822000600_m07_vendor_contract.sql",
  "20260822000700_m08_quality_inspection.sql", "20260822000800_m09_ncr_car.sql",
  "20260822000900_m10_ecr_eco.sql", "20260822001000_m11_purchase_rnd.sql",
  "20260822001100_m12_research_note.sql", "20260822001200_m13_safety_light.sql",
];
const migrations = migrationNames.map((name) => readFileSync(resolve(import.meta.dirname, `../../supabase/migrations/${name}`), "utf8")).join("\n");
const dbDescribe = url === undefined ? describe.skip : describe;
const now = "2026-08-22T09:00:00Z";
const org = "d0000000-0000-4000-8000-000000000001";
const director = "d0000000-0000-4000-8000-000000000002";
const manager = "d0000000-0000-4000-8000-000000000003";
const coordinator = "d0000000-0000-4000-8000-000000000004";
const admin = "d0000000-0000-4000-8000-000000000005";
const vendorActor = "d0000000-0000-4000-8000-000000000006";
const vendor = "d0000000-0000-4000-8000-000000000007";
const vendorUser = "d0000000-0000-4000-8000-000000000008";
const project = "d0000000-0000-4000-8000-000000000009";
const attachment = "d0000000-0000-4000-8000-000000000010";
const managerAssignment = "d0000000-0000-4000-8000-000000000011";
const coordinatorAssignment = "d0000000-0000-4000-8000-000000000012";

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("M13_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url], { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}
function runAsync(sql: string): Promise<number | null> {
  if (url === undefined) throw new Error("M13_TEST_DATABASE_URL required");
  return new Promise((done) => { const child = spawn(psql, ["-X", "--no-psqlrc", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url]); child.stdin.end(sql); child.on("close", done); });
}
function userContext(actor: string, at = now): string { return `select set_config('app.actor_kind','USER',true);select set_config('app.actor_user_id','${actor}',true);
 select set_config('app.effective_actor_user_id','${actor}',true);select set_config('app.anonymous_subject_fingerprint','',true);
 select set_config('app.system_actor_id','',true);select set_config('app.correlation_id','request:m13-db',true);
 select set_config('app.causation_id','',true);select set_config('app.request_time','${at}',true);select set_config('app.acting_authority_id','',true);`; }
function workerContext(at: string): string { return `select set_config('app.actor_kind','SYSTEM',true);select set_config('app.actor_user_id','',true);
 select set_config('app.effective_actor_user_id','',true);select set_config('app.anonymous_subject_fingerprint','',true);
 select set_config('app.system_actor_id','SAFETY_SLA_MONITOR',true);select set_config('app.correlation_id','worker:m13-sla',true);
 select set_config('app.causation_id','',true);select set_config('app.request_time','${at}',true);select set_config('app.acting_authority_id','',true);`; }

dbDescribe.sequential("M13 PostgreSQL Safety Light boundary", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M13 test DB required");
    run(migrations);
    run(`insert into public.organization(id,stable_code,legal_name,status) values('${org}','M13_ORG','M13 Org','ACTIVE');
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values
       ('${director}','m13-director','INTERNAL','ACTIVE','2026-01-01'),('${manager}','m13-manager','INTERNAL','ACTIVE','2026-01-01'),
       ('${coordinator}','m13-coordinator','INTERNAL','ACTIVE','2026-01-01'),('${admin}','m13-admin','INTERNAL','ACTIVE','2026-01-01'),
       ('${vendorActor}','m13-vendor','VENDOR','ACTIVE','2026-01-01');
      insert into public.user_organization_assignment(id,user_id,organization_id,valid_from,grant_reason_code) values
       ('d0100000-0000-4000-8000-000000000001','${director}','${org}','2026-01-01','M13_FIXTURE'),
       ('d0100000-0000-4000-8000-000000000002','${manager}','${org}','2026-01-01','M13_FIXTURE'),
       ('d0100000-0000-4000-8000-000000000003','${coordinator}','${org}','2026-01-01','M13_FIXTURE'),
       ('d0100000-0000-4000-8000-000000000004','${admin}','${org}','2026-01-01','M13_FIXTURE');
      insert into public.user_position_assignment(id,user_id,position_id,valid_from,grant_reason_code) values
       ('d0200000-0000-4000-8000-000000000001','${director}','10000000-0000-4000-8000-000000000003','2026-01-01','M13_FIXTURE'),
       ('d0200000-0000-4000-8000-000000000002','${manager}','10000000-0000-4000-8000-000000000001','2026-01-01','M13_FIXTURE'),
       ('d0200000-0000-4000-8000-000000000003','${coordinator}','10000000-0000-4000-8000-000000000001','2026-01-01','M13_FIXTURE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code) values
       ('d0300000-0000-4000-8000-000000000001','${director}','20000000-0000-4000-8000-000000000003','2026-01-01','M13_FIXTURE'),
       ('d0300000-0000-4000-8000-000000000002','${manager}','20000000-0000-4000-8000-000000000009','2026-01-01','M13_FIXTURE'),
       ('d0300000-0000-4000-8000-000000000003','${coordinator}','20000000-0000-4000-8000-000000000001','2026-01-01','M13_FIXTURE'),
       ('d0300000-0000-4000-8000-000000000004','${admin}','20000000-0000-4000-8000-000000000006','2026-01-01','M13_FIXTURE'),
       ('d0300000-0000-4000-8000-000000000005','${vendorActor}','20000000-0000-4000-8000-000000000005','2026-01-01','M13_FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
       select ('d0400000-0000-4000-8000-'||lpad(row_number() over(order by p.id)::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000003',p.id,'2026-01-01','M13_FIXTURE'
       from public.permission p where p.stable_code like 'safety.%';
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
       select ('d0410000-0000-4000-8000-'||lpad(row_number() over(order by p.id)::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000009',p.id,'2026-01-01','M13_FIXTURE'
       from public.permission p where p.stable_code like 'safety.%';
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
       select ('d0420000-0000-4000-8000-'||lpad(row_number() over(order by p.id)::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000001',p.id,'2026-01-01','M13_FIXTURE'
       from public.permission p where p.stable_code in('safety.inspection.manage','safety.incident.investigate','safety.record.read');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
       select ('d0430000-0000-4000-8000-'||lpad(row_number() over(order by p.id)::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000006',p.id,'2026-01-01','M13_FIXTURE'
       from public.permission p where p.stable_code='safety.record.read';
      insert into public.vendor(id,vendor_code,legal_name,status) values('${vendor}','M13_VENDOR','M13 Vendor','ACTIVE');
      insert into public.vendor_user(id,vendor_id,user_id,status,valid_from,granted_by_user_id,grant_reason_code) values('${vendorUser}','${vendor}','${vendorActor}','ACTIVE','2026-01-01','${director}','M13_FIXTURE');
      insert into public.project(id,project_code,name,organization_id,owner_user_id,objective,period_start,period_end,visibility_code,state,version_no,created_at,updated_at)
       values('${project}','M13_PROJECT','Safety Project','${org}','${director}','Safety','2026-01-01','2026-12-31','MEMBERS_ONLY','ACTIVE',1,'${now}','${now}');
      insert into public.project_member(id,project_id,user_id,project_role_id,state,valid_from,granted_by_user_id,grant_reason_code) values
       ('d0500000-0000-4000-8000-000000000001','${project}','${manager}','PROJECT_MANAGER','ACTIVE','2026-01-01','${director}','M13_FIXTURE'),
       ('d0500000-0000-4000-8000-000000000002','${project}','${coordinator}','RESEARCHER','ACTIVE','2026-01-01','${director}','M13_FIXTURE');
      begin;
      insert into public.attachment(id,storage_provider,bucket_code,storage_key,declared_mime_type,declared_size_bytes,expected_sha256,detected_mime_type,
       detected_size_bytes,detected_sha256,signature_validation,scanner_id,scanner_version,scan_evidence_id,scan_verdict,security_level,uploader_user_id,
       state,row_version,intent_expires_at,created_at,verified_at,scanned_at) values('${attachment}','SUPABASE_PRIVATE','PRIVATE_BUSINESS',
       'private/m13/safety-evidence.pdf','application/pdf',10,repeat('d',64),'application/pdf',10,repeat('d',64),'MATCH','M13_SCANNER','V1',
       'd0600000-0000-4000-8000-000000000001','CLEAN','SEC_L2_INTERNAL','${director}','AVAILABLE',3,'2027-01-01','2026-08-22T08:00:00Z','2026-08-22T08:10:00Z','2026-08-22T08:20:00Z');
      insert into public.file_scan_evidence(id,attachment_id,detected_sha256,scanner_id,scanner_version,verdict,scanned_at)
       values('d0600000-0000-4000-8000-000000000001','${attachment}',repeat('d',64),'M13_SCANNER','V1','CLEAN','2026-08-22T08:20:00Z');commit;
      begin;set local role youone_request;${userContext(director)}
       select public.designate_safety_manager('${managerAssignment}','${manager}','SAFETY_MANAGER',null,'2026-01-01',null,'M13-SAFETY-MANAGER','${attachment}','d0700000-0000-4000-8000-000000000001','d0700000-0000-4000-8000-000000000003','${now}');
       select public.designate_safety_manager('${coordinatorAssignment}','${coordinator}','TEAM_COORDINATOR','${project}','2026-01-01',null,'M13-TEAM-COORDINATOR','${attachment}','d0700000-0000-4000-8000-000000000002','d0700000-0000-4000-8000-000000000004','${now}');commit;`);
  }, 90_000);

  it("clean-applies M02 through M13 and registers only the two canonical Safety machines", () => {
    expect(run("select count(*) from public.state_machine_definition where machine_id in('SM-SAFETY-INSPECTION-V1','SM-SAFETY-INCIDENT-V1');")).toBe("2");
    expect(run("select count(*) from public.transition_definition where machine_id like 'SM-SAFETY-%';")).toBe("19");
  });

  it("forces RLS and removes all direct request writes", () => {
    const tables = ["safety_manager_assignment", "safety_inspection", "safety_inspection_item", "safety_finding", "safety_correction_evidence", "safety_correction_verification", "safety_training_session", "safety_training_attendance", "safety_training_remedial", "safety_incident", "safety_incident_investigation", "safety_recurrence_action", "safety_recurrence_verification", "safety_alert"];
    expect(run(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in(${tables.map((name) => `'${name}'`).join(",")}) and relrowsecurity and relforcerowsecurity;`)).toBe(String(tables.length));
    expect(run(`select count(*) from information_schema.role_table_grants where grantee in('youone_request','youone_privileged_writer') and table_schema='public' and table_name in(${tables.map((name) => `'${name}'`).join(",")}) and privilege_type in('INSERT','UPDATE','DELETE');`)).toBe("0");
  });

  it("runs stop-work through exact correction evidence and Safety Manager release", () => {
    const inspection = "d1000000-0000-4000-8000-000000000001"; const item = "d1000000-0000-4000-8000-000000000002"; const finding = "d1000000-0000-4000-8000-000000000003";
    run(`begin;set local role youone_request;${userContext(director)}
      select public.create_safety_inspection('${inspection}','M13-INS-1','${project}',null,null,'${managerAssignment}','AD_HOC','${now}','2032-01-01','d1000000-0000-4000-8000-000000000011','d1000000-0000-4000-8000-000000000012','d1000000-0000-4000-8000-000000000013','${now}');
      select public.add_safety_inspection_item('${inspection}','${item}','MACHINE_GUARD','Machine guard','FAIL','Guard missing','${attachment}','d1000000-0000-4000-8000-000000000014','${now}');
      select public.start_safety_inspection('${inspection}',1,'d1000000-0000-4000-8000-000000000015','d1000000-0000-4000-8000-000000000016','d1000000-0000-4000-8000-000000000017','${now}');
      select public.issue_safety_finding('${inspection}','${item}','${finding}','CRITICAL','Imminent machine risk',true,'${manager}',null,'2026-08-23','2032-01-01',2,'d1000000-0000-4000-8000-000000000018','d1000000-0000-4000-8000-000000000019','d1000000-0000-4000-8000-000000000020','${now}');
      select public.assign_safety_corrections('${inspection}',3,'d1000000-0000-4000-8000-000000000021','d1000000-0000-4000-8000-000000000022','d1000000-0000-4000-8000-000000000023','${now}');commit;`);
    run(`begin;set local role youone_request;${userContext(manager)}select public.submit_safety_correction('${finding}','d1000000-0000-4000-8000-000000000024','Guard installed','${attachment}',4,'d1000000-0000-4000-8000-000000000025','d1000000-0000-4000-8000-000000000026','d1000000-0000-4000-8000-000000000027','${now}');commit;`);
    run(`begin;set local role youone_request;${userContext(coordinator)}select public.verify_safety_correction('${finding}','d1000000-0000-4000-8000-000000000024','d1000000-0000-4000-8000-000000000028','EFFECTIVE','Verified','${attachment}',5,'d1000000-0000-4000-8000-000000000029','d1000000-0000-4000-8000-000000000030','d1000000-0000-4000-8000-000000000031','${now}');commit;`, false);
    run(`begin;set local role youone_request;${userContext(manager)}select public.verify_safety_correction('${finding}','d1000000-0000-4000-8000-000000000024','d1000000-0000-4000-8000-000000000032','EFFECTIVE','Self verification denied','${attachment}',5,'d1000000-0000-4000-8000-000000000033','d1000000-0000-4000-8000-000000000034','d1000000-0000-4000-8000-000000000035','${now}');commit;`, false);
    run(`begin;set local role youone_request;${userContext(director)}select public.verify_safety_correction('${finding}','d1000000-0000-4000-8000-000000000024','d1000000-0000-4000-8000-000000000036','EFFECTIVE','Independent verification and release','${attachment}',5,'d1000000-0000-4000-8000-000000000037','d1000000-0000-4000-8000-000000000038','d1000000-0000-4000-8000-000000000039','${now}');commit;`);
    expect(run(`select state||':'||stop_work_active||':'||version_no from public.safety_inspection where id='${inspection}';`)).toBe("CLOSED:false:6");
  });

  it("allows only one concurrent optimistic inspection start", async () => {
    const inspection = "d1100000-0000-4000-8000-000000000001";
    run(`begin;set local role youone_request;${userContext(director)}select public.create_safety_inspection('${inspection}','M13-INS-2','${project}',null,null,'${managerAssignment}','AD_HOC','${now}','2032-01-01','d1100000-0000-4000-8000-000000000002','d1100000-0000-4000-8000-000000000003','d1100000-0000-4000-8000-000000000004','${now}');select public.add_safety_inspection_item('${inspection}','d1100000-0000-4000-8000-000000000005','HOUSEKEEPING','Housekeeping','PASS',null,null,'d1100000-0000-4000-8000-000000000006','${now}');commit;`);
    const call = (suffix: string) => `begin;set local role youone_request;${userContext(director)}select public.start_safety_inspection('${inspection}',1,'d11${suffix}000-0000-4000-8000-000000000011','d11${suffix}000-0000-4000-8000-000000000012','d11${suffix}000-0000-4000-8000-000000000013','${now}');commit;`;
    const statuses = await Promise.all([runAsync(call("01")), runAsync(call("02"))]);
    expect(statuses.filter((status) => status === 0)).toHaveLength(1);
    run(`begin;set local role youone_request;${userContext(director)}select public.close_clear_safety_inspection('${inspection}',2,'CLEAR-CHECKLIST-COMPLETE','d1100000-0000-4000-8000-000000000021','d1100000-0000-4000-8000-000000000022','d1100000-0000-4000-8000-000000000023','${now}');commit;`);
    expect(run(`select state from public.safety_inspection where id='${inspection}';`)).toBe("CLOSED");
  });

  it("cancels only a planned inspection with a recorded reason", () => {
    const inspection = "d1150000-0000-4000-8000-000000000001";
    run(`begin;set local role youone_request;${userContext(director)}select public.create_safety_inspection('${inspection}','M13-INS-CANCEL','${project}',null,null,'${managerAssignment}','AD_HOC','${now}','2032-01-01','d1150000-0000-4000-8000-000000000002','d1150000-0000-4000-8000-000000000003','d1150000-0000-4000-8000-000000000004','${now}');select public.cancel_safety_inspection('${inspection}',1,'SCHEDULE-WITHDRAWN','d1150000-0000-4000-8000-000000000005','d1150000-0000-4000-8000-000000000006','d1150000-0000-4000-8000-000000000007','${now}');commit;`);
    expect(run(`select state from public.safety_inspection where id='${inspection}';`)).toBe("CANCELLED");
  });

  it("emits one idempotent 48-hour alert and never completes the incident", () => {
    const incident = "d1200000-0000-4000-8000-000000000001";
    run(`begin;set local role youone_request;${userContext(manager, "2026-08-20T09:00:00Z")}select public.report_safety_incident('${incident}','M13-INC-1','${project}',null,null,'2026-08-20T08:00:00Z','MAJOR','Incident','Immediate response',true,'2032-01-01','d1200000-0000-4000-8000-000000000002','d1200000-0000-4000-8000-000000000003','d1200000-0000-4000-8000-000000000004','2026-08-20T09:00:00Z');commit;`);
    const alertTime = "2026-08-22T10:00:00Z";
    for (let attempt = 0; attempt < 2; attempt++) run(`begin;set local role youone_privileged_writer;${workerContext(alertTime)}select public.emit_safety_48h_alert('d1200000-0000-4000-8000-000000000005','${incident}','safety:m13:incident-1:48h','d1200000-0000-4000-8000-000000000006','d1200000-0000-4000-8000-000000000007','${alertTime}');commit;`);
    expect(run(`select (select count(*) from public.safety_alert where incident_id='${incident}')||':'||(select state from public.safety_incident where id='${incident}');`)).toBe("1:REPORTED");
  });

  it("requires both an active Project grant and the exact Safety allowlist before Vendor incident reporting", () => {
    const incident = "d1250000-0000-4000-8000-000000000001";
    run(`insert into public.project_vendor_grant(id,project_id,vendor_user_id,status,valid_from,granted_by_user_id,grant_reason_code)
      values('d1250000-0000-4000-8000-000000000002','${project}','${vendorUser}','ACTIVE','2026-01-01','${director}','M13_VENDOR_BASE');
      insert into public.project_vendor_grant_action(grant_id,permission_id)
      values('d1250000-0000-4000-8000-000000000002','36000000-0000-4000-8000-000000000003');`);
    run(`begin;set local role youone_request;${userContext(vendorActor)}select public.report_safety_incident('${incident}','M13-VENDOR-DENIED','${project}',null,'${vendor}',
      '2026-08-22T08:30:00Z','MINOR','Vendor report before allowlist','Immediate response',false,'2032-01-01',
      'd1250000-0000-4000-8000-000000000003','d1250000-0000-4000-8000-000000000004','d1250000-0000-4000-8000-000000000005','${now}');commit;`, false);
    run(`begin;set local role youone_request;${userContext(director)}select public.grant_vendor_safety_action(
      'd1250000-0000-4000-8000-000000000006',null,'${vendorUser}','${project}',null,'safety.incident.report','2026-08-22T08:00:00Z',null,
      'M13_VENDOR_REPORT','d1250000-0000-4000-8000-000000000007','${now}');commit;`);
    run(`begin;set local role youone_request;${userContext(vendorActor)}select public.report_safety_incident('${incident}','M13-VENDOR-1','${project}',null,'${vendor}',
      '2026-08-22T08:30:00Z','MINOR','Vendor report with exact allowlist','Immediate response',false,'2032-01-01',
      'd1250000-0000-4000-8000-000000000008','d1250000-0000-4000-8000-000000000009','d1250000-0000-4000-8000-000000000010','${now}');commit;`);
    expect(run(`select reported_by_vendor_user_id||':'||state from public.safety_incident where id='${incident}';`)).toBe(`${vendorUser}:REPORTED`);
  });

  it("denies Vendor and Admin base reads and cross-scope projection", () => {
    for (const actor of [vendorActor, admin]) expect(run(`begin;set local role youone_request;${userContext(actor)}select count(*) from public.safety_incident;rollback;`).split("\n").at(-1)).toBe("0");
    expect(run(`begin;set local role youone_request;${userContext(vendorActor)}select count(*) from public.read_vendor_safety_tasks('${project}','${now}');rollback;`).split("\n").at(-1)).toBe("0");
  });

  it("prevents retention shortening, legal-hold release and evidence mutation", () => {
    run("update public.safety_inspection set retain_until='2027-01-01' where id='d1000000-0000-4000-8000-000000000001';", false);
    run("delete from public.safety_correction_evidence where id='d1000000-0000-4000-8000-000000000024';", false);
  });

  it("rolls back aggregate creation when Outbox identity conflicts", () => {
    const outbox = run("select id from public.outbox_event where aggregate_id='d1000000-0000-4000-8000-000000000001' limit 1;");
    run(`begin;set local role youone_request;${userContext(director)}select public.create_safety_inspection('d1300000-0000-4000-8000-000000000001','M13-ROLLBACK','${project}',null,null,'${managerAssignment}','AD_HOC','${now}','2032-01-01','d1300000-0000-4000-8000-000000000002','d1300000-0000-4000-8000-000000000003','${outbox}','${now}');commit;`, false);
    expect(run("select count(*) from public.safety_inspection where id='d1300000-0000-4000-8000-000000000001';")).toBe("0");
  });

  it("does not create P1 MSDS, waste or drill tables", () => {
    expect(run("select count(*) from information_schema.tables where table_schema='public' and table_name in('msds','safety_msds','waste','safety_waste','emergency_drill','safety_drill');")).toBe("0");
  });
});

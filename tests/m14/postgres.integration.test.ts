import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.M14_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrationNames = [
  "20260821000100_m02_database_audit_kernel.sql", "20260821000200_m03_auth_rbac_scope.sql",
  "20260822000300_m04_approval_engine.sql", "20260822000400_m05_document_file.sql",
  "20260822000500_m06_project_wbs.sql", "20260822000600_m07_vendor_contract.sql",
  "20260822000700_m08_quality_inspection.sql", "20260822000800_m09_ncr_car.sql",
  "20260822000900_m10_ecr_eco.sql", "20260822001000_m11_purchase_rnd.sql",
  "20260822001100_m12_research_note.sql", "20260822001200_m13_safety_light.sql",
  "20260822001300_m14_controlled_copy.sql",
];
const migrations = migrationNames.map((name) => readFileSync(resolve(import.meta.dirname, `../../supabase/migrations/${name}`), "utf8")).join("\n");
const dbDescribe = url === undefined ? describe.skip : describe;
const now = "2026-08-22T09:00:00Z";
const org = "e0000000-0000-4000-8000-000000000001";
const owner = "e0000000-0000-4000-8000-000000000002";
const director = "e0000000-0000-4000-8000-000000000003";
const admin = "e0000000-0000-4000-8000-000000000004";
const vendorActor = "e0000000-0000-4000-8000-000000000005";
const vendor = "e0000000-0000-4000-8000-000000000006";
const vendorUser = "e0000000-0000-4000-8000-000000000007";
const project = "e0000000-0000-4000-8000-000000000008";
const contract = "e0000000-0000-4000-8000-000000000009";
const document = "e0000000-0000-4000-8000-000000000010";
const version = "e0000000-0000-4000-8000-000000000011";
const source = "e0000000-0000-4000-8000-000000000012";
const output = "e0000000-0000-4000-8000-000000000013";
const evidence = "e0000000-0000-4000-8000-000000000014";
const copy = "e0000000-0000-4000-8000-000000000015";

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("M14_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url], { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}
function runAsync(sql: string): Promise<number | null> {
  if (url === undefined) throw new Error("M14_TEST_DATABASE_URL required");
  return new Promise((done) => { const child = spawn(psql, ["-X", "--no-psqlrc", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url]); child.stdin.end(sql); child.on("close", done); });
}
function userContext(actor: string, at = now, correlation = "request:m14-db"): string { return `select set_config('app.actor_kind','USER',true);select set_config('app.actor_user_id','${actor}',true);
 select set_config('app.effective_actor_user_id','${actor}',true);select set_config('app.anonymous_subject_fingerprint','',true);
 select set_config('app.system_actor_id','',true);select set_config('app.correlation_id','${correlation}',true);select set_config('app.causation_id','',true);
 select set_config('app.request_time','${at}',true);select set_config('app.acting_authority_id','',true);`; }
function workerContext(systemActor: string, at = now): string { return `select set_config('app.actor_kind','SYSTEM',true);select set_config('app.actor_user_id','',true);
 select set_config('app.effective_actor_user_id','',true);select set_config('app.anonymous_subject_fingerprint','',true);
 select set_config('app.system_actor_id','${systemActor}',true);select set_config('app.correlation_id','worker:m14-${systemActor}',true);
 select set_config('app.causation_id','',true);select set_config('app.request_time','${at}',true);select set_config('app.acting_authority_id','',true);`; }
function ids(prefix: string): string[] { return Array.from({ length: 12 }, (_, index) => `${prefix}0000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`); }

dbDescribe.sequential("M14 PostgreSQL controlled-copy boundary", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M14 test DB required");
    run(migrations);
    run(`insert into public.organization(id,stable_code,legal_name,status) values('${org}','M14_ORG','M14 Org','ACTIVE');
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values
       ('${owner}','m14-owner','INTERNAL','ACTIVE','2026-01-01'),('${director}','m14-director','INTERNAL','ACTIVE','2026-01-01'),
       ('${admin}','m14-admin','INTERNAL','ACTIVE','2026-01-01'),('${vendorActor}','m14-vendor','VENDOR','ACTIVE','2026-01-01');
      insert into public.user_organization_assignment(id,user_id,organization_id,valid_from,grant_reason_code) values
       ('e0100000-0000-4000-8000-000000000001','${owner}','${org}','2026-01-01','M14_FIXTURE'),
       ('e0100000-0000-4000-8000-000000000002','${director}','${org}','2026-01-01','M14_FIXTURE'),
       ('e0100000-0000-4000-8000-000000000003','${admin}','${org}','2026-01-01','M14_FIXTURE');
      insert into public.user_position_assignment(id,user_id,position_id,valid_from,is_primary,grant_reason_code) values
       ('e0200000-0000-4000-8000-000000000001','${director}','10000000-0000-4000-8000-000000000003','2026-01-01',true,'M14_FIXTURE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code) values
       ('e0300000-0000-4000-8000-000000000001','${owner}','20000000-0000-4000-8000-000000000001','2026-01-01','M14_FIXTURE'),
       ('e0300000-0000-4000-8000-000000000002','${director}','20000000-0000-4000-8000-000000000003','2026-01-01','M14_FIXTURE'),
       ('e0300000-0000-4000-8000-000000000003','${admin}','20000000-0000-4000-8000-000000000006','2026-01-01','M14_FIXTURE'),
       ('e0300000-0000-4000-8000-000000000004','${vendorActor}','20000000-0000-4000-8000-000000000005','2026-01-01','M14_FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
       select ('e0400000-0000-4000-8000-'||lpad(row_number() over(order by p.id)::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000001',p.id,'2026-01-01','M14_FIXTURE'
       from public.permission p where p.stable_code like 'technical_document.copy.%';
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
       select ('e0410000-0000-4000-8000-'||lpad(row_number() over(order by p.id)::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000003',p.id,'2026-01-01','M14_FIXTURE'
       from public.permission p where p.stable_code in('approval.step.approve','approval.instance.read');
      insert into public.vendor(id,vendor_code,legal_name,status) values('${vendor}','M14_VENDOR','M14 Vendor','ACTIVE');
      insert into public.vendor_user(id,vendor_id,user_id,status,valid_from,granted_by_user_id,grant_reason_code)
       values('${vendorUser}','${vendor}','${vendorActor}','ACTIVE','2026-01-01','${owner}','M14_FIXTURE');
      insert into public.project(id,project_code,name,organization_id,owner_user_id,objective,period_start,period_end,visibility_code,state,version_no,created_at,updated_at)
       values('${project}','M14_PROJECT','Controlled copy project','${org}','${owner}','Controlled delivery','2026-01-01','2026-12-31','MEMBERS_ONLY','ACTIVE',1,'${now}','${now}');
      insert into public.vendor_contract(id,contract_no,vendor_id,manager_user_id,title,state,version_no,created_at,updated_at)
       values('${contract}','M14-CONTRACT','${vendor}','${owner}','Controlled copy contract','ACTIVE',1,'${now}','${now}');
      insert into public.contract_project(id,contract_id,project_id,valid_from) values('e0500000-0000-4000-8000-000000000001','${contract}','${project}','2026-01-01');
      insert into public.project_vendor_grant(id,project_id,vendor_user_id,status,valid_from,granted_by_user_id,grant_reason_code)
       values('e0500000-0000-4000-8000-000000000002','${project}','${vendorUser}','ACTIVE','2026-01-01','${owner}','M14_FIXTURE');
      insert into public.project_vendor_grant_action(grant_id,permission_id) select 'e0500000-0000-4000-8000-000000000002',id from public.permission where stable_code='technical_document.copy.custody';
      begin;
      insert into public.document_content_validation_evidence(id,editor_schema_version,content_checksum,validator_id,validator_version,outcome,validated_at)
       values('e0600000-0000-4000-8000-000000000001','EDITOR_SCHEMA_V1',repeat('1',64),'M14_VALIDATOR','V1','VALID','${now}');
      insert into public.document(id,document_no,document_type_id,title,owner_organization_id,owner_user_id,security_level,retention_policy_id,current_version_id,current_version_no,lifecycle_state,row_version,created_at,updated_at)
       values('${document}','M14-DOC','DOC_GENERAL','M14 L3 technical document','${org}','${owner}','SEC_L3_CONFIDENTIAL','RETENTION_COMPANY_POLICY','${version}',1,'DRAFT',0,'${now}','${now}');
      insert into public.document_version(id,document_id,version_no,template_source,editor_schema_version,content_validation_evidence_id,renderer_id,renderer_version,
       security_level_snapshot,editor_content,content_checksum,sealed_manifest_schema,sealed_manifest_version,sealed_snapshot_checksum,sealed_manifest_evidence_id,
       creation_reason_code,author_user_id,state,row_version,created_at,sealed_at,decided_at)
       values('${version}','${document}',1,'FREE_FORM','EDITOR_SCHEMA_V1','e0600000-0000-4000-8000-000000000001','M14_RENDERER','V1',
       'SEC_L3_CONFIDENTIAL','{}',repeat('1',64),null,null,null,null,'M14_FIXTURE','${owner}','DRAFT',0,'${now}',null,null);
      ${[source, output, evidence].map((attachment, index) => `insert into public.attachment(id,storage_provider,bucket_code,storage_key,declared_mime_type,declared_size_bytes,expected_sha256,detected_mime_type,detected_size_bytes,detected_sha256,signature_validation,scanner_id,scanner_version,scan_evidence_id,scan_verdict,security_level,uploader_user_id,state,row_version,intent_expires_at,created_at,verified_at,scanned_at)
       values('${attachment}','SUPABASE_PRIVATE','PRIVATE_BUSINESS','private/m14/${index}/controlled-copy.pdf','application/pdf',10,repeat('${index + 3}',64),'application/pdf',10,repeat('${index + 3}',64),'MATCH','M14_SCANNER','V1','e0610000-0000-4000-8000-00000000000${index + 1}','CLEAN','SEC_L3_CONFIDENTIAL','${owner}','AVAILABLE',3,'2027-01-01','${now}','${now}','${now}');
      insert into public.file_scan_evidence(id,attachment_id,detected_sha256,scanner_id,scanner_version,verdict,scanned_at)
       values('e0610000-0000-4000-8000-00000000000${index + 1}','${attachment}',repeat('${index + 3}',64),'M14_SCANNER','V1','CLEAN','${now}');`).join("\n")}
      insert into public.document_attachment(document_version_id,attachment_id,purpose_code,linked_by_user_id,linked_at) values('${version}','${source}','SOURCE_PDF','${owner}','${now}');
      select set_config('app.document_transition','M14_FIXTURE_SEAL',true);
      update public.document_version set sealed_manifest_schema='DOCUMENT_SEALED_MANIFEST',sealed_manifest_version=1,sealed_snapshot_checksum=repeat('2',64),
       sealed_manifest_evidence_id='e0600000-0000-4000-8000-000000000002',state='APPROVED',row_version=1,sealed_at='${now}',decided_at='${now}' where id='${version}';
      update public.document set lifecycle_state='APPROVED',row_version=1,updated_at='${now}' where id='${document}';
      insert into public.document_seal_evidence(id,document_version_id,document_id,version_no,manifest_schema,manifest_version,manifest_checksum,sealed_at)
       values('e0600000-0000-4000-8000-000000000002','${version}','${document}',1,'DOCUMENT_SEALED_MANIFEST',1,repeat('2',64),'${now}');commit;
      insert into public.approval_policy(id,stable_code,status) values('e0700000-0000-4000-8000-000000000001','M14_L3_COPY','ACTIVE');
      insert into public.approval_policy_version(id,policy_id,version_no,state,subject_kind,checksum,valid_from,created_by_user_id)
       values('e0700000-0000-4000-8000-000000000002','e0700000-0000-4000-8000-000000000001',1,'DRAFT','TECHNICAL_DOCUMENT_COPY_REQUEST',repeat('7',64),'2026-01-01','${owner}');
      insert into public.approval_policy_step_rule(id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required)
       values('e0700000-0000-4000-8000-000000000003','e0700000-0000-4000-8000-000000000002','LAB_DIRECTOR_APPROVAL',1,'APPROVAL','SEQUENTIAL',true);
      insert into public.approval_policy_participant_rule(id,step_rule_id,selector_kind,position_id)
       values('e0700000-0000-4000-8000-000000000004','e0700000-0000-4000-8000-000000000003','POSITION','10000000-0000-4000-8000-000000000003');
      update public.approval_policy_version set state='PUBLISHED' where id='e0700000-0000-4000-8000-000000000002';`);
  }, 90_000);

  it("clean-applies M02 through M14 and registers the canonical non-terminal RETURNED state", () => {
    expect(run("select is_terminal from public.state_definition where machine_id='SM-TECHDOC-COPY-V1' and state_id='RETURNED';")).toBe("f");
    expect(run("select count(*) from public.transition_definition where machine_id='SM-TECHDOC-COPY-V1';")).toBe("15");
  });

  it("forces RLS and exposes no direct request or writer mutation", () => {
    const tables = ["technical_document_copy", "approval_subject_technical_copy_request", "technical_copy_document_project_scope", "technical_copy_document_contract_scope", "technical_copy_custody_event", "technical_copy_vendor_projection_allowlist", "technical_copy_overdue_alert"];
    expect(run(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in(${tables.map((name) => `'${name}'`).join(",")}) and relrowsecurity and relforcerowsecurity;`)).toBe(String(tables.length));
    expect(run(`select count(*) from information_schema.role_table_grants where grantee in('youone_request','youone_privileged_writer') and table_schema='public' and table_name in(${tables.map((name) => `'${name}'`).join(",")}) and privilege_type in('INSERT','UPDATE','DELETE');`)).toBe("0");
  });

  it("requires Project grant and additionally exact Contract grant only for contract-bound Vendor recipients", () => {
    const projectOnly = "e1000000-0000-4000-8000-000000000001";
    const contractBound = "e1000000-0000-4000-8000-000000000002";
    const a = ids("e101");
    run(`begin;set local role youone_request;${userContext(owner)}select public.request_technical_document_copy('${projectOnly}','${version}','${source}','${project}',null,'${vendorActor}','${vendorUser}','Vendor recipient','EXTERNAL_REVIEW','Project-only delivery','2026-08-25',null,null,'${a[0]}','${a[1]}','${a[2]}','${a[3]}','${now}');commit;`);
    run(`begin;set local role youone_request;${userContext(owner)}select public.request_technical_document_copy('${contractBound}','${version}','${source}','${project}','${contract}','${vendorActor}','${vendorUser}','Vendor recipient','CONTRACT_DELIVERY','Contract delivery','2026-08-25',null,null,'${a[4]}','${a[5]}','${a[6]}','${a[7]}','${now}');commit;`, false);
    run(`insert into public.contract_vendor_grant(id,contract_id,project_id,vendor_user_id,status,valid_from,granted_by_user_id,grant_reason_code)
      values('e1000000-0000-4000-8000-000000000003','${contract}','${project}','${vendorUser}','ACTIVE','2026-01-01','${owner}','M14_FIXTURE');
      insert into public.contract_vendor_grant_action(grant_id,permission_id) select 'e1000000-0000-4000-8000-000000000003',id from public.permission where stable_code='technical_document.copy.custody';`);
    run(`begin;set local role youone_request;${userContext(owner)}select public.request_technical_document_copy('${contractBound}','${version}','${source}','${project}','${contract}','${vendorActor}','${vendorUser}','Vendor recipient','CONTRACT_DELIVERY','Contract delivery','2026-08-25',null,null,'${a[8]}','${a[9]}','${a[10]}','${a[11]}','${now}');commit;`);
    expect(run(`select count(*) from public.technical_copy_document_contract_scope where copy_id='${contractBound}';`)).toBe("1");
  });

  it("seals the exact request tuple into Approval and completes the L3 Director route", () => {
    const a = ids("e110");
    run(`insert into public.approval_policy(id,stable_code,status) values('e1090000-0000-4000-8000-000000000001','M14_BAD_L3_COPY','ACTIVE');
      insert into public.approval_policy_version(id,policy_id,version_no,state,subject_kind,checksum,valid_from,created_by_user_id)
       values('e1090000-0000-4000-8000-000000000002','e1090000-0000-4000-8000-000000000001',1,'DRAFT','TECHNICAL_DOCUMENT_COPY_REQUEST',repeat('9',64),'2026-01-01','${owner}');
      insert into public.approval_policy_step_rule(id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required)
       values('e1090000-0000-4000-8000-000000000003','e1090000-0000-4000-8000-000000000002','BAD_L3_ANY_ONE',1,'APPROVAL','ANY_ONE',true);
      insert into public.approval_policy_participant_rule(id,step_rule_id,selector_kind,position_id)
       values('e1090000-0000-4000-8000-000000000004','e1090000-0000-4000-8000-000000000003','POSITION','10000000-0000-4000-8000-000000000003');
      update public.approval_policy_version set state='PUBLISHED' where id='e1090000-0000-4000-8000-000000000002';
      insert into public.approval_policy(id,stable_code,status) values('e1090000-0000-4000-8000-000000000011','M14_BAD_L4_COPY','ACTIVE');
      insert into public.approval_policy_version(id,policy_id,version_no,state,subject_kind,checksum,valid_from,created_by_user_id)
       values('e1090000-0000-4000-8000-000000000012','e1090000-0000-4000-8000-000000000011',1,'DRAFT','TECHNICAL_DOCUMENT_COPY_REQUEST',repeat('8',64),'2026-01-01','${owner}');
      insert into public.approval_policy_step_rule(id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required)
       values('e1090000-0000-4000-8000-000000000013','e1090000-0000-4000-8000-000000000012','L4_DIRECTOR_ONLY',1,'APPROVAL','SEQUENTIAL',true);
      insert into public.approval_policy_participant_rule(id,step_rule_id,selector_kind,position_id)
       values('e1090000-0000-4000-8000-000000000014','e1090000-0000-4000-8000-000000000013','POSITION','10000000-0000-4000-8000-000000000003');
      update public.approval_policy_version set state='PUBLISHED' where id='e1090000-0000-4000-8000-000000000012';`);
    expect(run("select app_private.m14_policy_matrix_valid('e1090000-0000-4000-8000-000000000012','SEC_L4_CORE_SECRET');")).toBe("f");
    run(`begin;set local role youone_request;${userContext(owner)}select public.create_technical_copy_approval_instance('e1000000-0000-4000-8000-000000000001','e1090000-0000-4000-8000-000000000005','e1090000-0000-4000-8000-000000000002',repeat('9',64),null,1,'e1090000-0000-4000-8000-000000000006','e1090000-0000-4000-8000-000000000007','e1090000-0000-4000-8000-000000000008','${now}');commit;`, false);
    run(`begin;set local role youone_request;${userContext(owner)}
      select public.request_technical_document_copy('${copy}','${version}','${source}','${project}',null,'${vendorActor}','${vendorUser}','Vendor recipient','EXTERNAL_REVIEW','Controlled external review','2026-08-23',null,null,'${a[0]}','${a[1]}','${a[2]}','${a[3]}','${now}');
      select public.create_technical_copy_approval_instance('${copy}','e1100000-0000-4000-8000-000000000020','e0700000-0000-4000-8000-000000000002',repeat('7',64),null,1,
       '${a[4]}','${a[5]}','${a[6]}','${now}');
      select public.submit_technical_document_copy('${copy}',1,'${a[7]}','${a[8]}','${a[9]}','${a[10]}','e1100000-0000-4000-8000-000000000021','e1100000-0000-4000-8000-000000000022','e1100000-0000-4000-8000-000000000023','e1100000-0000-4000-8000-000000000024','${now}');commit;`);
    run(`begin;set local role youone_privileged_writer;${workerContext("APPROVAL_ENGINE")}
      select public.activate_approval_instance('e1100000-0000-4000-8000-000000000020',2,'e1100000-0000-4000-8000-000000000025','e1100000-0000-4000-8000-000000000026','e1100000-0000-4000-8000-000000000027','e1100000-0000-4000-8000-000000000028','${now}');commit;`);
    const step = run("select id from public.approval_step where instance_id='e1100000-0000-4000-8000-000000000020';");
    const participant = run(`select id from public.approval_participant where step_id='${step}';`);
    run(`begin;set local role youone_request;${userContext(director)}select public.perform_approval_action('e1100000-0000-4000-8000-000000000020','${step}','${participant}','APPROVE',3,1,1,
      'e1100000-0000-4000-8000-000000000040','e1100000-0000-4000-8000-000000000041','e1100000-0000-4000-8000-000000000042','e1100000-0000-4000-8000-000000000043',null,null,'${now}');commit;`, false);
    run(`begin;set local role youone_request;${userContext(director)}select public.perform_technical_copy_approval_action('e1100000-0000-4000-8000-000000000020','${step}','${participant}','APPROVE',3,1,1,
      'e1100000-0000-4000-8000-000000000029','e1100000-0000-4000-8000-000000000030','e1100000-0000-4000-8000-000000000031','e1100000-0000-4000-8000-000000000032',null,null,'${now}');commit;`);
    run(`begin;set local role youone_privileged_writer;${workerContext("APPROVAL_ENGINE")}select public.approve_technical_document_copy('${copy}',2,'e1100000-0000-4000-8000-000000000033','e1100000-0000-4000-8000-000000000034','e1100000-0000-4000-8000-000000000035','e1100000-0000-4000-8000-000000000036','${now}');commit;`);
    expect(run(`select c.state||':'||i.state||':'||(l.subject_checksum=c.request_snapshot_checksum) from public.technical_document_copy c join public.approval_instance i on i.id=c.approval_instance_id join public.approval_subject_technical_copy_request l on l.instance_id=i.id where c.id='${copy}';`)).toBe("APPROVED:COMPLETED:true");
  });

  it("renders internally, prints, records custody, and emits one idempotent overdue alert", () => {
    run(`begin;set local role youone_privileged_writer;${workerContext("DOCUMENT_ENGINE")}select public.render_technical_document_copy('${copy}',3,'${output}',repeat('8',64),'M14_RENDERER','V1','e1200000-0000-4000-8000-000000000001','e1200000-0000-4000-8000-000000000002','e1200000-0000-4000-8000-000000000003','e1200000-0000-4000-8000-000000000004','${now}');commit;`);
    run(`begin;set local role youone_request;${userContext(owner)}select public.print_technical_document_copy('${copy}',4,2,'PRINTER-01','e1200000-0000-4000-8000-000000000005','e1200000-0000-4000-8000-000000000006','e1200000-0000-4000-8000-000000000007','e1200000-0000-4000-8000-000000000008','${now}');select public.handover_technical_document_copy('${copy}',5,'${evidence}','e1200000-0000-4000-8000-000000000009','e1200000-0000-4000-8000-000000000013','e1200000-0000-4000-8000-000000000010','e1200000-0000-4000-8000-000000000011','e1200000-0000-4000-8000-000000000012','${now}');commit;`);
    run(`begin;set local role youone_privileged_writer;${workerContext("TECHCOPY_CUSTODY_MONITOR", "2026-08-24T09:00:00Z")}select public.mark_technical_copy_return_due('${copy}',6,'e1210000-0000-4000-8000-000000000001','e1210000-0000-4000-8000-000000000002','e1210000-0000-4000-8000-000000000003','e1210000-0000-4000-8000-000000000004','2026-08-24T09:00:00Z');select public.mark_technical_copy_overdue('e1210000-0000-4000-8000-000000000005','${copy}','m14:copy:overdue',7,'e1210000-0000-4000-8000-000000000006','e1210000-0000-4000-8000-000000000007','e1210000-0000-4000-8000-000000000008','e1210000-0000-4000-8000-000000000009','2026-08-24T09:00:00Z');commit;`);
    run(`begin;set local role youone_privileged_writer;${workerContext("TECHCOPY_CUSTODY_MONITOR", "2026-08-24T09:00:00Z")}select public.mark_technical_copy_overdue('e1210000-0000-4000-8000-000000000010','${copy}','m14:copy:overdue',8,'e1210000-0000-4000-8000-000000000011','e1210000-0000-4000-8000-000000000012','e1210000-0000-4000-8000-000000000013','e1210000-0000-4000-8000-000000000014','2026-08-24T09:00:00Z');commit;`);
    expect(run(`select state||':'||(select count(*) from public.technical_copy_overdue_alert where copy_id='${copy}') from public.technical_document_copy where id='${copy}';`)).toBe("OVERDUE:1");
  });

  it("reserves copy numbers at request time and permits only one optimistic concurrent transition", async () => {
    const c1 = "e1300000-0000-4000-8000-000000000001"; const c2 = "e1300000-0000-4000-8000-000000000002";
    const call = (id: string, offset: number) => { const a = ids(`e13${offset}`); return `begin;set local role youone_request;${userContext(owner, now, `request:m14-concurrent-${offset}`)}select public.request_technical_document_copy('${id}','${version}','${source}','${project}',null,'${vendorActor}','${vendorUser}','Vendor recipient','EXTERNAL_REVIEW','Concurrent copy','2026-08-25',null,null,'${a[0]}','${a[1]}','${a[2]}','${a[3]}','${now}');commit;`; };
    expect((await Promise.all([runAsync(call(c1, 1)), runAsync(call(c2, 2))])).filter((status) => status === 0)).toHaveLength(2);
    expect(run(`select count(distinct copy_no) from public.technical_document_copy where id in('${c1}','${c2}') and copy_no is not null;`)).toBe("2");
    const a = ids("e133");
    const transition = (offset: number) => `begin;set local role youone_request;${userContext(owner, "2026-08-24T10:00:00Z", `request:m14-close-${offset}`)}select public.close_technical_document_copy('${copy}','EVT-TECHCOPY-RETURN',8,'${evidence}',2,'RETURNED-ALL-PAGES','${a[offset]}','${a[offset + 2]}','${a[offset + 4]}','${a[offset + 6]}','2026-08-24T10:00:00Z');commit;`;
    expect((await Promise.all([runAsync(transition(0)), runAsync(transition(1))])).filter((status) => status === 0)).toHaveLength(1);
    expect(run(`select state from public.technical_document_copy where id='${copy}';`)).toBe("RETURNED");
    const reprint = "e1300000-0000-4000-8000-000000000003"; const r = ids("e134");
    run(`begin;set local role youone_request;${userContext(owner, "2026-08-24T11:00:00Z")}select public.request_technical_document_copy('${reprint}','${version}','${source}','${project}',null,'${vendorActor}','${vendorUser}','Vendor recipient','EXTERNAL_REVIEW','Controlled external review','2026-08-27','${copy}','DAMAGED-COPY-REPRINT','${r[0]}','${r[1]}','${r[2]}','${r[3]}','2026-08-24T11:00:00Z');commit;`);
    expect(run(`select (copy_no<>(select copy_no from public.technical_document_copy where id='${copy}'))||':'||(reprint_of_copy_id='${copy}') from public.technical_document_copy where id='${reprint}';`)).toBe("true:true");
  });

  it("denies Vendor and Admin-System raw rows, source, render, and print surfaces", () => {
    for (const actor of [vendorActor, admin]) expect(run(`begin;set local role youone_request;${userContext(actor)}select count(*) from public.technical_document_copy;rollback;`).split("\n").at(-1)).toBe("0");
    expect(run("select has_function_privilege('youone_request','public.render_technical_document_copy(uuid,bigint,uuid,text,text,text,uuid,uuid,uuid,uuid,timestamptz)','execute');")).toBe("f");
    run(`begin;set local role youone_request;${userContext(vendorActor)}select public.print_technical_document_copy('${copy}',9,2,'FORGED','e1400000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000002','e1400000-0000-4000-8000-000000000003','e1400000-0000-4000-8000-000000000004','${now}');rollback;`, false);
  });

  it("rolls back request, typed scope, audit and outbox together", () => {
    const conflictingOutbox = run(`select id from public.outbox_event where aggregate_id='${copy}' limit 1;`);
    run(`begin;set local role youone_request;${userContext(owner)}select public.request_technical_document_copy('e1500000-0000-4000-8000-000000000001','${version}','${source}','${project}',null,'${vendorActor}','${vendorUser}','Vendor recipient','EXTERNAL_REVIEW','Rollback','2026-08-25',null,null,'e1500000-0000-4000-8000-000000000002','e1500000-0000-4000-8000-000000000003','e1500000-0000-4000-8000-000000000004','${conflictingOutbox}','${now}');commit;`, false);
    expect(run("select count(*) from public.technical_document_copy where id='e1500000-0000-4000-8000-000000000001';")).toBe("0");
  });
});

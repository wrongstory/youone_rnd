import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.M05_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrations = [
  "20260821000100_m02_database_audit_kernel.sql",
  "20260821000200_m03_auth_rbac_scope.sql",
  "20260822000300_m04_approval_engine.sql",
  "20260822000400_m05_document_file.sql",
].map((name) => readFileSync(resolve(import.meta.dirname, `../../supabase/migrations/${name}`), "utf8")).join("\n");
const dbDescribe = url === undefined ? describe.skip : describe;
const now = "2026-08-22T09:00:00Z";
const owner = "59000000-0000-4000-8000-000000000001";
const vendor = "59000000-0000-4000-8000-000000000002";
const director = "59000000-0000-4000-8000-000000000007";
const organization = "59000000-0000-4000-8000-000000000003";
const documentId = "59000000-0000-4000-8000-000000000010";
const versionId = "59000000-0000-4000-8000-000000000011";
const attachmentId = "59000000-0000-4000-8000-000000000012";

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("M05_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url], { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}

function runAsync(sql: string): Promise<number | null> {
  if (url === undefined) throw new Error("M05_TEST_DATABASE_URL required");
  return new Promise((resolvePromise) => {
    const child = spawn(psql, ["-X", "--no-psqlrc", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url]);
    child.stdin.end(sql);
    child.on("close", resolvePromise);
  });
}

function requestContext(actor = owner, actorKind = "USER", systemActor = ""): string {
  return `
    select set_config('app.actor_kind','${actorKind}',true);
    select set_config('app.actor_user_id','${actorKind === "USER" ? actor : ""}',true);
    select set_config('app.effective_actor_user_id','${actorKind === "USER" ? actor : ""}',true);
    select set_config('app.anonymous_subject_fingerprint','',true);
    select set_config('app.system_actor_id','${systemActor}',true);
    select set_config('app.correlation_id','request:m05-db',true);
    select set_config('app.causation_id','',true);
    select set_config('app.request_time','${now}',true);
    select set_config('app.acting_authority_id','',true);`;
}

dbDescribe.sequential("M05 PostgreSQL document/file boundary", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M05 test DB required");
    run(migrations);
    run(`
      insert into public.organization(id,stable_code,legal_name,status) values('${organization}','M05_ORG','M05 Org','ACTIVE');
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values
        ('${owner}','m05-owner','INTERNAL','ACTIVE','2026-01-01'),
        ('${vendor}','m05-vendor','VENDOR','ACTIVE','2026-01-01'),
        ('${director}','m05-director','INTERNAL','ACTIVE','2026-01-01');
      insert into public.user_organization_assignment(id,user_id,organization_id,valid_from,grant_reason_code)
        values('59000000-0000-4000-8000-000000000004','${owner}','${organization}','2026-01-01','M05_FIXTURE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code) values
        ('59000000-0000-4000-8000-000000000005','${owner}','20000000-0000-4000-8000-000000000001','2026-01-01','M05_FIXTURE'),
        ('59000000-0000-4000-8000-000000000006','${vendor}','20000000-0000-4000-8000-000000000005','2026-01-01','M05_FIXTURE'),
        ('59000000-0000-4000-8000-000000000008','${director}','20000000-0000-4000-8000-000000000003','2026-01-01','M05_FIXTURE');
      insert into public.user_position_assignment(id,user_id,position_id,valid_from,is_primary,grant_reason_code)
        values('59000000-0000-4000-8000-000000000009','${director}','10000000-0000-4000-8000-000000000003','2026-01-01',true,'M05_FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
      select ('59100000-0000-4000-8000-'||lpad(row_number() over(order by id)::text,12,'0'))::uuid,
        '20000000-0000-4000-8000-000000000001',id,'2026-01-01','M05_FIXTURE'
      from public.permission where stable_code in('document.template.manage','document.version.create','document.version.edit','document.version.seal',
        'document.version.submit','technical_document.content.preview','file.attachment.upload','technical_document.content.download','approval.instance.submit');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code) values
        ('59100000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000003','34000000-0000-4000-8000-000000000004','2026-01-01','M05_FIXTURE'),
        ('59100000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000003','34000000-0000-4000-8000-000000000005','2026-01-01','M05_FIXTURE');
      insert into public.user_security_entitlement_assignment(id,user_id,entitlement_id,valid_from,grant_reason_code)
        values('59100000-0000-4000-8000-000000000022','${owner}','35100000-0000-4000-8000-000000000001','2026-01-01','M05_FIXTURE');
    `);
  }, 30_000);

  it("applies M02 through M05 to a clean database", () => {
    expect(run("select count(*) from information_schema.tables where table_schema='public' and table_name in ('template_version','document','document_version','attachment','document_attachment','approval_subject_document_version');")).toBe("6");
    expect(run("select count(*) from pg_constraint where conname in ('document_content_validation_evidence_fk','document_seal_evidence_exact_fk','attachment_scan_evidence_fk');")).toBe("3");
  });

  it("forces RLS and returns zero rows for an untrusted or absent actor", () => {
    expect(run(`begin; set local role youone_request; ${requestContext()} select count(*) from public.document; rollback;`).split("\n").at(-1)).toBe("0");
    expect(run(`begin; set local role youone_request; ${requestContext()} select count(*) from public.document_version; rollback;`).split("\n").at(-1)).toBe("0");
    expect(run("select count(*) from pg_class where relnamespace='public'::regnamespace and relname in ('document','document_version','attachment','document_attachment') and relrowsecurity and relforcerowsecurity;")).toBe("4");
  });

  it("denies direct request and privileged-writer table mutation", () => {
    run(`begin; set local role youone_request; ${requestContext()} insert into public.document_type_definition(stable_code) values('FORGED'); rollback;`, false);
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "FILE_SCANNER")} insert into public.file_mime_type_definition(mime_type) values('text/html'); rollback;`, false);
  });

  it("does not grant raw editor content, private object coordinates or evidence tables", () => {
    expect(run("select has_column_privilege('youone_request','public.document_version','editor_content','select')||':'||has_column_privilege('youone_request','public.attachment','storage_key','select');")).toBe("false:false");
    expect(run("select has_table_privilege('youone_request','public.document_seal_evidence','select')||':'||has_table_privilege('youone_request','public.file_scan_evidence','select');")).toBe("false:false");
  });

  it("exposes guarded delivery only to request role and scanner commands only to writer", () => {
    expect(run("select has_function_privilege('youone_request','public.request_attachment_delivery(uuid,uuid,text,integer,uuid,timestamptz)','execute')||':'||has_function_privilege('youone_privileged_writer','public.request_attachment_delivery(uuid,uuid,text,integer,uuid,timestamptz)','execute');")).toBe("true:false");
    expect(run("select has_function_privilege('youone_request','public.complete_attachment_scan(uuid,bigint,text,text,text,uuid,text,text,uuid,uuid,uuid,timestamptz)','execute')||':'||has_function_privilege('youone_privileged_writer','public.complete_attachment_scan(uuid,bigint,text,text,text,uuid,text,text,uuid,uuid,uuid,timestamptz)','execute');")).toBe("false:true");
  });

  it("creates and seals a template through guarded commands", () => {
    const checksum = run("select encode(extensions.digest(convert_to('{}'::jsonb::text||'|'||'{}'::jsonb::text,'UTF8'),'sha256'),'hex');");
    run(`begin; set local role youone_request; ${requestContext()}
      select public.create_template_draft('59200000-0000-4000-8000-000000000001','59200000-0000-4000-8000-000000000002','M05_GENERAL_TEMPLATE',
        'DOC_GENERAL','EDITOR_SCHEMA_V1','{}'::jsonb,'{}'::jsonb,'${checksum}','59200000-0000-4000-8000-000000000003','${now}');
      select public.seal_template_version('59200000-0000-4000-8000-000000000002',1,'59200000-0000-4000-8000-000000000004','${now}'); commit;`);
    expect(run("select state||':'||row_version from public.template_version where id='59200000-0000-4000-8000-000000000002';")).toBe("SEALED:2");
    run("update public.template_version set template_content='{\"forged\":true}' where id='59200000-0000-4000-8000-000000000002';", false);
  });

  it("validates canonical content, creates a draft, and denies hash/request tampering", () => {
    const contentChecksum = run("select app_private.canonical_json_sha256('{}'::jsonb);");
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "DOCUMENT_VALIDATOR")}
      select public.record_document_content_validation('59300000-0000-4000-8000-000000000001','EDITOR_SCHEMA_V1','${contentChecksum}',
        'VALIDATOR_CANONICAL','VALIDATOR_V1','VALID','59300000-0000-4000-8000-000000000002','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext()}
      select public.create_document_draft('${documentId}','${versionId}','M05-DOC-001','DOC_GENERAL','M05 document','${organization}',
        'SEC_L2_INTERNAL','RETENTION_COMPANY_POLICY','FREE_FORM',null,'EDITOR_SCHEMA_V1','59300000-0000-4000-8000-000000000001',
        'RENDERER_CANONICAL','RENDERER_V1','{}'::jsonb,'${contentChecksum}','INITIAL_CREATE',
        '59300000-0000-4000-8000-000000000003','59300000-0000-4000-8000-000000000004','${now}'); commit;`);
    expect(run(`begin; set local role youone_request; ${requestContext()} select allowed from public.request_document_content('${versionId}','59300000-0000-4000-8000-000000000005','${now}'); rollback;`).split("\n").at(-1)).toBe("t");
    run(`begin; set local role youone_request; ${requestContext()}
      select public.edit_document_draft('${versionId}',1,'{\"forged\":true}'::jsonb,'${contentChecksum}','59300000-0000-4000-8000-000000000001','RENDERER_V2',
        '59300000-0000-4000-8000-000000000006','${now}'); rollback;`, false);
    expect(run(`begin; set local role youone_request; ${requestContext(vendor)} select count(*) from public.document; rollback;`).split("\n").at(-1)).toBe("0");
    expect(run(`begin; set local role youone_request; ${requestContext(vendor)} select allowed from public.request_document_content('${versionId}','59300000-0000-4000-8000-000000000007','${now}'); rollback;`).split("\n").at(-1)).toBe("f");
  });

  it("allows draft-only classification change before attachments, then verifies, seals and privately delivers", () => {
    run(`begin; set local role youone_request; ${requestContext()}
      select public.update_document_draft_security('${versionId}',1,1,'SEC_L3_CONFIDENTIAL','59400000-0000-4000-8000-000000000001','${now}'); commit;`);
    const fileHash = "a".repeat(64);
    expect(run(`begin; set local role youone_request; ${requestContext()}
      select storage_key from public.create_attachment_upload_intent('${attachmentId}','${versionId}','PRIMARY_EVIDENCE','application/pdf',128,'${fileHash}',60,
        '59400000-0000-4000-8000-000000000003','59400000-0000-4000-8000-000000000004','${now}'); commit;`).split("\n").at(-1)).toBe(`private/documents/${documentId}/${versionId}/${attachmentId}`);
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "FILE_INGEST")}
      select public.record_attachment_uploaded('${attachmentId}',1,'application/pdf',128,'${fileHash}','59400000-0000-4000-8000-000000000005',
        '59400000-0000-4000-8000-000000000006','${now}'); commit;`);
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "FILE_SCANNER")}
      select public.start_attachment_scan('${attachmentId}',2,'59400000-0000-4000-8000-000000000007','59400000-0000-4000-8000-000000000008','${now}');
      select public.complete_attachment_scan('${attachmentId}',3,'MATCH','SCANNER_ENGINE','SCANNER_V1','59400000-0000-4000-8000-000000000009','CLEAN',null,
        '59400000-0000-4000-8000-000000000010','59400000-0000-4000-8000-000000000011','59400000-0000-4000-8000-000000000012','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext()}
      select public.seal_document_version('${versionId}',2,2,'59400000-0000-4000-8000-000000000013','59400000-0000-4000-8000-000000000014',
        '59400000-0000-4000-8000-000000000015','59400000-0000-4000-8000-000000000016','${now}'); commit;`);
    expect(run(`select state||':'||(sealed_snapshot_checksum is not null) from public.document_version where id='${versionId}';`)).toBe("REVIEW_READY:true");
    expect(run(`begin; set local role youone_request; ${requestContext()} select allowed from public.request_attachment_delivery('${attachmentId}','${versionId}','DOWNLOAD',60,
      '59400000-0000-4000-8000-000000000017','${now}'); rollback;`).split("\n").at(-1)).toBe("t");
    expect(run(`select count(*) from public.audit_log where aggregate_type='ATTACHMENT' and aggregate_id='${attachmentId}' and result='SUCCEEDED'
      and reason_code is null and reason_record_ref is null and before_hash is null and after_hash is null;`)).toBe("0");
    expect(run(`select count(*) from public.audit_log where aggregate_type='DOCUMENT_VERSION' and aggregate_id='${versionId}' and result='SUCCEEDED'
      and reason_code is null and reason_record_ref is null and before_hash is null and after_hash is null;`)).toBe("0");
    run(`delete from public.document_attachment where document_version_id='${versionId}' and attachment_id='${attachmentId}';`, false);
    run(`update public.document_version set editor_content='{\"forged\":true}' where id='${versionId}';`, false);
  });

  it("submits and approves the exact sealed DocumentVersion atomically and blocks the generic command path", () => {
    const policyId = "59500000-0000-4000-8000-000000000001";
    const policyVersion = "59500000-0000-4000-8000-000000000002";
    const stepRule = "59500000-0000-4000-8000-000000000003";
    const participantRule = "59500000-0000-4000-8000-000000000004";
    const instance = "59500000-0000-4000-8000-000000000005";
    const policyChecksum = "b".repeat(64);
    run(`
      insert into public.approval_policy(id,stable_code,status) values('${policyId}','M05_DOCUMENT_APPROVAL','ACTIVE');
      insert into public.approval_policy_version(id,policy_id,version_no,state,subject_kind,checksum,valid_from,created_by_user_id)
        values('${policyVersion}','${policyId}',1,'DRAFT','DOCUMENT_VERSION','${policyChecksum}','2026-01-01','${owner}');
      insert into public.approval_policy_step_rule(id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required)
        values('${stepRule}','${policyVersion}','LAB_DIRECTOR_APPROVAL',1,'APPROVAL','ANY_ONE',true);
      insert into public.approval_policy_participant_rule(id,step_rule_id,selector_kind,position_id)
        values('${participantRule}','${stepRule}','POSITION','10000000-0000-4000-8000-000000000003');
      update public.approval_policy_version set state='PUBLISHED' where id='${policyVersion}';
    `);
    run(`begin; set local role youone_request; ${requestContext()}
      select public.create_document_approval_instance('${instance}','${policyVersion}','${policyChecksum}','${versionId}',null,1,
        '59500000-0000-4000-8000-000000000006','59500000-0000-4000-8000-000000000007','59500000-0000-4000-8000-000000000008','${now}');
      select public.submit_approval_instance('${instance}',1,'59500000-0000-4000-8000-000000000009','59500000-0000-4000-8000-000000000010',
        '59500000-0000-4000-8000-000000000011','59500000-0000-4000-8000-000000000012','${now}'); commit;`);
    expect(run(`select state||':'||(approval_instance_id='${instance}') from public.document_version where id='${versionId}';`)).toBe("APPROVAL_PENDING:true");
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "APPROVAL_ENGINE")}
      select public.activate_approval_instance('${instance}',2,'59500000-0000-4000-8000-000000000013','59500000-0000-4000-8000-000000000014',
        '59500000-0000-4000-8000-000000000015','59500000-0000-4000-8000-000000000016','${now}'); commit;`);
    const step = run(`select id from public.approval_step where instance_id='${instance}';`);
    const participant = run(`select id from public.approval_participant where step_id='${step}';`);
    run(`begin; set local role youone_request; ${requestContext(director)}
      select public.perform_approval_action('${instance}','${step}','${participant}','APPROVE',3,1,1,
        '59500000-0000-4000-8000-000000000017','59500000-0000-4000-8000-000000000018','59500000-0000-4000-8000-000000000019',
        '59500000-0000-4000-8000-000000000020',null,null,'${now}'); commit;`, false);
    expect(run(`select state||':'||version_no from public.approval_instance where id='${instance}';`)).toBe("IN_PROGRESS:3");
    run(`begin; set local role youone_request; ${requestContext(director)}
      select public.perform_document_approval_action('${instance}','${step}','${participant}','APPROVE',3,1,1,
        '59500000-0000-4000-8000-000000000021','59500000-0000-4000-8000-000000000022','59500000-0000-4000-8000-000000000023',
        '59500000-0000-4000-8000-000000000024',null,null,'${now}'); commit;`);
    expect(run(`select i.state||':'||v.state from public.approval_instance i join public.approval_subject_document_version l on l.instance_id=i.id
      join public.document_version v on v.id=l.document_version_id where i.id='${instance}';`)).toBe("COMPLETED:APPROVED");
    expect(run(`select count(*) from public.audit_log where aggregate_type='DOCUMENT_VERSION' and aggregate_id='${versionId}' and outcome='SUCCEEDED';`)).not.toBe("0");
    expect(run(`select count(*) from public.outbox_event where aggregate_type='DOCUMENT_VERSION' and aggregate_id='${versionId}' and event_id='EVT-DOCUMENT-APPROVED';`)).toBe("1");
  });

  it("creates a strictly newer draft and atomically supersedes the approved predecessor", () => {
    const nextVersion = "59600000-0000-4000-8000-000000000001";
    const contentChecksum = run("select app_private.canonical_json_sha256('{}'::jsonb);");
    run(`begin; set local role youone_request; ${requestContext()}
      select public.create_document_revision('${versionId}','${nextVersion}',2,5,'59300000-0000-4000-8000-000000000001','RENDERER_V2','{}'::jsonb,
        '${contentChecksum}','APPROVED_REVISION','59600000-0000-4000-8000-000000000002','59600000-0000-4000-8000-000000000003',
        '59600000-0000-4000-8000-000000000004','59600000-0000-4000-8000-000000000005','59600000-0000-4000-8000-000000000006','${now}'); commit;`);
    expect(run(`select old.state||':'||(old.superseded_by_version_id='${nextVersion}')||':'||fresh.state
      from public.document_version old join public.document_version fresh on fresh.prior_version_id=old.id where old.id='${versionId}';`)).toBe("SUPERSEDED:true:DRAFT");
    expect(run(`select count(*) from public.outbox_event where aggregate_type='DOCUMENT_VERSION' and aggregate_id='${versionId}' and event_id='EVT-DOCUMENT-SUPERSEDED';`)).toBe("1");
    run(`begin; set local role youone_request; ${requestContext()}
      select public.update_document_draft_security('${nextVersion}',1,6,'SEC_L1_PUBLIC_GENERAL','59600000-0000-4000-8000-000000000007','${now}'); commit;`);
    run(`update public.user_security_entitlement_assignment set revoked_at='${now}',revoked_by_user_id='${owner}',revoke_reason_code='M05_TEST_REVOKE',version_no=version_no+1
      where id='59100000-0000-4000-8000-000000000022';`);
    expect(run(`begin; set local role youone_request; ${requestContext()} select allowed from public.request_document_content('${versionId}',
      '59600000-0000-4000-8000-000000000008','${now}'); rollback;`).split("\n").at(-1)).toBe("f");
    expect(run(`begin; set local role youone_request; ${requestContext()} select allowed from public.request_attachment_delivery('${attachmentId}','${versionId}','DOWNLOAD',60,
      '59600000-0000-4000-8000-000000000009','${now}'); rollback;`).split("\n").at(-1)).toBe("f");
  });

  it("rejects an exact revision and permits only its strictly newer same-root revision", () => {
    const rejectedVersion = "59600000-0000-4000-8000-000000000001";
    const thirdVersion = "59700000-0000-4000-8000-000000000001";
    const instance = "59700000-0000-4000-8000-000000000002";
    const policyVersion = "59500000-0000-4000-8000-000000000002";
    const policyChecksum = "b".repeat(64);
    run(`begin; set local role youone_request; ${requestContext()}
      select public.seal_document_version('${rejectedVersion}',2,7,'59700000-0000-4000-8000-000000000003','59700000-0000-4000-8000-000000000004',
        '59700000-0000-4000-8000-000000000005','59700000-0000-4000-8000-000000000006','${now}');
      select public.create_document_approval_instance('${instance}','${policyVersion}','${policyChecksum}','${rejectedVersion}',null,1,
        '59700000-0000-4000-8000-000000000007','59700000-0000-4000-8000-000000000008','59700000-0000-4000-8000-000000000009','${now}');
      select public.submit_approval_instance('${instance}',1,'59700000-0000-4000-8000-000000000010','59700000-0000-4000-8000-000000000011',
        '59700000-0000-4000-8000-000000000012','59700000-0000-4000-8000-000000000013','${now}'); commit;`);
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "APPROVAL_ENGINE")}
      select public.activate_approval_instance('${instance}',2,'59700000-0000-4000-8000-000000000014','59700000-0000-4000-8000-000000000015',
        '59700000-0000-4000-8000-000000000016','59700000-0000-4000-8000-000000000017','${now}'); commit;`);
    const step = run(`select id from public.approval_step where instance_id='${instance}';`);
    const participant = run(`select id from public.approval_participant where step_id='${step}';`);
    run(`begin; set local role youone_request; ${requestContext(director)}
      select public.perform_document_approval_action('${instance}','${step}','${participant}','REJECT',3,1,1,
        '59700000-0000-4000-8000-000000000018','59700000-0000-4000-8000-000000000019','59700000-0000-4000-8000-000000000020',
        '59700000-0000-4000-8000-000000000021','QUALITY_REJECT',null,'${now}'); commit;`);
    const contentChecksum = run("select app_private.canonical_json_sha256('{}'::jsonb);");
    run(`begin; set local role youone_request; ${requestContext()}
      select public.create_document_revision('${rejectedVersion}','${thirdVersion}',3,10,'59300000-0000-4000-8000-000000000001','RENDERER_V3','{}'::jsonb,
        '${contentChecksum}','REJECTION_CORRECTION','59700000-0000-4000-8000-000000000022','59700000-0000-4000-8000-000000000023',
        null,null,null,'${now}'); commit;`);
    expect(run(`select prior_version_id='${rejectedVersion}' and prior_version_no=2 and version_no=3 and state='DRAFT' from public.document_version where id='${thirdVersion}';`)).toBe("t");
  });

  it("rolls back seal state, evidence and audit when outbox persistence fails", () => {
    const thirdVersion = "59700000-0000-4000-8000-000000000001";
    run(`begin; set local role youone_request; ${requestContext()}
      select public.seal_document_version('${thirdVersion}',1,11,'59800000-0000-4000-8000-000000000001','59800000-0000-4000-8000-000000000002',
        '59400000-0000-4000-8000-000000000015','59800000-0000-4000-8000-000000000004','${now}'); commit;`, false);
    expect(run(`select state||':'||row_version from public.document_version where id='${thirdVersion}';`)).toBe("DRAFT:1");
    expect(run("select count(*) from public.document_seal_evidence where id='59800000-0000-4000-8000-000000000004';")).toBe("0");
    expect(run("select count(*) from public.audit_log where id='59800000-0000-4000-8000-000000000001';")).toBe("0");
  });

  it("serializes concurrent seal and logical attachment removal on the exact draft", async () => {
    const thirdVersion = "59700000-0000-4000-8000-000000000001";
    const raceAttachment = "59900000-0000-4000-8000-000000000001";
    const fileHash = "c".repeat(64);
    run(`begin; set local role youone_request; ${requestContext()}
      select public.create_attachment_upload_intent('${raceAttachment}','${thirdVersion}','RACE_EVIDENCE','application/pdf',64,'${fileHash}',60,
        '59900000-0000-4000-8000-000000000002','59900000-0000-4000-8000-000000000003','${now}'); commit;`);
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "FILE_INGEST")}
      select public.record_attachment_uploaded('${raceAttachment}',1,'application/pdf',64,'${fileHash}','59900000-0000-4000-8000-000000000004',
        '59900000-0000-4000-8000-000000000005','${now}'); commit;`);
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "FILE_SCANNER")}
      select public.start_attachment_scan('${raceAttachment}',2,'59900000-0000-4000-8000-000000000006','59900000-0000-4000-8000-000000000007','${now}');
      select public.complete_attachment_scan('${raceAttachment}',3,'MATCH','SCANNER_ENGINE','SCANNER_V1','59900000-0000-4000-8000-000000000008','CLEAN',null,
        '59900000-0000-4000-8000-000000000009','59900000-0000-4000-8000-000000000010','59900000-0000-4000-8000-000000000011','${now}'); commit;`);
    const seal = `begin; set local role youone_request; ${requestContext()}
      select public.seal_document_version('${thirdVersion}',1,11,'59900000-0000-4000-8000-000000000012','59900000-0000-4000-8000-000000000013',
        '59900000-0000-4000-8000-000000000014','59900000-0000-4000-8000-000000000015','${now}'); commit;`;
    const remove = `begin; set local role youone_request; ${requestContext()}
      select public.remove_document_attachment('${thirdVersion}','${raceAttachment}',1,'RACE_REMOVE','59900000-0000-4000-8000-000000000016','${now}'); commit;`;
    const [sealStatus, removeStatus] = await Promise.all([runAsync(seal), runAsync(remove)]);
    expect(sealStatus).toBe(0);
    expect([0, 1]).toContain(removeStatus);
    expect(run(`select state from public.document_version where id='${thirdVersion}';`)).toBe("REVIEW_READY");
    expect(run(`select link_state in ('ACTIVE','REMOVED') from public.document_attachment where document_version_id='${thirdVersion}' and attachment_id='${raceAttachment}';`)).toBe("t");
  }, 30_000);
});

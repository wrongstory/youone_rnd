import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.R03_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrationDirectory = resolve(import.meta.dirname, "../../supabase/migrations");
const migrationSql = readdirSync(migrationDirectory)
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(resolve(migrationDirectory, name), "utf8"))
  .join("\n");
const databaseDescribe = databaseUrl === undefined ? describe.skip : describe;

const now = "2026-08-23T12:00:00Z";
const createdAt = "2026-08-23T11:55:00Z";
const observedAt = "2026-08-23T11:45:00Z";
const sessionId = "r03-live-session";
const internal = "17000000-0000-4000-8000-000000000101";
const vendorActor = "17000000-0000-4000-8000-000000000102";
const organization = "17000000-0000-4000-8000-000000000201";
const vendor = "17000000-0000-4000-8000-000000000202";
const vendorMembership = "17000000-0000-4000-8000-000000000203";
const role = "17000000-0000-4000-8000-000000000204";
const project = "17000000-0000-4000-8000-000000000301";
const internalWbs = "17000000-0000-4000-8000-000000000302";
const vendorWbs = "17000000-0000-4000-8000-000000000303";
const vendorGrant = "17000000-0000-4000-8000-000000000304";
const contract = "17000000-0000-4000-8000-000000000401";
const safetyInspection = "17000000-0000-4000-8000-000000000501";
const inspection = "17000000-0000-4000-8000-000000000601";
const checklist = "17000000-0000-4000-8000-000000000602";
const attempt = "17000000-0000-4000-8000-000000000603";
const criterion = "17000000-0000-4000-8000-000000000604";
const safetyDraft = "17000000-0000-4000-8000-000000000701";
const inspectionDraft = "17000000-0000-4000-8000-000000000702";
const noteDraft = "17000000-0000-4000-8000-000000000703";
const recordDraft = "17000000-0000-4000-8000-000000000704";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const sqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function run(sql: string, success = true): string {
  if (databaseUrl === undefined) throw new Error("R03_TEST_DATABASE_URL required");
  const result = spawnSync(
    psql,
    ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl],
    { input: sql, encoding: "utf8" },
  );
  if ((result.status === 0) !== success) {
    throw new Error(success ? `psql failed: ${result.stderr}` : `psql unexpectedly succeeded: ${result.stdout}`);
  }
  return result.stdout.trim();
}

function runAsync(sql: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  if (databaseUrl === undefined) throw new Error("R03_TEST_DATABASE_URL required");
  return new Promise((resolvePromise) => {
    const child = spawn(
      psql,
      ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl],
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolvePromise({ status, stdout: stdout.trim(), stderr }));
    child.stdin.end(sql);
  });
}

function requestContext(actorId: string): string {
  return `select set_config('app.actor_kind','USER',true);
    select set_config('app.actor_user_id','${actorId}',true);
    select set_config('app.effective_actor_user_id','${actorId}',true);
    select set_config('app.anonymous_subject_fingerprint','',true);
    select set_config('app.system_actor_id','',true);
    select set_config('app.correlation_id','request:r03-offline-handler',true);
    select set_config('app.causation_id','',true);
    select set_config('app.request_time','${now}',true);
    select set_config('app.acting_authority_id','',true);
    select set_config('app.session_id','${sessionId}',true);
    select set_config('app.assurance_level','AAL2',true);`;
}

function registerSql(
  actorId: string,
  commandId: string,
  commandType: string,
  aggregateType: string,
  aggregateId: string,
  baseVersion: number,
  payloadValue: unknown,
): string {
  const payload = canonical(payloadValue);
  return `select app_private.register_offline_command('${commandId}','${commandType}','${actorId}','${actorId}',
    '${digest(`${actorId}:${sessionId}`)}','${aggregateType}','${aggregateId}',${baseVersion},1,'${createdAt}',
    '${digest(payload)}',${sqlLiteral(payload)},'${now}');`;
}

function appliedResult(commandId: string, version: number): string {
  return `select app_private.record_offline_command_result('${commandId}','APPLIED',${version},null,'${now}');`;
}

const safetyItems = [{ itemId: "17000000-0000-4000-8000-000000000801", sequenceNo: 1, criterionCode: "PPE_CHECK", criterionText: "보호구 착용 확인", verdict: "PASS", observation: "보호구 확인" }];
const inspectionResults = [{ criterionId: criterion, achievedPercent: 95, verdict: "PASS", observedValue: "95" }];
const measurements = [{ measurementId: "17000000-0000-4000-8000-000000000803", metricCode: "TEMP_C", value: "24.5", unitCode: "CELSIUS", note: "정상 범위" }];

databaseDescribe.sequential("R03 reviewed offline handler PostgreSQL boundary", () => {
  beforeAll(() => {
    if (databaseUrl === undefined) return;
    if (!/test/i.test(new URL(databaseUrl).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated R03 test DB required");
    run(`begin; ${migrationSql} rollback;`);
    expect(run("select count(*) from information_schema.tables where table_schema='public';")).toBe("0");
    run(migrationSql);

    run(`insert into public.organization(id,stable_code,legal_name,status) values('${organization}','R03_ORG','R03 Org','ACTIVE');
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values
       ('${internal}','r03-internal','INTERNAL','ACTIVE','2026-01-01'),('${vendorActor}','r03-vendor','VENDOR','ACTIVE','2026-01-01');
      insert into public.role(id,stable_code,status) values('${role}','ROLE_R03_FIELD','ACTIVE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,granted_by_user_id,grant_reason_code) values
       ('17000000-0000-4000-8000-000000000205','${internal}','${role}','2026-01-01','${internal}','R03_FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,granted_by_user_id,grant_reason_code)
       select '17000000-0000-4000-8000-000000000206','${role}',id,'2026-01-01','${internal}','R03_FIXTURE' from public.permission where stable_code='inspection.record.inspect';
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,granted_by_user_id,grant_reason_code)
       select '17000000-0000-4000-8000-000000000207','${role}',id,'2026-01-01','${internal}','R03_FIXTURE' from public.permission where stable_code='safety.inspection.perform';
      insert into public.user_position_assignment(id,user_id,position_id,valid_from,is_primary,granted_by_user_id,grant_reason_code)
       select '17000000-0000-4000-8000-000000000209','${internal}',id,'2026-01-01',true,'${internal}','R03_FIXTURE'
       from public.position where stable_code='POSITION_LAB_DIRECTOR';
      insert into public.vendor(id,vendor_code,legal_name,status) values('${vendor}','R03_VENDOR','R03 Vendor','ACTIVE');
      insert into public.vendor_user(id,vendor_id,user_id,status,valid_from,granted_by_user_id,grant_reason_code) values
       ('${vendorMembership}','${vendor}','${vendorActor}','ACTIVE','2026-01-01','${internal}','R03_FIXTURE');
      insert into public.project(id,project_code,name,organization_id,owner_user_id,objective,period_start,period_end,visibility_code,state,created_at,updated_at) values
       ('${project}','R03_PROJECT','R03 Project','${organization}','${internal}','R03 offline handler test','2026-01-01','2026-12-31','MEMBERS_ONLY','ACTIVE','${now}','${now}');
      insert into public.wbs_node(id,project_id,node_code,node_kind,title,assignee_user_id,sort_order,progress_percent,state,created_by_user_id,created_at,updated_at) values
       ('${internalWbs}','${project}','R03_INTERNAL_TASK','TASK','Internal task','${internal}',1,10,'IN_PROGRESS','${internal}','${now}','${now}');
      insert into public.wbs_node(id,project_id,node_code,node_kind,title,assigned_vendor_id,assigned_vendor_user_id,sort_order,progress_percent,state,created_by_user_id,created_at,updated_at) values
       ('${vendorWbs}','${project}','R03_VENDOR_TASK','TASK','Vendor task','${vendor}','${vendorMembership}',2,20,'IN_PROGRESS','${internal}','${now}','${now}');
      insert into public.project_vendor_grant(id,project_id,vendor_user_id,status,valid_from,granted_by_user_id,grant_reason_code) values
       ('${vendorGrant}','${project}','${vendorMembership}','ACTIVE','2026-01-01','${internal}','R03_FIXTURE');
      insert into public.project_vendor_grant_action(grant_id,permission_id)
       select '${vendorGrant}',id from public.permission where stable_code='project.wbs.update';
      insert into public.vendor_contract(id,contract_no,vendor_id,manager_user_id,title,state,created_at,updated_at) values
       ('${contract}','R03-CONTRACT','${vendor}','${internal}','R03 Contract','ACTIVE','${now}','${now}');

      alter table public.safety_inspection disable trigger all;
      insert into public.safety_inspection(id,inspection_no,project_id,manager_assignment_id,inspection_type,scheduled_at,inspector_user_id,state,stop_work_active,version_no,retain_until,created_at,updated_at) values
       ('${safetyInspection}','R03-SAFETY','${project}','17000000-0000-4000-8000-000000000599','AD_HOC','${now}','${internal}','PLANNED',false,1,'2032-01-01','${now}','${now}');
      alter table public.safety_inspection enable trigger all;

      alter table public.inspection disable trigger all;
      alter table public.inspection_checklist_version disable trigger all;
      alter table public.inspection_criterion disable trigger all;
      alter table public.inspection_attempt disable trigger all;
      insert into public.inspection(id,inspection_no,inspection_type_code,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id,assigned_vendor_id,inspection_checklist_version_id,state,open_attempt_id,open_attempt_no,latest_attempt_no,version_no,created_at,updated_at) values
       ('${inspection}','R03-INSPECTION','FINAL','${contract}','17000000-0000-4000-8000-000000000611','17000000-0000-4000-8000-000000000612','17000000-0000-4000-8000-000000000613','${vendor}','${checklist}','IN_PROGRESS','${attempt}',1,1,1,'${now}','${now}');
      insert into public.inspection_checklist_version(id,inspection_id,version_no,policy_version_id,policy_id,policy_version_no,policy_checksum,state,total_weight_percent,checksum,sealed_at,sealed_by_user_id) values
       ('${checklist}','${inspection}',1,'17000000-0000-4000-8000-000000000614','17000000-0000-4000-8000-000000000615',1,'${digest("policy")}','SEALED',100,'${digest("checklist")}','${now}','${internal}');
      insert into public.inspection_criterion(id,inspection_checklist_version_id,sequence_no,criterion_code,title,weight_percent,critical,measurement_rule,pass_rule) values
       ('${criterion}','${checklist}',1,'DIMENSION_CHECK','Dimension',100,false,'Measure','Within range');
      insert into public.inspection_attempt(id,inspection_id,attempt_no,state,inspection_checklist_version_id,policy_version_id,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id,assigned_vendor_id,inspector_user_id,created_at) values
       ('${attempt}','${inspection}',1,'DRAFT','${checklist}','17000000-0000-4000-8000-000000000614','${contract}','17000000-0000-4000-8000-000000000611','17000000-0000-4000-8000-000000000612','17000000-0000-4000-8000-000000000613','${vendor}','${internal}','${now}');
      alter table public.inspection_attempt enable trigger all;
      alter table public.inspection_criterion enable trigger all;
      alter table public.inspection_checklist_version enable trigger all;
      alter table public.inspection enable trigger all;`);
  }, 120_000);

  it("migrates cleanly, forces owner RLS, and exposes no direct draft writes", () => {
    expect(run(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any(array['safety_checklist_draft','safety_checklist_draft_item','inspection_attempt_draft',
       'inspection_attempt_draft_criterion','field_note_draft','field_record_draft','field_record_draft_measurement'])
       and (not c.relrowsecurity or not c.relforcerowsecurity);`)).toBe("0");
    expect(run(`select count(*) from information_schema.role_table_grants where grantee='youone_request'
      and table_schema='public' and table_name like '%draft%' and privilege_type in('INSERT','UPDATE','DELETE','TRUNCATE');`)).toBe("0");
    expect(run(`select count(*) from information_schema.routine_privileges where grantee='PUBLIC' and routine_schema='public'
      and routine_name like 'r03_%';`)).toBe("0");
    run(`begin; set local role youone_request; ${requestContext(internal)}
      update public.field_note_draft set note='forged'; rollback;`, false);
  });

  it("applies all five allowlisted commands with exact version and atomic evidence", () => {
    const safetyCommand = "17000000-0000-4000-8000-000000000901";
    const inspectionCommand = "17000000-0000-4000-8000-000000000902";
    const noteCommand = "17000000-0000-4000-8000-000000000903";
    const wbsCommand = "17000000-0000-4000-8000-000000000904";
    const recordCommand = "17000000-0000-4000-8000-000000000905";
    const safetyPayload = { safetyInspectionId: safetyInspection, note: "안전 점검 초안", items: safetyItems };
    const inspectionPayload = { inspectionAttemptId: attempt, summary: "검수 결과 초안", results: inspectionResults };
    const notePayload = { projectId: project, wbsNodeId: internalWbs, note: "현장 점검 메모", observedAt };
    const wbsPayload = { progressPercent: 35 };
    const recordPayload = { projectId: project, wbsNodeId: internalWbs, recordType: "FIELD_OBSERVATION", summary: "현장 계측 기록", observedAt, location: "A동", measurements };

    const output = run(`begin; set local role youone_request; ${requestContext(internal)}
      ${registerSql(internal, safetyCommand, "CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT", "SAFETY_CHECKLIST_DRAFT", safetyDraft, 0, safetyPayload)}
      select result_code||':'||aggregate_version from public.r03_upsert_safety_checklist_draft('${safetyCommand}','${safetyDraft}','${safetyInspection}',0,'안전 점검 초안',${sqlLiteral(canonical(safetyItems))}::jsonb,'${now}');
      ${appliedResult(safetyCommand, 1)}
      ${registerSql(internal, inspectionCommand, "CMD-OFFLINE-INSPECTION-DRAFT-UPSERT", "INSPECTION_ATTEMPT_DRAFT", inspectionDraft, 0, inspectionPayload)}
      select result_code||':'||aggregate_version from public.r03_upsert_inspection_attempt_draft('${inspectionCommand}','${inspectionDraft}','${attempt}',0,'검수 결과 초안',${sqlLiteral(canonical(inspectionResults))}::jsonb,'${now}');
      ${appliedResult(inspectionCommand, 1)}
      ${registerSql(internal, noteCommand, "CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT", "FIELD_NOTE_DRAFT", noteDraft, 0, notePayload)}
      select result_code||':'||aggregate_version from public.r03_upsert_field_note_draft('${noteCommand}','${noteDraft}','${project}','${internalWbs}',0,'현장 점검 메모','${observedAt}','${now}');
      ${appliedResult(noteCommand, 1)}
      ${registerSql(internal, wbsCommand, "CMD-OFFLINE-WORK-ITEM-PROGRESS-UPDATE", "WBS_NODE", internalWbs, 1, wbsPayload)}
      select result_code||':'||aggregate_version from public.r03_update_wbs_progress('${wbsCommand}','${internalWbs}',1,35,'${now}');
      ${appliedResult(wbsCommand, 2)}
      ${registerSql(internal, recordCommand, "CMD-OFFLINE-FIELD-RECORD-DRAFT-UPSERT", "FIELD_RECORD_DRAFT", recordDraft, 0, recordPayload)}
      select result_code||':'||aggregate_version from public.r03_upsert_field_record_draft('${recordCommand}','${recordDraft}','${project}','${internalWbs}',0,'FIELD_OBSERVATION','현장 계측 기록','${observedAt}','A동',${sqlLiteral(canonical(measurements))}::jsonb,'${now}');
      ${appliedResult(recordCommand, 1)} commit;`);
    expect(output.match(/APPLIED:\d/g)?.sort()).toEqual(["APPLIED:1", "APPLIED:1", "APPLIED:1", "APPLIED:1", "APPLIED:2"]);
    expect(run(`select (select count(*) from public.offline_command_result where offline_command_id=any(array['${safetyCommand}'::uuid,'${inspectionCommand}'::uuid,'${noteCommand}'::uuid,'${wbsCommand}'::uuid,'${recordCommand}'::uuid]))||':'||
      (select count(*) from public.state_transition_history where aggregate_id=any(array['${safetyDraft}'::uuid,'${inspectionDraft}'::uuid,'${noteDraft}'::uuid,'${internalWbs}'::uuid,'${recordDraft}'::uuid]))||':'||
      (select count(*) from public.outbox_event where aggregate_id=any(array['${safetyDraft}'::uuid,'${inspectionDraft}'::uuid,'${noteDraft}'::uuid,'${internalWbs}'::uuid,'${recordDraft}'::uuid]));`)).toBe("5:5:5");
    expect(run(`select count(*) from public.outbox_event where aggregate_id=any(array['${safetyDraft}'::uuid,'${inspectionDraft}'::uuid,'${noteDraft}'::uuid,'${internalWbs}'::uuid,'${recordDraft}'::uuid])
      and (payload ?| array['note','summary','criterionText','observation','observedValue','value','amount','termsText']);`)).toBe("0");
    expect(run(`select
      (select d.note||':'||i.sequence_no||':'||i.criterion_text from public.safety_checklist_draft d join public.safety_checklist_draft_item i on i.draft_id=d.id where d.id='${safetyDraft}')||'|'||
      (select d.summary||':'||r.observed_value from public.inspection_attempt_draft d join public.inspection_attempt_draft_criterion r on r.draft_id=d.id where d.id='${inspectionDraft}')||'|'||
      (select note from public.field_note_draft where id='${noteDraft}')||'|'||
      (select m.metric_code||':'||m.value||':'||m.unit_code||':'||m.note from public.field_record_draft_measurement m where m.draft_id='${recordDraft}');`)).toBe(
      "안전 점검 초안:1:보호구 착용 확인|검수 결과 초안:95|현장 점검 메모|TEMP_C:24.5:CELSIUS:정상 범위",
    );
  });

  it("returns a safe stale projection and never overwrites server content", () => {
    const command = "17000000-0000-4000-8000-000000000911";
    const payload = { projectId: project, wbsNodeId: internalWbs, note: "덮어쓰면 안 되는 메모", observedAt };
    const output = run(`begin; set local role youone_request; ${requestContext(internal)}
      ${registerSql(internal, command, "CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT", "FIELD_NOTE_DRAFT", noteDraft, 0, payload)}
      select result_code||':'||server_version||':'||(safe_server_projection ? 'note')||':'||(safe_server_projection ? 'summary')
       from public.r03_upsert_field_note_draft('${command}','${noteDraft}','${project}','${internalWbs}',0,'덮어쓰면 안 되는 메모','${observedAt}','${now}');
      rollback;`);
    expect(output.split("\n").at(-1)).toBe("STALE_BASE_VERSION:1:false:false");
    expect(run(`select note||':'||version_no from public.field_note_draft where id='${noteDraft}';`)).toBe("현장 점검 메모:1");
  });

  it("allows only the exact active Vendor WBS grant and denies all four draft handlers", () => {
    const vendorWbsCommand = "17000000-0000-4000-8000-000000000921";
    run(`begin; set local role youone_request; ${requestContext(vendorActor)}
      ${registerSql(vendorActor, vendorWbsCommand, "CMD-OFFLINE-WORK-ITEM-PROGRESS-UPDATE", "WBS_NODE", vendorWbs, 1, { progressPercent: 45 })}
      select * from public.r03_update_wbs_progress('${vendorWbsCommand}','${vendorWbs}',1,45,'${now}');
      ${appliedResult(vendorWbsCommand, 2)} commit;`);
    expect(run(`select progress_percent||':'||version_no from public.wbs_node where id='${vendorWbs}';`)).toBe("45.00:2");

    const deniedWbs = "17000000-0000-4000-8000-000000000922";
    run(`begin; update public.project_vendor_grant set status='REVOKED',revoked_at='${now}',revoked_by_user_id='${internal}',revoke_reason_code='R03_TEST' where id='${vendorGrant}'; commit;
      begin; set local role youone_request; ${requestContext(vendorActor)}
      ${registerSql(vendorActor, deniedWbs, "CMD-OFFLINE-WORK-ITEM-PROGRESS-UPDATE", "WBS_NODE", vendorWbs, 2, { progressPercent: 50 })}
      select * from public.r03_update_wbs_progress('${deniedWbs}','${vendorWbs}',2,50,'${now}'); commit;`, false);
    expect(run(`select progress_percent||':'||version_no from public.wbs_node where id='${vendorWbs}';`)).toBe("45.00:2");

    const deniedCases = [
      ["17000000-0000-4000-8000-000000000923", "CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT", "SAFETY_CHECKLIST_DRAFT", "17000000-0000-4000-8000-000000000713", { safetyInspectionId: safetyInspection, note: "vendor safety", items: safetyItems }, `select * from public.r03_upsert_safety_checklist_draft('17000000-0000-4000-8000-000000000923','17000000-0000-4000-8000-000000000713','${safetyInspection}',0,'vendor safety',${sqlLiteral(canonical(safetyItems))}::jsonb,'${now}');`],
      ["17000000-0000-4000-8000-000000000924", "CMD-OFFLINE-INSPECTION-DRAFT-UPSERT", "INSPECTION_ATTEMPT_DRAFT", "17000000-0000-4000-8000-000000000714", { inspectionAttemptId: attempt, summary: "vendor inspection", results: inspectionResults }, `select * from public.r03_upsert_inspection_attempt_draft('17000000-0000-4000-8000-000000000924','17000000-0000-4000-8000-000000000714','${attempt}',0,'vendor inspection',${sqlLiteral(canonical(inspectionResults))}::jsonb,'${now}');`],
      ["17000000-0000-4000-8000-000000000925", "CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT", "FIELD_NOTE_DRAFT", "17000000-0000-4000-8000-000000000715", { projectId: project, note: "vendor note", observedAt }, `select * from public.r03_upsert_field_note_draft('17000000-0000-4000-8000-000000000925','17000000-0000-4000-8000-000000000715','${project}',null,0,'vendor note','${observedAt}','${now}');`],
      ["17000000-0000-4000-8000-000000000926", "CMD-OFFLINE-FIELD-RECORD-DRAFT-UPSERT", "FIELD_RECORD_DRAFT", "17000000-0000-4000-8000-000000000716", { projectId: project, recordType: "FIELD_OBSERVATION", summary: "vendor record", observedAt, measurements: [] }, `select * from public.r03_upsert_field_record_draft('17000000-0000-4000-8000-000000000926','17000000-0000-4000-8000-000000000716','${project}',null,0,'FIELD_OBSERVATION','vendor record','${observedAt}',null,'[]'::jsonb,'${now}');`],
    ] as const;
    for (const [commandId, type, aggregateType, aggregateId, payload, handler] of deniedCases) {
      run(`begin; set local role youone_request; ${requestContext(vendorActor)}
        ${registerSql(vendorActor, commandId, type, aggregateType, aggregateId, 0, payload)} ${handler} commit;`, false);
    }
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)}
      select (select count(*) from public.safety_checklist_draft)+(select count(*) from public.inspection_attempt_draft)+
       (select count(*) from public.field_note_draft)+(select count(*) from public.field_record_draft); rollback;`).split("\n").at(-1)).toBe("0");
  });

  it("serializes the same command ID before the immutable idempotency check", async () => {
    const command = "17000000-0000-4000-8000-000000000931";
    const registration = registerSql(internal, command, "CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT", "FIELD_NOTE_DRAFT", "17000000-0000-4000-8000-000000000731", 0, {
      projectId: project,
      wbsNodeId: null,
      note: "concurrent",
      observedAt,
    });
    const first = runAsync(`begin; set local role youone_request; ${requestContext(internal)} ${registration} select pg_sleep(0.5); commit;`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 75));
    const second = runAsync(`begin; set local role youone_request; ${requestContext(internal)} ${registration} commit;`);
    const [left, right] = await Promise.all([first, second]);
    expect(left.stderr).toBe("");
    expect(right.stderr).toBe("");
    expect(left.status).toBe(0);
    expect(right.status).toBe(0);
    expect([left.stdout, right.stdout].join("\n")).toContain("RECEIVED");
    expect([left.stdout, right.stdout].join("\n")).toContain("IDEMPOTENT_REPLAY");
    expect(run(`select count(*) from public.offline_command where command_id='${command}';`)).toBe("1");
  });

  it("rolls command, domain row, transition, audit, and outbox back together", () => {
    const command = "17000000-0000-4000-8000-000000000941";
    const draft = "17000000-0000-4000-8000-000000000742";
    const payload = { projectId: project, note: "rollback probe", observedAt };
    run(`begin; set local role youone_request; ${requestContext(internal)}
      ${registerSql(internal, command, "CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT", "FIELD_NOTE_DRAFT", draft, 0, payload)}
      select * from public.r03_upsert_field_note_draft('${command}','${draft}','${project}',null,0,'rollback probe','${observedAt}','${now}');
      select app_private.record_offline_command_result('${command}','APPLIED',99,null,'${now}'); commit;`, false);
    expect(run(`select (select count(*) from public.offline_command where command_id='${command}')||':'||
      (select count(*) from public.field_note_draft where id='${draft}')||':'||
      (select count(*) from public.state_transition_history where aggregate_id='${draft}')||':'||
      (select count(*) from public.audit_log where resource_id='${draft}')||':'||
      (select count(*) from public.outbox_event where aggregate_id='${draft}');`)).toBe("0:0:0:0:0");
  });
});

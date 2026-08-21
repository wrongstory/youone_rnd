import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.M08_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrations = [
  "20260821000100_m02_database_audit_kernel.sql",
  "20260821000200_m03_auth_rbac_scope.sql",
  "20260822000300_m04_approval_engine.sql",
  "20260822000400_m05_document_file.sql",
  "20260822000500_m06_project_wbs.sql",
  "20260822000600_m07_vendor_contract.sql",
  "20260822000700_m08_quality_inspection.sql",
].map((name) => readFileSync(resolve(import.meta.dirname, `../../supabase/migrations/${name}`), "utf8")).join("\n");
const dbDescribe = url === undefined ? describe.skip : describe;
const now = "2026-08-22T09:00:00Z";
const org = "80000000-0000-4000-8000-000000000001";
const manager = "80000000-0000-4000-8000-000000000002";
const vendorActor = "80000000-0000-4000-8000-000000000003";
const labDirector = "80000000-0000-4000-8000-000000000011";
const representative = "80000000-0000-4000-8000-000000000012";
const project = "80000000-0000-4000-8000-000000000004";
const requirement = "80000000-0000-4000-8000-000000000005";
const revision1 = "80000000-0000-4000-8000-000000000006";
const otherRequirement = "80000000-0000-4000-8000-000000000007";
const otherRevision = "80000000-0000-4000-8000-000000000008";
const testPlan = "80000000-0000-4000-8000-000000000009";
const testPlanVersion = "80000000-0000-4000-8000-000000000010";

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("M08_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url], { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}

function runAsync(sql: string): Promise<number | null> {
  if (url === undefined) throw new Error("M08_TEST_DATABASE_URL required");
  return new Promise((resolvePromise) => {
    const child = spawn(psql, ["-X", "--no-psqlrc", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url]);
    child.stdin.end(sql);
    child.on("close", resolvePromise);
  });
}

function requestContext(actor: string): string {
  return `select set_config('app.actor_kind','USER',true);
    select set_config('app.actor_user_id','${actor}',true);
    select set_config('app.effective_actor_user_id','${actor}',true);
    select set_config('app.anonymous_subject_fingerprint','',true);
    select set_config('app.system_actor_id','',true);
    select set_config('app.correlation_id','request:m08-db',true);
    select set_config('app.causation_id','',true);
    select set_config('app.request_time','${now}',true);
    select set_config('app.acting_authority_id','',true);`;
}

function systemContext(systemActor: string): string {
  return `select set_config('app.actor_kind','SYSTEM',true);
    select set_config('app.actor_user_id','',true);
    select set_config('app.effective_actor_user_id','',true);
    select set_config('app.anonymous_subject_fingerprint','',true);
    select set_config('app.system_actor_id','${systemActor}',true);
    select set_config('app.correlation_id','worker:m08-db',true);
    select set_config('app.causation_id','',true);
    select set_config('app.request_time','${now}',true);
    select set_config('app.acting_authority_id','',true);`;
}

const liveId = (value: number): string => `81000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function completePaymentApproval(decisionId: string, expectedDecisionVersion: number, instanceId: string, idBase: number): number {
  const policyChecksum = run("select checksum from public.approval_policy_version where id='80000000-0000-4000-8000-000000000095';");
  run(`begin; set local role youone_request; ${requestContext(manager)}
    select public.create_acceptance_payment_approval_instance('${decisionId}',${expectedDecisionVersion},'${instanceId}',
      '80000000-0000-4000-8000-000000000095','${policyChecksum}',null,1,
      '${liveId(idBase + 1)}','${liveId(idBase + 2)}','${liveId(idBase + 3)}','${liveId(idBase + 4)}','${liveId(idBase + 5)}',
      '${liveId(idBase + 6)}','${now}');
    select public.submit_acceptance_payment_approval_instance('${instanceId}',1,'${liveId(idBase + 7)}','${liveId(idBase + 8)}',
      '${liveId(idBase + 9)}','${liveId(idBase + 10)}','${now}'); commit;`);
  run(`begin; set local role youone_privileged_writer; ${systemContext("APPROVAL_ENGINE")}
    select public.activate_approval_instance('${instanceId}',2,'${liveId(idBase + 11)}','${liveId(idBase + 12)}',
      '${liveId(idBase + 13)}','${liveId(idBase + 14)}','${now}'); commit;`);
  run(`begin; set local role youone_request; ${requestContext(labDirector)}
    select public.perform_acceptance_payment_approval_action('${instanceId}',
      (select id from public.approval_step where instance_id='${instanceId}' and sequence_no=1),
      (select p.id from public.approval_participant p join public.approval_step s on s.id=p.step_id
        where s.instance_id='${instanceId}' and s.sequence_no=1 and p.participant_user_id='${labDirector}'),
      'APPROVE',3,1,1,'${liveId(idBase + 15)}','${liveId(idBase + 16)}','${liveId(idBase + 17)}','${liveId(idBase + 18)}',
      null,'LAB-DIRECTOR-APPROVED',${expectedDecisionVersion + 1},'${liveId(idBase + 19)}','${liveId(idBase + 20)}',
      '${liveId(idBase + 21)}','${now}'); commit;`);
  run(`begin; set local role youone_request; ${requestContext(representative)}
    select public.perform_acceptance_payment_approval_action('${instanceId}',
      (select id from public.approval_step where instance_id='${instanceId}' and sequence_no=2),
      (select p.id from public.approval_participant p join public.approval_step s on s.id=p.step_id
        where s.instance_id='${instanceId}' and s.sequence_no=2 and p.participant_user_id='${representative}'),
      'APPROVE',4,1,1,'${liveId(idBase + 22)}','${liveId(idBase + 23)}','${liveId(idBase + 24)}','${liveId(idBase + 25)}',
      null,'REPRESENTATIVE-APPROVED',${expectedDecisionVersion + 1},'${liveId(idBase + 26)}','${liveId(idBase + 27)}',
      '${liveId(idBase + 28)}','${now}'); commit;`);
  return expectedDecisionVersion + 2;
}

function createAcceptanceFixture(kind: "CONDITIONAL_ACCEPTANCE" | "PARTIAL_ACCEPTANCE", idBase: number): {
  attemptId: string; basisId: string; inspectionId: string;
} {
  const inspectionId = liveId(idBase);
  const checklistId = liveId(idBase + 1);
  const criterionId = liveId(idBase + 2);
  const attemptId = liveId(idBase + 3);
  const evidenceId = liveId(idBase + 4);
  const resultId = liveId(idBase + 5);
  const basisId = liveId(idBase + 6);
  const achievement = kind === "CONDITIONAL_ACCEPTANCE" ? 95 : 75;
  const basisSql = kind === "CONDITIONAL_ACCEPTANCE"
    ? `insert into public.inspection_residual_condition(id,inspection_attempt_id,condition_code,description,due_at)
         values('${basisId}','${attemptId}','RESIDUAL-${idBase}','Residual condition','2026-09-30');
       insert into public.inspection_residual_condition_evidence(residual_condition_id,inspection_attempt_id,inspection_id,inspection_evidence_id)
         values('${basisId}','${attemptId}','${inspectionId}','${evidenceId}');`
    : `insert into public.inspection_partial_usable_portion(id,inspection_attempt_id,portion_code,description,deliverable_version_id)
         values('${basisId}','${attemptId}','PORTION-${idBase}','Usable portion','80000000-0000-4000-8000-000000000060');
       insert into public.inspection_partial_usable_portion_evidence(usable_portion_id,inspection_attempt_id,inspection_id,inspection_evidence_id)
         values('${basisId}','${attemptId}','${inspectionId}','${evidenceId}');`;
  run(`begin;
    insert into public.inspection(id,inspection_no,inspection_type_code,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id,
      assigned_vendor_id,inspection_checklist_version_id,state,version_no,created_at,updated_at)
    values('${inspectionId}','INSPECTION-${idBase}','FINAL','80000000-0000-4000-8000-000000000052',
      '80000000-0000-4000-8000-000000000058','80000000-0000-4000-8000-000000000059','80000000-0000-4000-8000-000000000060',
      '80000000-0000-4000-8000-000000000050','${checklistId}','IN_PROGRESS',1,'${now}','${now}');
    insert into public.inspection_checklist_version(id,inspection_id,version_no,policy_version_id,policy_id,policy_version_no,policy_checksum,state)
    values('${checklistId}','${inspectionId}',1,'80000000-0000-4000-8000-000000000062','80000000-0000-4000-8000-000000000061',1,
      (select checksum from public.acceptance_score_policy_version where id='80000000-0000-4000-8000-000000000062'),'DRAFT');
    insert into public.inspection_criterion(id,inspection_checklist_version_id,sequence_no,criterion_code,title,weight_percent,critical,measurement_rule,pass_rule)
      values('${criterionId}','${checklistId}',1,'CRITERION-${idBase}','Criterion',100,false,'measure','pass');
    insert into public.inspection_criterion_evidence_requirement(inspection_criterion_id,evidence_type_code)
      values('${criterionId}','TEST-REPORT');
    select set_config('app.m08_seal_checklist','${checklistId}',true);
    update public.inspection_checklist_version set state='SEALED',total_weight_percent=100,checksum=repeat('7',64),
      sealed_at='${now}',sealed_by_user_id='${manager}' where id='${checklistId}';
    insert into public.inspection_attempt(id,inspection_id,attempt_no,state,inspection_checklist_version_id,policy_version_id,contract_id,
      contract_milestone_id,deliverable_id,deliverable_version_id,assigned_vendor_id,inspector_user_id,created_at)
    values('${attemptId}','${inspectionId}',1,'DRAFT','${checklistId}','80000000-0000-4000-8000-000000000062',
      '80000000-0000-4000-8000-000000000052','80000000-0000-4000-8000-000000000058','80000000-0000-4000-8000-000000000059',
      '80000000-0000-4000-8000-000000000060','80000000-0000-4000-8000-000000000050','${manager}','${now}');
    insert into public.inspection_evidence(id,inspection_id,attachment_id,attachment_row_version,content_checksum,evidence_type_code,created_at)
      values('${evidenceId}','${inspectionId}','80000000-0000-4000-8000-000000000070',1,repeat('e',64),'TEST-REPORT','${now}');
    insert into public.inspection_attempt_evidence(inspection_attempt_id,inspection_id,inspection_evidence_id)
      values('${attemptId}','${inspectionId}','${evidenceId}');
    insert into public.inspection_criterion_result(id,inspection_attempt_id,inspection_checklist_version_id,inspection_criterion_id,achieved_percent,verdict,observed_value)
      values('${resultId}','${attemptId}','${checklistId}','${criterionId}',${achievement},'PARTIAL','${achievement}');
    insert into public.inspection_criterion_result_evidence(inspection_criterion_result_id,inspection_attempt_id,inspection_id,inspection_evidence_id)
      values('${resultId}','${attemptId}','${inspectionId}','${evidenceId}');
    ${basisSql}
    select set_config('app.m08_seal_attempt','${attemptId}',true);
    update public.inspection_attempt set state='SEALED',disposition='${kind}',achievement_percent=${achievement},checksum=repeat('8',64),
      sealed_at='${now}' where id='${attemptId}';
    update public.inspection set state='DECISION_PENDING',latest_sealed_attempt_id='${attemptId}',latest_attempt_no=1,version_no=2,
      updated_at='${now}' where id='${inspectionId}';
    commit;`);
  run(`begin; set local role youone_request; ${requestContext(manager)}
    select public.decide_inspection('${inspectionId}',2,null,'${liveId(idBase + 7)}','${liveId(idBase + 8)}',
      '${liveId(idBase + 9)}','${now}'); commit;`);
  return { attemptId, basisId, inspectionId };
}

dbDescribe.sequential("M08 PostgreSQL Quality/Inspection boundary", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M08 test DB required");
    run(migrations);
    run(`
      insert into public.organization(id,stable_code,legal_name,status) values('${org}','M08-ORG','M08 Org','ACTIVE');
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values
        ('${manager}','m08-manager','INTERNAL','ACTIVE','2026-01-01'),
        ('${vendorActor}','m08-vendor','VENDOR','ACTIVE','2026-01-01'),
        ('${labDirector}','m08-lab-director','INTERNAL','ACTIVE','2026-01-01'),
        ('${representative}','m08-representative','INTERNAL','ACTIVE','2026-01-01');
      insert into public.user_organization_assignment(id,user_id,organization_id,valid_from,grant_reason_code)
        values('80000000-0000-4000-8000-000000000020','${manager}','${org}','2026-01-01','M08-FIXTURE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code)
        values('80000000-0000-4000-8000-000000000021','${manager}','20000000-0000-4000-8000-000000000001','2026-01-01','M08-FIXTURE'),
          ('80000000-0000-4000-8000-000000000022','${labDirector}','20000000-0000-4000-8000-000000000001','2026-01-01','M08-FIXTURE'),
          ('80000000-0000-4000-8000-000000000023','${representative}','20000000-0000-4000-8000-000000000001','2026-01-01','M08-FIXTURE'),
          ('80000000-0000-4000-8000-000000000026','${manager}','20000000-0000-4000-8000-000000000012','2026-01-01','M08-FIXTURE');
      insert into public.user_position_assignment(id,user_id,position_id,valid_from,is_primary,grant_reason_code) values
        ('80000000-0000-4000-8000-000000000024','${labDirector}','10000000-0000-4000-8000-000000000003','2026-01-01',true,'M08-FIXTURE'),
        ('80000000-0000-4000-8000-000000000025','${representative}','10000000-0000-4000-8000-000000000004','2026-01-01',true,'M08-FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
        select ('80100000-0000-4000-8000-'||lpad(row_number() over(order by id)::text,12,'0'))::uuid,
          '20000000-0000-4000-8000-000000000001',id,'2026-01-01','M08-FIXTURE' from public.permission
        where stable_code in('inspection.record.inspect','inspection.record.decide','acceptance_payment.record.manage',
          'acceptance_payment.record.release','acceptance_payment.finance.read','contract.detail.finance.read','quality.test.manage','quality.policy.manage',
          'approval.instance.submit','approval.step.approve');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
        select '80000000-0000-4000-8000-000000000027','20000000-0000-4000-8000-000000000012',id,'2026-01-01','M08-FIXTURE'
        from public.permission where stable_code='approval.policy.manage';
      insert into public.project(id,project_code,name,organization_id,owner_user_id,objective,period_start,period_end,visibility_code,state,created_at,updated_at)
        values('${project}','M08-PROJECT','Project','${org}','${manager}','Objective','2026-08-01','2027-08-01','MEMBERS_ONLY','ACTIVE','${now}','${now}');
      begin;
      insert into public.requirement(id,project_id,requirement_code,title,state,current_revision_id,current_revision_no,version_no,created_at,updated_at)
        values('${requirement}','${project}','REQ-1','Requirement','ACTIVE','${revision1}',1,1,'${now}','${now}'),
          ('${otherRequirement}','${project}','REQ-2','Other Requirement','ACTIVE','${otherRevision}',1,1,'${now}','${now}');
      insert into public.requirement_revision(id,requirement_id,revision_no,criticality,target_value,acceptance_rule,change_reason,created_by_user_id,created_at)
        values('${revision1}','${requirement}',1,'NORMAL','10','exact','initial','${manager}','${now}'),
          ('${otherRevision}','${otherRequirement}',1,'NORMAL','20','exact','initial','${manager}','${now}');
      commit;
      begin;
      insert into public.test_plan(id,project_id,test_plan_no,state,current_version_id,current_version_no,row_version,created_at,updated_at)
        values('${testPlan}','${project}','TP-1','ACTIVE','${testPlanVersion}',1,1,'${now}','${now}');
      insert into public.test_plan_version(id,test_plan_id,version_no,conditions,method,repetitions,state,created_by_user_id,created_at)
        values('${testPlanVersion}','${testPlan}',1,'condition','method',1,'DRAFT','${manager}','${now}');
      insert into public.test_plan_equipment(test_plan_version_id,sequence_no,equipment_name) values('${testPlanVersion}',1,'Gauge');
      insert into public.test_plan_evidence_requirement(test_plan_version_id,evidence_type_code) values('${testPlanVersion}','TEST-REPORT');
      insert into public.test_plan_requirement_coverage(test_plan_version_id,requirement_id,requirement_revision_id,coverage_kind)
        values('${testPlanVersion}','${requirement}','${revision1}','FULL');
      select set_config('app.m08_seal_test_plan','${testPlanVersion}',true);
      update public.test_plan_version set state='SEALED',manifest_checksum=repeat('a',64),sealed_at='${now}',sealed_by_user_id='${manager}' where id='${testPlanVersion}';
      commit;
      insert into public.vendor(id,vendor_code,legal_name,status) values('80000000-0000-4000-8000-000000000050','M08-VENDOR','Vendor','ACTIVE');
      insert into public.vendor_user(id,vendor_id,user_id,status,valid_from,grant_reason_code)
        values('80000000-0000-4000-8000-000000000051','80000000-0000-4000-8000-000000000050','${vendorActor}','ACTIVE','2026-01-01','M08-FIXTURE');
      insert into public.vendor_contract(id,contract_no,vendor_id,manager_user_id,title,state,version_no,created_at,updated_at)
        values('80000000-0000-4000-8000-000000000052','M08-C-1','80000000-0000-4000-8000-000000000050','${manager}','Contract','ACTIVE',1,'${now}','${now}');
      insert into public.contract_project(id,contract_id,project_id,valid_from)
        values('80000000-0000-4000-8000-000000000053','80000000-0000-4000-8000-000000000052','${project}','2026-08-01');
      insert into public.contract_vendor_grant(id,contract_id,project_id,vendor_user_id,status,valid_from,granted_by_user_id,grant_reason_code)
        values('80000000-0000-4000-8000-000000000054','80000000-0000-4000-8000-000000000052','${project}',
          '80000000-0000-4000-8000-000000000051','ACTIVE','2026-08-01','${manager}','M08-FIXTURE');
      insert into public.contract_vendor_grant_action(grant_id,permission_id) values
        ('80000000-0000-4000-8000-000000000054','38000000-0000-4000-8000-000000000003'),
        ('80000000-0000-4000-8000-000000000054','38000000-0000-4000-8000-000000000006');
      set session_replication_role=replica;
      insert into public.contract_version(id,contract_id,version_no,version_kind,statement_of_work_document_version_id,requirements_document_version_id,
        effective_from,total_burden_amount,currency,vat_included,intellectual_property_terms_code,security_terms_code,warranty_terms_code,
        liability_terms_code,terms_text,preset_policy_id,preset_policy_version,legal_baseline_id,legal_baseline_version,override_applied,state,created_by_user_id,created_at)
      values('80000000-0000-4000-8000-000000000055','80000000-0000-4000-8000-000000000052',1,'ORIGINAL',
        '80000000-0000-4000-8000-000000000056','80000000-0000-4000-8000-000000000057','2026-08-01',1000,'KRW',true,
        'IP-TERMS','SECURITY-TERMS','WARRANTY-TERMS','LIABILITY-TERMS','terms','POL-CONTRACT',1,'LEGAL-BASELINE',1,false,'DRAFT','${manager}','${now}');
      set session_replication_role=origin;
      insert into public.contract_milestone(id,contract_version_id,sequence_no,milestone_code,title,planned_amount,planned_ratio,currency)
        values('80000000-0000-4000-8000-000000000058','80000000-0000-4000-8000-000000000055',1,'MILESTONE-1','Milestone',1000,100,'KRW');
      insert into public.deliverable(id,contract_id,contract_milestone_id,deliverable_code,title,assigned_vendor_id,state,created_at,updated_at)
        values('80000000-0000-4000-8000-000000000059','80000000-0000-4000-8000-000000000052','80000000-0000-4000-8000-000000000058',
          'DELIVERABLE-1','Deliverable','80000000-0000-4000-8000-000000000050','SUBMITTED','${now}','${now}');
      insert into public.deliverable_version(id,deliverable_id,version_no,manifest_checksum,submitter_user_id,created_at)
        values('80000000-0000-4000-8000-000000000060','80000000-0000-4000-8000-000000000059',1,repeat('b',64),'${vendorActor}','${now}');
      insert into public.acceptance_score_policy(id,stable_code,status,created_at)
        values('80000000-0000-4000-8000-000000000061','POL-M08-SCORE','ACTIVE','${now}');
      insert into public.acceptance_score_policy_version(id,policy_id,version_no,state,basis_kind,basis_reference_id,basis_version,
        rounding_decimal_places,rounding_mode,checksum,valid_from,created_by_user_id,created_at)
        values('80000000-0000-4000-8000-000000000062','80000000-0000-4000-8000-000000000061',1,'DRAFT','INTERNAL_PRESET',
          'POL-M08-SCORE',1,2,'HALF_UP',app_private.canonical_json_sha256(jsonb_build_object('schema','ACCEPTANCE_SCORE_POLICY_V1',
          'policyId','80000000-0000-4000-8000-000000000061'::uuid,'versionNo',1,'basisKind','INTERNAL_PRESET',
          'basisReferenceId','POL-M08-SCORE','basisVersion',1,'roundingDecimalPlaces',2,'roundingMode','HALF_UP',
          'validFrom','2026-01-01'::timestamptz,'validUntil',null,'bands',jsonb_build_array(
            jsonb_build_object('sequenceNo',1,'minimum',100::numeric,'maximum',null,'disposition','ACCEPTED','rateKind','ACHIEVEMENT_PERCENT','fixedRate',null),
            jsonb_build_object('sequenceNo',2,'minimum',90::numeric,'maximum',100::numeric,'disposition','CONDITIONAL_ACCEPTANCE','rateKind','ACHIEVEMENT_PERCENT','fixedRate',null),
            jsonb_build_object('sequenceNo',3,'minimum',60::numeric,'maximum',90::numeric,'disposition','PARTIAL_ACCEPTANCE','rateKind','ACHIEVEMENT_PERCENT','fixedRate',null),
            jsonb_build_object('sequenceNo',4,'minimum',0::numeric,'maximum',60::numeric,'disposition','REJECTED','rateKind','ZERO','fixedRate',null)))),
          '2026-01-01','${manager}','${now}');
      insert into public.acceptance_score_policy_band(id,policy_version_id,sequence_no,minimum_achievement_inclusive,maximum_achievement_exclusive,disposition,proposed_rate_kind) values
        ('80000000-0000-4000-8000-000000000063','80000000-0000-4000-8000-000000000062',1,100,null,'ACCEPTED','ACHIEVEMENT_PERCENT'),
        ('80000000-0000-4000-8000-000000000064','80000000-0000-4000-8000-000000000062',2,90,100,'CONDITIONAL_ACCEPTANCE','ACHIEVEMENT_PERCENT'),
        ('80000000-0000-4000-8000-000000000065','80000000-0000-4000-8000-000000000062',3,60,90,'PARTIAL_ACCEPTANCE','ACHIEVEMENT_PERCENT'),
        ('80000000-0000-4000-8000-000000000066','80000000-0000-4000-8000-000000000062',4,0,60,'REJECTED','ZERO');
      begin; ${requestContext(manager)}
      select public.publish_m08_policy_version('ACCEPTANCE_SCORE','80000000-0000-4000-8000-000000000062',
        (select checksum from public.acceptance_score_policy_version where id='80000000-0000-4000-8000-000000000062'),
        '80000000-0000-4000-8000-000000000028','${now}'); commit;
      begin;
      insert into public.inspection(id,inspection_no,inspection_type_code,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id,
        assigned_vendor_id,inspection_checklist_version_id,state,scheduled_at,version_no,created_at,updated_at)
      values('80000000-0000-4000-8000-000000000067','INSPECTION-1','FINAL','80000000-0000-4000-8000-000000000052',
        '80000000-0000-4000-8000-000000000058','80000000-0000-4000-8000-000000000059','80000000-0000-4000-8000-000000000060',
        '80000000-0000-4000-8000-000000000050','80000000-0000-4000-8000-000000000068','SCHEDULED','${now}',1,'${now}','${now}');
      insert into public.inspection_checklist_version(id,inspection_id,version_no,policy_version_id,policy_id,policy_version_no,policy_checksum,state)
        values('80000000-0000-4000-8000-000000000068','80000000-0000-4000-8000-000000000067',1,'80000000-0000-4000-8000-000000000062',
          '80000000-0000-4000-8000-000000000061',1,
          (select checksum from public.acceptance_score_policy_version where id='80000000-0000-4000-8000-000000000062'),'DRAFT');
      insert into public.inspection_criterion(id,inspection_checklist_version_id,sequence_no,criterion_code,title,weight_percent,critical,measurement_rule,pass_rule)
        values('80000000-0000-4000-8000-000000000069','80000000-0000-4000-8000-000000000068',1,'CRITERION-1','Criterion',100,false,'measure','pass');
      insert into public.inspection_criterion_evidence_requirement(inspection_criterion_id,evidence_type_code)
        values('80000000-0000-4000-8000-000000000069','TEST-REPORT');
      select set_config('app.m08_seal_checklist','80000000-0000-4000-8000-000000000068',true);
      update public.inspection_checklist_version set state='SEALED',total_weight_percent=100,checksum=repeat('d',64),sealed_at='${now}',sealed_by_user_id='${manager}'
        where id='80000000-0000-4000-8000-000000000068';
      commit;
      begin;
      insert into public.attachment(id,storage_provider,bucket_code,storage_key,declared_mime_type,declared_size_bytes,expected_sha256,
        detected_mime_type,detected_size_bytes,detected_sha256,signature_validation,scanner_id,scanner_version,scan_evidence_id,scan_verdict,
        security_level,uploader_user_id,state,row_version,intent_expires_at,created_at,verified_at,scanned_at)
      values('80000000-0000-4000-8000-000000000070','SUPABASE_PRIVATE','PRIVATE_BUSINESS','m08/private/evidence/0001','application/pdf',10,repeat('e',64),
        'application/pdf',10,repeat('e',64),'MATCH','FILE-SCANNER','V1','80000000-0000-4000-8000-000000000071','CLEAN',
        'SEC_L2_INTERNAL','${manager}','AVAILABLE',1,'2026-08-23','${now}','${now}','${now}');
      insert into public.file_scan_evidence(id,attachment_id,detected_sha256,scanner_id,scanner_version,verdict,scanned_at)
      values('80000000-0000-4000-8000-000000000071','80000000-0000-4000-8000-000000000070',repeat('e',64),
        'FILE-SCANNER','V1','CLEAN','${now}');
      commit;
    `);
  }, 30_000);

  it("applies M02 through M08 cleanly with exact constraints and FORCE RLS", () => {
    const tables = ["requirement_revision", "test_plan_version", "test_result", "inspection", "inspection_attempt", "acceptance_payment_decision", "approval_subject_acceptance_payment_decision"];
    expect(run(`select count(*) from information_schema.tables where table_schema='public' and table_name in (${tables.map((name) => `'${name}'`).join(",")});`)).toBe(String(tables.length));
    expect(run(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in (${tables.map((name) => `'${name}'`).join(",")}) and relrowsecurity and relforcerowsecurity;`)).toBe(String(tables.length));
    expect(run("select count(*) from pg_constraint where conrelid='public.test_measurement'::regclass and pg_get_constraintdef(oid) like 'FOREIGN KEY (test_plan_version_id, requirement_revision_id)%';")).toBe("1");
  });

  it("rejects skipped Requirement revisions and uncovered measurements", () => {
    run(`insert into public.requirement_revision(id,requirement_id,revision_no,previous_revision_id,criticality,target_value,acceptance_rule,change_reason,created_by_user_id,created_at)
      values('80000000-0000-4000-8000-000000000030','${requirement}',3,'${revision1}','NORMAL','11','exact','skip','${manager}','${now}');`, false);
    run(`begin;
      insert into public.test_result(id,test_plan_id,test_plan_version_id,test_plan_version_no,execution_no,state,executed_by_user_id,executed_at)
        values('80000000-0000-4000-8000-000000000031','${testPlan}','${testPlanVersion}',1,1,'DRAFT','${manager}','${now}');
      select set_config('app.m08_test_result_command','80000000-0000-4000-8000-000000000031',true);
      insert into public.test_measurement(id,test_result_id,test_plan_version_id,requirement_id,requirement_revision_id,sequence_no,observed_value,verdict)
        values('80000000-0000-4000-8000-000000000032','80000000-0000-4000-8000-000000000031','${testPlanVersion}','${otherRequirement}','${otherRevision}',1,'20','PASS');
      commit;`, false);
  });

  it("keeps sealed plan children and TestResult evidence append boundary immutable", () => {
    run(`insert into public.test_plan_equipment(test_plan_version_id,sequence_no,equipment_name) values('${testPlanVersion}',2,'Late');`, false);
    expect(run("select has_table_privilege('youone_request','public.test_measurement','insert');")).toBe("f");
    expect(run("select has_table_privilege('youone_privileged_writer','public.inspection_attempt','insert');")).toBe("f");
  });

  it("starts one exact attempt and rolls back evidence/results/outbox on checksum failure", () => {
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.begin_inspection_attempt('80000000-0000-4000-8000-000000000067','80000000-0000-4000-8000-000000000072',1,
        '80000000-0000-4000-8000-000000000073','80000000-0000-4000-8000-000000000074','80000000-0000-4000-8000-000000000075','${now}'); commit;`);
    expect(run("select state||':'||version_no||':'||open_attempt_no from public.inspection where id='80000000-0000-4000-8000-000000000067';")).toBe("IN_PROGRESS:2:1");
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.submit_inspection_decision('80000000-0000-4000-8000-000000000067','80000000-0000-4000-8000-000000000072',2,
        '[{"id":"80000000-0000-4000-8000-000000000076","attachment_id":"80000000-0000-4000-8000-000000000070","attachment_row_version":1,"content_checksum":"${"e".repeat(64)}","evidence_type_code":"TEST-REPORT"}]'::jsonb,
        '[{"id":"80000000-0000-4000-8000-000000000077","criterion_id":"80000000-0000-4000-8000-000000000069","achieved_percent":100,"verdict":"PASS","observed_value":"100","evidence_ids":["80000000-0000-4000-8000-000000000076"]}]'::jsonb,
        '[]'::jsonb,'[]'::jsonb,repeat('f',64),'80000000-0000-4000-8000-000000000078','80000000-0000-4000-8000-000000000079',
        '80000000-0000-4000-8000-000000000080','${now}'); commit;`, false);
    expect(run("select (select count(*) from public.inspection_evidence where id='80000000-0000-4000-8000-000000000076')||':'||(select count(*) from public.inspection_criterion_result where inspection_attempt_id='80000000-0000-4000-8000-000000000072')||':'||(select state from public.inspection where id='80000000-0000-4000-8000-000000000067');")).toBe("0:0:IN_PROGRESS");
  });

  it("freezes a sealed attempt and lets only an internal decider transition with audit/outbox", () => {
    run(`begin;
      insert into public.inspection_evidence(id,inspection_id,attachment_id,attachment_row_version,content_checksum,evidence_type_code,created_at)
        values('80000000-0000-4000-8000-000000000076','80000000-0000-4000-8000-000000000067','80000000-0000-4000-8000-000000000070',1,repeat('e',64),'TEST-REPORT','${now}');
      insert into public.inspection_attempt_evidence(inspection_attempt_id,inspection_id,inspection_evidence_id)
        values('80000000-0000-4000-8000-000000000072','80000000-0000-4000-8000-000000000067','80000000-0000-4000-8000-000000000076');
      insert into public.inspection_criterion_result(id,inspection_attempt_id,inspection_checklist_version_id,inspection_criterion_id,achieved_percent,verdict,observed_value)
        values('80000000-0000-4000-8000-000000000077','80000000-0000-4000-8000-000000000072','80000000-0000-4000-8000-000000000068',
          '80000000-0000-4000-8000-000000000069',100,'PASS','100');
      insert into public.inspection_criterion_result_evidence(inspection_criterion_result_id,inspection_attempt_id,inspection_id,inspection_evidence_id)
        values('80000000-0000-4000-8000-000000000077','80000000-0000-4000-8000-000000000072','80000000-0000-4000-8000-000000000067','80000000-0000-4000-8000-000000000076');
      select set_config('app.m08_seal_attempt','80000000-0000-4000-8000-000000000072',true);
      update public.inspection_attempt set state='SEALED',disposition='ACCEPTED',achievement_percent=100,checksum=repeat('f',64),sealed_at='${now}'
        where id='80000000-0000-4000-8000-000000000072';
      update public.inspection set state='DECISION_PENDING',open_attempt_id=null,open_attempt_no=null,
        latest_sealed_attempt_id='80000000-0000-4000-8000-000000000072',latest_attempt_no=1,version_no=3 where id='80000000-0000-4000-8000-000000000067';
      commit;`);
    run("update public.inspection_attempt set achievement_percent=99 where id='80000000-0000-4000-8000-000000000072';", false);
    run("delete from public.inspection_attempt where id='80000000-0000-4000-8000-000000000072';", false);
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.decide_inspection('80000000-0000-4000-8000-000000000067',3,null,
        '80000000-0000-4000-8000-000000000081','80000000-0000-4000-8000-000000000082','80000000-0000-4000-8000-000000000083','${now}'); commit;`);
    expect(run("select state||':'||final_disposition||':'||version_no from public.inspection where id='80000000-0000-4000-8000-000000000067';")).toBe("COMPLETED:ACCEPTED:4");
    expect(run("select count(*) from public.audit_log a join public.state_transition_history t on t.audit_log_id=a.id join public.outbox_event o on o.initiating_audit_log_id=a.id where a.id='80000000-0000-4000-8000-000000000081';")).toBe("1");
  });

  it("denies Vendor self-accept before resource lookup and exposes no finance fields externally", () => {
    run(`begin; set local role youone_request; ${requestContext(vendorActor)}
      select public.decide_inspection('80000000-0000-4000-8000-000000000099',1,'VENDOR-SELF-ACCEPT',
        '80000000-0000-4000-8000-000000000091','80000000-0000-4000-8000-000000000092','80000000-0000-4000-8000-000000000093','${now}'); rollback;`, false);
    expect(run("select pg_get_function_result('public.read_inspection_external(uuid,timestamptz)'::regprocedure);")).not.toMatch(/amount|currency|rate|payment|internal|inspector|decider/i);
    expect(run("select has_function_privilege('youone_request','public.read_acceptance_payment_finance(uuid,timestamptz)','execute');")).toBe("t");
    expect(run("select has_table_privilege('youone_request','public.acceptance_payment_decision','select');")).toBe("f");
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.read_inspection_external('80000000-0000-4000-8000-000000000052','${now}'); rollback;`).split("\n").at(-1)).toBe("1");
    run(`update public.user_account set status='DISABLED' where id='${vendorActor}';`);
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.read_inspection_external('80000000-0000-4000-8000-000000000052','${now}'); rollback;`).split("\n").at(-1)).toBe("0");
    run(`update public.user_account set status='ACTIVE' where id='${vendorActor}';`);
    run(`update public.user_account set status='DISABLED' where id='${manager}';`);
    expect(run(`begin; set local role youone_request; ${requestContext(manager)} select count(*) from public.inspection where id='80000000-0000-4000-8000-000000000067'; rollback;`).split("\n").at(-1)).toBe("0");
    run(`update public.user_account set status='ACTIVE' where id='${manager}';`);
  });

  it("requires exact typed Approval and cross-subject composite foreign keys", () => {
    expect(run("select count(*) from pg_constraint where conrelid='public.approval_subject_acceptance_payment_decision'::regclass and pg_get_constraintdef(oid) like 'FOREIGN KEY (acceptance_payment_decision_id, decision_root_id, decision_revision_no, subject_version_no, subject_checksum, subject_sealed_at)%';")).toBe("1");
    expect(run("select count(*) from pg_constraint where conrelid='public.inspection_criterion_result_evidence'::regclass and pg_get_constraintdef(oid) like 'FOREIGN KEY (inspection_attempt_id, inspection_evidence_id)%';")).toBe("1");
    expect(run("select count(*) from pg_constraint where conrelid='public.acceptance_payment_decision'::regclass and pg_get_constraintdef(oid) like 'FOREIGN KEY (inspection_attempt_id, inspection_id, inspection_attempt_no, inspection_attempt_checksum)%';")).toBe("1");
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.append_inspection_evidence('80000000-0000-4000-8000-000000000067','80000000-0000-4000-8000-000000000133',
        '80000000-0000-4000-8000-000000000070',999,repeat('e',64),'RESIDUAL-EVIDENCE',
        '80000000-0000-4000-8000-000000000134','${now}'); commit;`, false);
  });

  it("calculates and adjusts from exact evidence, freezes the final rate, and releases eligibility separately", () => {
    run(`
      insert into public.acceptance_payment_policy(id,stable_code,status,created_at)
        values('80000000-0000-4000-8000-000000000084','POL-M08-PAYMENT','ACTIVE','${now}');
      insert into public.acceptance_payment_policy_version(id,policy_id,version_no,score_policy_version_id,score_policy_id,score_policy_version_no,
        score_policy_checksum,state,basis_kind,basis_reference_id,basis_version,amount_rounding_decimal_places,amount_rounding_mode,
        checksum,valid_from,created_by_user_id,created_at)
      values('80000000-0000-4000-8000-000000000085','80000000-0000-4000-8000-000000000084',1,
        '80000000-0000-4000-8000-000000000062','80000000-0000-4000-8000-000000000061',1,
        (select checksum from public.acceptance_score_policy_version where id='80000000-0000-4000-8000-000000000062'),'DRAFT',
        'INTERNAL_PRESET','POL-M08-PAYMENT',1,2,'HALF_UP',app_private.canonical_json_sha256(jsonb_build_object('schema','ACCEPTANCE_PAYMENT_POLICY_V1',
          'policyId','80000000-0000-4000-8000-000000000084'::uuid,'versionNo',1,
          'scorePolicyVersionId','80000000-0000-4000-8000-000000000062'::uuid,
          'scorePolicyChecksum',(select checksum from public.acceptance_score_policy_version where id='80000000-0000-4000-8000-000000000062'),
          'basisKind','INTERNAL_PRESET','basisReferenceId','POL-M08-PAYMENT','basisVersion',1,
          'amountRoundingDecimalPlaces',2,'amountRoundingMode','HALF_UP',
          'validFrom','2026-01-01'::timestamptz,'validUntil',null,'rules',jsonb_build_array(
            jsonb_build_object('sequenceNo',1,'minimum',100::numeric,'maximum',null,'disposition','ACCEPTED','rateKind','ACHIEVEMENT_PERCENT','fixedRate',null),
            jsonb_build_object('sequenceNo',2,'minimum',90::numeric,'maximum',100::numeric,'disposition','CONDITIONAL_ACCEPTANCE','rateKind','ACHIEVEMENT_PERCENT','fixedRate',null),
            jsonb_build_object('sequenceNo',3,'minimum',60::numeric,'maximum',90::numeric,'disposition','PARTIAL_ACCEPTANCE','rateKind','ACHIEVEMENT_PERCENT','fixedRate',null),
            jsonb_build_object('sequenceNo',4,'minimum',0::numeric,'maximum',60::numeric,'disposition','REJECTED','rateKind','ZERO','fixedRate',null)))),
        '2026-01-01','${manager}','${now}');
      insert into public.acceptance_payment_rate_rule(id,policy_version_id,sequence_no,minimum_achievement_inclusive,maximum_achievement_exclusive,disposition,proposed_rate_kind) values
        ('80000000-0000-4000-8000-000000000086','80000000-0000-4000-8000-000000000085',1,100,null,'ACCEPTED','ACHIEVEMENT_PERCENT'),
        ('80000000-0000-4000-8000-000000000138','80000000-0000-4000-8000-000000000085',2,90,100,'CONDITIONAL_ACCEPTANCE','ACHIEVEMENT_PERCENT'),
        ('80000000-0000-4000-8000-000000000139','80000000-0000-4000-8000-000000000085',3,60,90,'PARTIAL_ACCEPTANCE','ACHIEVEMENT_PERCENT'),
        ('80000000-0000-4000-8000-000000000140','80000000-0000-4000-8000-000000000085',4,0,60,'REJECTED','ZERO');
    `);
    const paymentPolicyChecksum = run("select checksum from public.acceptance_payment_policy_version where id='80000000-0000-4000-8000-000000000085';");
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.publish_m08_policy_version('ACCEPTANCE_PAYMENT','80000000-0000-4000-8000-000000000085','${paymentPolicyChecksum}',
        '80000000-0000-4000-8000-000000000137','${now}'); commit;`);
    run(`begin; set local role youone_privileged_writer; ${systemContext("QUALITY_PAYMENT_ENGINE")}
      select public.calculate_acceptance_payment_decision('80000000-0000-4000-8000-000000000087','80000000-0000-4000-8000-000000000087',1,null,
        '80000000-0000-4000-8000-000000000072','80000000-0000-4000-8000-000000000085',false,'RISK-NORMAL',
        '80000000-0000-4000-8000-000000000088','80000000-0000-4000-8000-000000000089','80000000-0000-4000-8000-000000000090','${now}'); commit;`);
    expect(run("select state||':'||calculated_proposed_rate||':'||external_transfer_executed from public.acceptance_payment_decision where id='80000000-0000-4000-8000-000000000087';")).toBe("CALCULATED:100.000000:false");
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.propose_payment_rate_adjustment('80000000-0000-4000-8000-000000000087','80000000-0000-4000-8000-000000000091',95,
        'ADJUST-EVIDENCE',array['80000000-0000-4000-8000-000000000076'::uuid],1,
        '80000000-0000-4000-8000-000000000092','80000000-0000-4000-8000-000000000093','80000000-0000-4000-8000-000000000094','${now}'); commit;`);
    expect(run("select state||':'||adjusted_requested_rate||':'||(select count(*) from public.payment_rate_adjustment_evidence e where e.adjustment_id='80000000-0000-4000-8000-000000000091') from public.acceptance_payment_decision where id='80000000-0000-4000-8000-000000000087';")).toBe("ADJUSTMENT_PROPOSED:95.000000:1");
    run(`
      insert into public.approval_policy(id,stable_code,status,version_no,created_at)
        values('80000000-0000-4000-8000-000000000096','POL-M08-PAYMENT-APPROVAL','ACTIVE',1,'${now}');
      insert into public.approval_policy_version(id,policy_id,version_no,state,subject_kind,checksum,recall_allowed,valid_from,created_by_user_id,created_at)
        values('80000000-0000-4000-8000-000000000095','80000000-0000-4000-8000-000000000096',1,'DRAFT',
          'ACCEPTANCE_PAYMENT_DECISION',repeat('2',64),true,'2026-01-01','${manager}','${now}');
      insert into public.approval_policy_step_rule(id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required) values
        ('80000000-0000-4000-8000-000000000100','80000000-0000-4000-8000-000000000095','LAB-DIRECTOR-APPROVAL',1,'APPROVAL','SEQUENTIAL',true),
        ('80000000-0000-4000-8000-000000000101','80000000-0000-4000-8000-000000000095','REPRESENTATIVE-APPROVAL',2,'APPROVAL','ANY_ONE',true);
      insert into public.approval_policy_participant_rule(id,step_rule_id,selector_kind,position_id,participant_order,required_for_completion) values
        ('80000000-0000-4000-8000-000000000102','80000000-0000-4000-8000-000000000100','POSITION','10000000-0000-4000-8000-000000000003',1,true),
        ('80000000-0000-4000-8000-000000000103','80000000-0000-4000-8000-000000000101','POSITION','10000000-0000-4000-8000-000000000004',1,true);
      insert into public.approval_policy_acceptance_payment_selector(policy_version_id,minimum_milestone_amount_inclusive,
        maximum_milestone_amount_exclusive,currency,strengthened_risk_required,representative_step_required,
        representative_completion_mode,covers_upward_adjustment,selector_checksum)
      select '80000000-0000-4000-8000-000000000095',0,null,'KRW',false,true,'ANY_ONE',true,
        app_private.canonical_json_sha256(jsonb_build_object('schema','ACCEPTANCE_PAYMENT_APPROVAL_SELECTOR_V1',
          'policyVersionId','80000000-0000-4000-8000-000000000095'::uuid,'minimumAmount',0::numeric,
          'maximumAmount',null,'currency','KRW'::char(3),'strengthenedRiskRequired',false,
          'representativeMode','ANY_ONE','coversUpwardAdjustment',true));
      update public.approval_policy_version set checksum=app_private.acceptance_payment_approval_policy_checksum(id)
        where id='80000000-0000-4000-8000-000000000095';
    `);
    const approvalPolicyChecksum = run("select checksum from public.approval_policy_version where id='80000000-0000-4000-8000-000000000095';");
    run(`begin; set local role youone_request; ${requestContext(labDirector)}
      select public.publish_acceptance_payment_approval_policy('80000000-0000-4000-8000-000000000095','${approvalPolicyChecksum}',
        '80000000-0000-4000-8000-000000000136','${now}'); commit;`, false);
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.publish_acceptance_payment_approval_policy('80000000-0000-4000-8000-000000000095',
        '${approvalPolicyChecksum}',
        '80000000-0000-4000-8000-000000000135','${now}'); commit;`);
    run(`
      insert into public.approval_policy(id,stable_code,status,version_no,created_at)
        values('80000000-0000-4000-8000-000000000141','POL-M08-BAD-LINE','ACTIVE',1,'${now}');
      insert into public.approval_policy_version(id,policy_id,version_no,state,subject_kind,checksum,recall_allowed,valid_from,created_by_user_id,created_at)
        values('80000000-0000-4000-8000-000000000142','80000000-0000-4000-8000-000000000141',1,'DRAFT',
          'ACCEPTANCE_PAYMENT_DECISION',repeat('4',64),true,'2026-01-01','${manager}','${now}');
      insert into public.approval_policy_step_rule(id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required)
        values('80000000-0000-4000-8000-000000000143','80000000-0000-4000-8000-000000000142','LAB-DIRECTOR-ONLY',1,'APPROVAL','SEQUENTIAL',true);
      insert into public.approval_policy_participant_rule(id,step_rule_id,selector_kind,position_id,participant_order,required_for_completion)
        values('80000000-0000-4000-8000-000000000144','80000000-0000-4000-8000-000000000143','POSITION','10000000-0000-4000-8000-000000000003',1,true);
      insert into public.approval_policy_acceptance_payment_selector(policy_version_id,minimum_milestone_amount_inclusive,
        currency,strengthened_risk_required,representative_step_required,representative_completion_mode,covers_upward_adjustment,selector_checksum)
      select '80000000-0000-4000-8000-000000000142',0,'KRW',false,true,'ANY_ONE',true,
        app_private.canonical_json_sha256(jsonb_build_object('schema','ACCEPTANCE_PAYMENT_APPROVAL_SELECTOR_V1',
          'policyVersionId','80000000-0000-4000-8000-000000000142'::uuid,'minimumAmount',0::numeric,'maximumAmount',null,
          'currency','KRW'::char(3),'strengthenedRiskRequired',false,'representativeMode','ANY_ONE','coversUpwardAdjustment',true));
      update public.approval_policy_version set checksum=app_private.acceptance_payment_approval_policy_checksum(id)
        where id='80000000-0000-4000-8000-000000000142';
    `);
    const badLineChecksum = run("select checksum from public.approval_policy_version where id='80000000-0000-4000-8000-000000000142';");
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.publish_acceptance_payment_approval_policy('80000000-0000-4000-8000-000000000142','${badLineChecksum}',
        '80000000-0000-4000-8000-000000000145','${now}'); commit;`, false);
    run(`
      insert into public.approval_policy(id,stable_code,status,version_no,created_at)
        values('80000000-0000-4000-8000-000000000146','POL-M08-OVERLAP','ACTIVE',1,'${now}');
      insert into public.approval_policy_version(id,policy_id,version_no,state,subject_kind,checksum,recall_allowed,valid_from,created_by_user_id,created_at)
        values('80000000-0000-4000-8000-000000000147','80000000-0000-4000-8000-000000000146',1,'DRAFT',
          'ACCEPTANCE_PAYMENT_DECISION',repeat('5',64),true,'2026-01-01','${manager}','${now}');
      insert into public.approval_policy_step_rule(id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required) values
        ('80000000-0000-4000-8000-000000000148','80000000-0000-4000-8000-000000000147','LAB-DIRECTOR-APPROVAL',1,'APPROVAL','SEQUENTIAL',true),
        ('80000000-0000-4000-8000-000000000149','80000000-0000-4000-8000-000000000147','REPRESENTATIVE-APPROVAL',2,'APPROVAL','ANY_ONE',true);
      insert into public.approval_policy_participant_rule(id,step_rule_id,selector_kind,position_id,participant_order,required_for_completion) values
        ('80000000-0000-4000-8000-000000000150','80000000-0000-4000-8000-000000000148','POSITION','10000000-0000-4000-8000-000000000003',1,true),
        ('80000000-0000-4000-8000-000000000151','80000000-0000-4000-8000-000000000149','POSITION','10000000-0000-4000-8000-000000000004',1,true);
      insert into public.approval_policy_acceptance_payment_selector(policy_version_id,minimum_milestone_amount_inclusive,
        currency,strengthened_risk_required,representative_step_required,representative_completion_mode,covers_upward_adjustment,selector_checksum)
      select '80000000-0000-4000-8000-000000000147',0,'KRW',false,true,'ANY_ONE',true,
        app_private.canonical_json_sha256(jsonb_build_object('schema','ACCEPTANCE_PAYMENT_APPROVAL_SELECTOR_V1',
          'policyVersionId','80000000-0000-4000-8000-000000000147'::uuid,'minimumAmount',0::numeric,'maximumAmount',null,
          'currency','KRW'::char(3),'strengthenedRiskRequired',false,'representativeMode','ANY_ONE','coversUpwardAdjustment',true));
      update public.approval_policy_version set checksum=app_private.acceptance_payment_approval_policy_checksum(id)
        where id='80000000-0000-4000-8000-000000000147';
    `);
    const overlapChecksum = run("select checksum from public.approval_policy_version where id='80000000-0000-4000-8000-000000000147';");
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.publish_acceptance_payment_approval_policy('80000000-0000-4000-8000-000000000147','${overlapChecksum}',
        '80000000-0000-4000-8000-000000000152','${now}'); commit;`, false);
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.create_acceptance_payment_approval_instance('80000000-0000-4000-8000-000000000087',2,
        '80000000-0000-4000-8000-000000000104','80000000-0000-4000-8000-000000000095',
        '${approvalPolicyChecksum}',null,1,
        '80000000-0000-4000-8000-000000000105','80000000-0000-4000-8000-000000000106','80000000-0000-4000-8000-000000000107',
        '80000000-0000-4000-8000-000000000108','80000000-0000-4000-8000-000000000109','80000000-0000-4000-8000-000000000110','${now}');
      select public.submit_acceptance_payment_approval_instance('80000000-0000-4000-8000-000000000104',1,
        '80000000-0000-4000-8000-000000000111','80000000-0000-4000-8000-000000000112','80000000-0000-4000-8000-000000000113',
        '80000000-0000-4000-8000-000000000114','${now}'); commit;`);
    run(`begin; set local role youone_privileged_writer; ${systemContext("APPROVAL_ENGINE")}
      select public.activate_approval_instance('80000000-0000-4000-8000-000000000104',2,
        '80000000-0000-4000-8000-000000000115','80000000-0000-4000-8000-000000000116','80000000-0000-4000-8000-000000000117',
        '80000000-0000-4000-8000-000000000118','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext(labDirector)}
      select public.perform_acceptance_payment_approval_action('80000000-0000-4000-8000-000000000104',
        (select id from public.approval_step where instance_id='80000000-0000-4000-8000-000000000104' and sequence_no=1),
        (select p.id from public.approval_participant p join public.approval_step s on s.id=p.step_id
          where s.instance_id='80000000-0000-4000-8000-000000000104' and s.sequence_no=1 and p.participant_user_id='${labDirector}'),
        'APPROVE',3,1,1,'80000000-0000-4000-8000-000000000119','80000000-0000-4000-8000-000000000120',
        '80000000-0000-4000-8000-000000000121','80000000-0000-4000-8000-000000000122',null,'LAB-DIRECTOR-APPROVED',3,
        '80000000-0000-4000-8000-000000000123','80000000-0000-4000-8000-000000000124','80000000-0000-4000-8000-000000000125','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext(representative)}
      select public.perform_acceptance_payment_approval_action('80000000-0000-4000-8000-000000000104',
        (select id from public.approval_step where instance_id='80000000-0000-4000-8000-000000000104' and sequence_no=2),
        (select p.id from public.approval_participant p join public.approval_step s on s.id=p.step_id
          where s.instance_id='80000000-0000-4000-8000-000000000104' and s.sequence_no=2 and p.participant_user_id='${representative}'),
        'APPROVE',4,1,1,'80000000-0000-4000-8000-000000000126','80000000-0000-4000-8000-000000000127',
        '80000000-0000-4000-8000-000000000128','80000000-0000-4000-8000-000000000129',null,'REPRESENTATIVE-APPROVED',3,
        '80000000-0000-4000-8000-000000000130','80000000-0000-4000-8000-000000000131','80000000-0000-4000-8000-000000000132','${now}'); commit;`);
    expect(run("select i.state||':'||d.state||':'||d.final_approved_rate||':'||d.approved_payable_amount||':'||o.outcome from public.approval_instance i join public.acceptance_payment_decision d on d.approval_instance_id=i.id join public.acceptance_payment_approval_outcome o on o.approval_instance_id=i.id where i.id='80000000-0000-4000-8000-000000000104';")).toBe("COMPLETED:APPROVED:95.000000:950.00:APPROVED");
    run(`select set_config('app.m08_payment_command','80000000-0000-4000-8000-000000000087',true);
      update public.acceptance_payment_decision set final_approved_rate=94 where id='80000000-0000-4000-8000-000000000087';`, false);
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.mark_acceptance_payment_eligible('80000000-0000-4000-8000-000000000087',4,'EXTERNAL-ELIGIBILITY',
        '80000000-0000-4000-8000-000000000097','80000000-0000-4000-8000-000000000098','80000000-0000-4000-8000-000000000099','${now}'); commit;`);
    expect(run("select state||':'||final_approved_rate||':'||external_transfer_executed from public.acceptance_payment_decision where id='80000000-0000-4000-8000-000000000087';")).toBe("ELIGIBLE_FOR_EXTERNAL_PAYMENT:95.000000:false");
    run(`begin; set local role youone_privileged_writer; ${systemContext("QUALITY_PAYMENT_ENGINE")}
      select public.calculate_acceptance_payment_decision('80000000-0000-4000-8000-000000000153','80000000-0000-4000-8000-000000000087',2,
        '80000000-0000-4000-8000-000000000087','80000000-0000-4000-8000-000000000072',
        '80000000-0000-4000-8000-000000000085',false,'RISK-NORMAL','80000000-0000-4000-8000-000000000154',
        '80000000-0000-4000-8000-000000000155','80000000-0000-4000-8000-000000000156','${now}'); commit;`, false);
  });

  it("releases conditional and partial decisions only after exact held-basis evidence", () => {
    const conditional = createAcceptanceFixture("CONDITIONAL_ACCEPTANCE", 1000);
    const conditionalDecision = liveId(1020);
    run(`begin; set local role youone_privileged_writer; ${systemContext("QUALITY_PAYMENT_ENGINE")}
      select public.calculate_acceptance_payment_decision('${conditionalDecision}','${conditionalDecision}',1,null,'${conditional.attemptId}',
        '80000000-0000-4000-8000-000000000085',false,'RISK-NORMAL','${liveId(1021)}','${liveId(1022)}','${liveId(1023)}','${now}'); commit;`);
    expect(completePaymentApproval(conditionalDecision, 1, liveId(1030), 1040)).toBe(3);
    run(`begin; set local role youone_privileged_writer; ${systemContext("QUALITY_PAYMENT_ENGINE")}
      select public.hold_acceptance_payment_for_conditions('${conditionalDecision}',3,100,100,array[]::uuid[],'CONDITIONAL-HOLD',
        '${liveId(1070)}','${liveId(1071)}','${liveId(1072)}','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.append_inspection_evidence('${conditional.inspectionId}','${liveId(1073)}',
        '80000000-0000-4000-8000-000000000070',1,repeat('e',64),'CONDITION-SATISFACTION','${liveId(1074)}','${now}'); commit;`);
    const conditionId = run(`select id from public.acceptance_payment_residual_condition
      where acceptance_payment_decision_id='${conditionalDecision}' and inspection_residual_condition_id='${conditional.basisId}';`);
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.satisfy_acceptance_payment_condition('${conditionId}',4,array['${liveId(1073)}'::uuid],
        'CONDITION-EVIDENCE-VERIFIED','${liveId(1075)}','${liveId(1076)}','${liveId(1077)}','${now}');
      select public.mark_acceptance_payment_eligible('${conditionalDecision}',5,'ALL-CONDITIONS-SATISFIED',
        '${liveId(1078)}','${liveId(1079)}','${liveId(1080)}','${now}'); commit;`);
    expect(run(`select d.state||':'||c.state||':'||d.held_amount||':'||d.unpaid_remainder||':'||count(e.inspection_evidence_id)
      from public.acceptance_payment_decision d join public.acceptance_payment_residual_condition c on c.acceptance_payment_decision_id=d.id
      left join public.acceptance_payment_residual_condition_evidence e on e.acceptance_payment_residual_condition_id=c.id
      where d.id='${conditionalDecision}' group by d.state,c.state,d.held_amount,d.unpaid_remainder;`)).toBe("ELIGIBLE_FOR_EXTERNAL_PAYMENT:SATISFIED:0.00:0.00:1");
    expect(run(`select count(*) from public.audit_log a join public.state_transition_history t on t.audit_log_id=a.id
      join public.outbox_event o on o.initiating_audit_log_id=a.id
      where a.id in ('${liveId(1070)}','${liveId(1075)}','${liveId(1078)}');`)).toBe("3");
    expect(run(`select count(*) from public.audit_log where id='${liveId(1074)}' and result='SUCCEEDED';`)).toBe("1");

    const partial = createAcceptanceFixture("PARTIAL_ACCEPTANCE", 1200);
    const partialDecision = liveId(1220);
    run(`begin; set local role youone_privileged_writer; ${systemContext("QUALITY_PAYMENT_ENGINE")}
      select public.calculate_acceptance_payment_decision('${partialDecision}','${partialDecision}',1,null,'${partial.attemptId}',
        '80000000-0000-4000-8000-000000000085',false,'RISK-NORMAL','${liveId(1221)}','${liveId(1222)}','${liveId(1223)}','${now}'); commit;`);
    expect(completePaymentApproval(partialDecision, 1, liveId(1230), 1240)).toBe(3);
    const usablePortionId = run(`select id from public.acceptance_payment_usable_portion
      where acceptance_payment_decision_id='${partialDecision}' and inspection_usable_portion_id='${partial.basisId}';`);
    run(`begin; set local role youone_privileged_writer; ${systemContext("QUALITY_PAYMENT_ENGINE")}
      select public.hold_acceptance_payment_for_conditions('${partialDecision}',3,100,100,array[]::uuid[],'PARTIAL-HOLD',
        '${liveId(1270)}','${liveId(1271)}','${liveId(1272)}','${now}');
      set local role youone_request; ${requestContext(manager)}
      select public.mark_acceptance_payment_eligible('${partialDecision}',4,'PORTION-NOT-RELEASED',
        '${liveId(1273)}','${liveId(1274)}','${liveId(1275)}','${now}'); commit;`, false);
    expect(run(`select state||':'||version_no from public.acceptance_payment_decision where id='${partialDecision}';`)).toBe("APPROVED:3");
    run(`begin; set local role youone_privileged_writer; ${systemContext("QUALITY_PAYMENT_ENGINE")}
      select public.hold_acceptance_payment_for_conditions('${partialDecision}',3,100,100,array['${usablePortionId}'::uuid],
        'PARTIAL-PORTION-RELEASED','${liveId(1276)}','${liveId(1277)}','${liveId(1278)}','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext(manager)}
      select public.mark_acceptance_payment_eligible('${partialDecision}',4,'PORTION-RELEASE-VERIFIED',
        '${liveId(1279)}','${liveId(1280)}','${liveId(1281)}','${now}'); commit;`);
    expect(run(`select d.state||':'||u.release_eligible||':'||d.held_amount||':'||d.unpaid_remainder
      from public.acceptance_payment_decision d join public.acceptance_payment_usable_portion u on u.acceptance_payment_decision_id=d.id
      where d.id='${partialDecision}';`)).toBe("ELIGIBLE_FOR_EXTERNAL_PAYMENT:t:0.00:0.00");
  });

  it("serializes direct-next Requirement revisions to one winner", async () => {
    const insert = (id: string) => `begin;
      insert into public.requirement_revision(id,requirement_id,revision_no,previous_revision_id,criticality,target_value,acceptance_rule,change_reason,created_by_user_id,created_at)
        values('${id}','${requirement}',2,'${revision1}','NORMAL','11','exact','concurrent','${manager}','${now}');
      select pg_sleep(0.2); commit;`;
    const results = await Promise.all([
      runAsync(insert("80000000-0000-4000-8000-000000000040")),
      runAsync(insert("80000000-0000-4000-8000-000000000041")),
    ]);
    expect(results.filter((status) => status === 0)).toHaveLength(1);
  });
});

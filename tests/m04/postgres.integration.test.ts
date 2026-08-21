import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.M04_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrations = [
  "20260821000100_m02_database_audit_kernel.sql",
  "20260821000200_m03_auth_rbac_scope.sql",
  "20260822000300_m04_approval_engine.sql",
].map((name) => readFileSync(resolve(import.meta.dirname, `../../supabase/migrations/${name}`), "utf8")).join("\n");
const dbDescribe = url === undefined ? describe.skip : describe;
const now = "2026-08-22T03:00:00Z";
const shaA = "a".repeat(64);
const shaB = "b".repeat(64);
const shaC = "c".repeat(64);
const shaD = "d".repeat(64);
const shaE = "e".repeat(64);
const submitter = "41000000-0000-4000-8000-000000000001";
const director = "41000000-0000-4000-8000-000000000002";
const delegate = "41000000-0000-4000-8000-000000000003";
const vendor = "41000000-0000-4000-8000-000000000004";
const governingVersion = "42000000-0000-4000-8000-000000000002";
const subject1 = "43000000-0000-4000-8000-000000000002";
const subject2 = "43000000-0000-4000-8000-000000000012";
const subject3 = "43000000-0000-4000-8000-000000000022";
const referencePolicyVersion = "42000000-0000-4000-8000-000000000012";
const subject4 = "43000000-0000-4000-8000-000000000032";
const activeAuthority = "47000000-0000-4000-8000-000000000001";
const expiredAuthority = "47000000-0000-4000-8000-000000000002";

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("M04_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url], { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}

function runAsync(sql: string): Promise<number | null> {
  if (url === undefined) throw new Error("M04_TEST_DATABASE_URL required");
  return new Promise((resolvePromise) => {
    const child = spawn(psql, ["-X", "--no-psqlrc", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url]);
    child.stdin.end(sql);
    child.on("close", resolvePromise);
  });
}

function userContext(actor: string, effective = actor, authority = "", correlation = "request:m04-db"): string {
  return `
    select set_config('app.actor_kind','USER',true);
    select set_config('app.actor_user_id','${actor}',true);
    select set_config('app.effective_actor_user_id','${effective}',true);
    select set_config('app.anonymous_subject_fingerprint','',true);
    select set_config('app.system_actor_id','',true);
    select set_config('app.correlation_id','${correlation}',true);
    select set_config('app.causation_id','',true);
    select set_config('app.request_time','${now}',true);
    select set_config('app.acting_authority_id','${authority}',true);`;
}

function workerContext(correlation = "worker:m04-db"): string {
  return `
    select set_config('app.actor_kind','SYSTEM',true);
    select set_config('app.actor_user_id','',true);
    select set_config('app.effective_actor_user_id','',true);
    select set_config('app.anonymous_subject_fingerprint','',true);
    select set_config('app.system_actor_id','APPROVAL_ENGINE',true);
    select set_config('app.correlation_id','${correlation}',true);
    select set_config('app.causation_id','',true);
    select set_config('app.request_time','${now}',true);
    select set_config('app.acting_authority_id','',true);`;
}

function createSubmitActivate(instance: string, subject: string, prefix: string): void {
  run(`begin; set local role youone_request; ${userContext(submitter, submitter, "", `request:${prefix}`)}
    select public.create_approval_instance('${instance}','${governingVersion}','${shaA}','${subject}',1,'${subject === subject1 ? shaB : shaC}',null,1,
      '${prefix}0000-0000-4000-8000-000000000001','${prefix}0000-0000-4000-8000-000000000002','${prefix}0000-0000-4000-8000-000000000003','${now}');
    select public.submit_approval_instance('${instance}',1,'${prefix}0000-0000-4000-8000-000000000004','${prefix}0000-0000-4000-8000-000000000005',
      '${prefix}0000-0000-4000-8000-000000000006','${prefix}0000-0000-4000-8000-000000000007','${now}'); commit;`);
  run(`begin; set local role youone_privileged_writer; ${workerContext(`worker:${prefix}`)}
    select public.activate_approval_instance('${instance}',2,'${prefix}0000-0000-4000-8000-000000000008','${prefix}0000-0000-4000-8000-000000000009',
      '${prefix}0000-0000-4000-8000-000000000010','${prefix}0000-0000-4000-8000-000000000011','${now}'); commit;`);
}

dbDescribe.sequential("M04 PostgreSQL approval engine", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M04 test DB required");
    run(migrations);
    run(`
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values
        ('${submitter}','m04-submitter','INTERNAL','ACTIVE','2026-01-01'),
        ('${director}','m04-director','INTERNAL','ACTIVE','2026-01-01'),
        ('${delegate}','m04-delegate','INTERNAL','ACTIVE','2026-01-01'),
        ('${vendor}','m04-vendor','VENDOR','ACTIVE','2026-01-01');
      insert into public.user_position_assignment(id,user_id,position_id,valid_from,is_primary,grant_reason_code)
        values('44000000-0000-4000-8000-000000000001','${director}','10000000-0000-4000-8000-000000000003','2026-01-01',true,'M04_FIXTURE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code) values
        ('44000000-0000-4000-8000-000000000002','${submitter}','20000000-0000-4000-8000-000000000012','2026-01-01','M04_FIXTURE'),
        ('44000000-0000-4000-8000-000000000003','${director}','20000000-0000-4000-8000-000000000003','2026-01-01','M04_FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code) values
        ('45000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000012','34000000-0000-4000-8000-000000000001','2026-01-01','M04_FIXTURE'),
        ('45000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000012','34000000-0000-4000-8000-000000000006','2026-01-01','M04_FIXTURE'),
        ('45000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000012','34000000-0000-4000-8000-000000000007','2026-01-01','M04_FIXTURE'),
        ('45000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000003','34000000-0000-4000-8000-000000000004','2026-01-01','M04_FIXTURE'),
        ('45000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000012','34000000-0000-4000-8000-000000000009','2026-01-01','M04_FIXTURE');
      insert into public.authorization_action_set(id,stable_code) values('46000000-0000-4000-8000-000000000001','M04_OFFICIAL_ACTING');
      insert into public.authorization_action_set_version(action_set_id,version_no,valid_from,valid_until) values('46000000-0000-4000-8000-000000000001',1,'2026-01-01','2027-01-01');
      insert into public.authorization_action_set_permission values('46000000-0000-4000-8000-000000000001',1,'34000000-0000-4000-8000-000000000004');
      insert into public.acting_authority_assignment(id,authenticated_user_id,effective_actor_user_id,role_id,action_set_id,action_set_version,valid_from,valid_until,evidence_id,granted_by_user_id,grant_reason_code) values
        ('${activeAuthority}','${delegate}','${director}','20000000-0000-4000-8000-000000000003','46000000-0000-4000-8000-000000000001',1,'2026-01-01','2027-01-01','47000000-0000-4000-8000-000000000011','${submitter}','M04_ACTING'),
        ('${expiredAuthority}','${delegate}','${director}','20000000-0000-4000-8000-000000000003','46000000-0000-4000-8000-000000000001',1,'2026-01-01','2026-08-01','47000000-0000-4000-8000-000000000012','${submitter}','M04_EXPIRED');

      insert into public.approval_policy(id,stable_code,status) values
        ('42000000-0000-4000-8000-000000000001','M04_GOVERNING','ACTIVE'),
        ('42000000-0000-4000-8000-000000000011','M04_REFERENCE_GOVERNING','ACTIVE'),
        ('43000000-0000-4000-8000-000000000001','M04_SUBJECT_ONE','ACTIVE'),
        ('43000000-0000-4000-8000-000000000011','M04_SUBJECT_TWO','ACTIVE'),
        ('43000000-0000-4000-8000-000000000021','M04_SUBJECT_THREE','ACTIVE'),
        ('43000000-0000-4000-8000-000000000031','M04_SUBJECT_FOUR','ACTIVE');
      insert into public.approval_policy_version(id,policy_id,version_no,state,subject_kind,checksum,valid_from,created_by_user_id) values
        ('${governingVersion}','42000000-0000-4000-8000-000000000001',1,'DRAFT','M04_TEST_SUBJECT','${shaA}','2026-01-01','${submitter}'),
        ('${subject1}','43000000-0000-4000-8000-000000000001',1,'DRAFT','M04_TEST_SUBJECT','${shaB}','2026-01-01','${submitter}'),
        ('${subject2}','43000000-0000-4000-8000-000000000011',1,'DRAFT','M04_TEST_SUBJECT','${shaC}','2026-01-01','${submitter}'),
        ('${subject3}','43000000-0000-4000-8000-000000000021',1,'DRAFT','M04_TEST_SUBJECT','${shaC}','2026-01-01','${submitter}'),
        ('${referencePolicyVersion}','42000000-0000-4000-8000-000000000011',1,'DRAFT','M04_TEST_SUBJECT','${shaD}','2026-01-01','${submitter}'),
        ('42000000-0000-4000-8000-000000000017','42000000-0000-4000-8000-000000000011',2,'DRAFT','M04_TEST_SUBJECT','${"f".repeat(64)}','2026-01-01','${submitter}'),
        ('${subject4}','43000000-0000-4000-8000-000000000031',1,'DRAFT','M04_TEST_SUBJECT','${shaE}','2026-01-01','${submitter}');
      insert into public.approval_policy_step_rule(id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required)
        values('42000000-0000-4000-8000-000000000003','${governingVersion}','LAB_DIRECTOR_APPROVAL',1,'APPROVAL','ANY_ONE',true);
      insert into public.approval_policy_participant_rule(id,step_rule_id,selector_kind,position_id)
        values('42000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000003','POSITION','10000000-0000-4000-8000-000000000003');
      insert into public.approval_policy_step_rule(id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required) values
        ('42000000-0000-4000-8000-000000000013','${referencePolicyVersion}','REFERENCE_RECEIPT',1,'REFERENCE','ANY_ONE',true),
        ('42000000-0000-4000-8000-000000000014','${referencePolicyVersion}','FINAL_APPROVAL',2,'APPROVAL','ANY_ONE',true),
        ('42000000-0000-4000-8000-000000000018','42000000-0000-4000-8000-000000000017','DRAFT_TARGET',1,'APPROVAL','ANY_ONE',true);
      insert into public.approval_policy_participant_rule(id,step_rule_id,selector_kind,participant_user_id,position_id,participant_order) values
        ('42000000-0000-4000-8000-000000000015','42000000-0000-4000-8000-000000000013','USER','${submitter}',null,1),
        ('42000000-0000-4000-8000-000000000016','42000000-0000-4000-8000-000000000014','POSITION',null,'10000000-0000-4000-8000-000000000003',1);
      update public.approval_policy_version set state='PUBLISHED' where id in('${governingVersion}','${referencePolicyVersion}');
      update public.approval_policy_version set state='SEALED' where id in('${subject1}','${subject2}','${subject3}','${subject4}');
    `);
  }, 30_000);

  it("applies clean, denies raw writes/vendors and seals submission snapshots", () => {
    createSubmitActivate("51000000-0000-4000-8000-000000000001", subject1, "5101");
    expect(run("select state||':'||version_no||':'||(line_checksum is not null) from public.approval_instance where id='51000000-0000-4000-8000-000000000001';")).toBe("IN_PROGRESS:3:true");
    expect(run("select count(*) from public.approval_participant p join public.approval_step s on s.id=p.step_id where s.instance_id='51000000-0000-4000-8000-000000000001' and p.position_id_snapshot='10000000-0000-4000-8000-000000000003' and p.assignment_evidence_id is not null;")).toBe("1");
    expect(run(`begin; set local role youone_request; ${userContext(vendor)} select count(*) from public.approval_instance; rollback;`).split("\n").at(-1)).toBe("0");
    run(`begin; set local role youone_request; ${userContext(submitter)} update public.approval_instance set state='COMPLETED' where id='51000000-0000-4000-8000-000000000001'; rollback;`, false);
    run(`begin; set local role youone_request; ${userContext(submitter)} select public.activate_approval_instance('51000000-0000-4000-8000-000000000001',3,extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),'${now}'); rollback;`, false);
    run("update public.approval_policy_step_rule set policy_version_id='42000000-0000-4000-8000-000000000017' where id='42000000-0000-4000-8000-000000000003';", false);
    run("update public.approval_policy_participant_rule set step_rule_id='42000000-0000-4000-8000-000000000018' where id='42000000-0000-4000-8000-000000000004';", false);
  });

  it("rolls back state/action/subject/audit when outbox fails, then completes exact subject", () => {
    const step = run("select s.id from public.approval_step s where s.instance_id='51000000-0000-4000-8000-000000000001';");
    const participant = run(`select id from public.approval_participant where step_id='${step}';`);
    run(`begin; set local role youone_request; ${userContext(director)}
      select public.perform_approval_action('51000000-0000-4000-8000-000000000001','${step}','${participant}','APPROVE',3,1,1,
        '52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000003','51010000-0000-4000-8000-000000000011',null,null,'${now}'); commit;`, false);
    expect(run("select state||':'||version_no from public.approval_instance where id='51000000-0000-4000-8000-000000000001';")).toBe("IN_PROGRESS:3");
    expect(run(`select state||':'||version_no from public.approval_participant where id='${participant}';`)).toBe("ACTIVE:1");
    expect(run(`select state from public.approval_policy_version where id='${subject1}';`)).toBe("SEALED");
    expect(run("select count(*) from public.audit_log where id='52000000-0000-4000-8000-000000000002';")).toBe("0");

    run(`begin; set local role youone_request; ${userContext(director)}
      select public.perform_approval_action('51000000-0000-4000-8000-000000000001','${step}','${participant}','APPROVE',3,1,1,
        '52000000-0000-4000-8000-000000000011','52000000-0000-4000-8000-000000000012','52000000-0000-4000-8000-000000000013','52000000-0000-4000-8000-000000000014',null,null,'${now}'); commit;`);
    expect(run("select state||':'||version_no from public.approval_instance where id='51000000-0000-4000-8000-000000000001';")).toBe("COMPLETED:4");
    expect(run(`select state from public.approval_policy_version where id='${subject1}';`)).toBe("PUBLISHED");
    run("update public.approval_action set opinion='forged' where id='52000000-0000-4000-8000-000000000011';", false);
  });

  it("allows exactly one concurrent terminal participant action", async () => {
    const instance = "53000000-0000-4000-8000-000000000001";
    createSubmitActivate(instance, subject2, "5301");
    const step = run(`select id from public.approval_step where instance_id='${instance}';`);
    const participant = run(`select id from public.approval_participant where step_id='${step}';`);
    const command = (suffix: string) => `begin; set local role youone_request; ${userContext(director, director, "", `request:m04-race-${suffix}`)}
      select public.perform_approval_action('${instance}','${step}','${participant}','APPROVE',3,1,1,
        '531${suffix}0000-0000-4000-8000-000000000001','531${suffix}0000-0000-4000-8000-000000000002','531${suffix}0000-0000-4000-8000-000000000003','531${suffix}0000-0000-4000-8000-000000000004',null,null,'${now}'); commit;`;
    const statuses = await Promise.all([runAsync(command("1")), runAsync(command("2"))]);
    expect(statuses.filter((status) => status === 0)).toHaveLength(1);
    expect(run(`select count(*) from public.approval_action where instance_id='${instance}' and event_id='APPROVE';`)).toBe("1");
    expect(run(`select state||':'||version_no from public.approval_instance where id='${instance}';`)).toBe("COMPLETED:4");
  }, 30_000);

  it("rejects expired acting authority and records active authority evidence", () => {
    const instance = "54000000-0000-4000-8000-000000000001";
    createSubmitActivate(instance, subject3, "5401");
    const step = run(`select id from public.approval_step where instance_id='${instance}';`);
    const participant = run(`select id from public.approval_participant where step_id='${step}';`);
    run(`begin; set local role youone_request; ${userContext(submitter)}
      select public.perform_approval_action('${instance}','${step}','${participant}','APPROVE',3,1,1,extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),null,null,'${now}'); rollback;`, false);
    run(`begin; set local role youone_request; ${userContext(vendor)}
      select public.perform_approval_action('${instance}','${step}','${participant}','APPROVE',3,1,1,extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),null,null,'${now}'); rollback;`, false);
    run("update public.user_position_assignment set valid_until='2026-08-01' where id='44000000-0000-4000-8000-000000000001';");
    run(`begin; set local role youone_request; ${userContext(director)}
      select public.perform_approval_action('${instance}','${step}','${participant}','APPROVE',3,1,1,extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),null,null,'${now}'); rollback;`, false);
    run("update public.user_position_assignment set valid_until=null where id='44000000-0000-4000-8000-000000000001';");
    run(`begin; set local role youone_request; ${userContext(delegate, director, expiredAuthority)}
      select public.perform_approval_action('${instance}','${step}','${participant}','APPROVE',3,1,1,extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),null,null,'${now}'); rollback;`, false);
    run(`begin; set local role youone_request; ${userContext(delegate, director, activeAuthority)}
      select public.perform_approval_action('${instance}','${step}','${participant}','APPROVE',3,1,1,
        '54100000-0000-4000-8000-000000000001','54100000-0000-4000-8000-000000000002','54100000-0000-4000-8000-000000000003','54100000-0000-4000-8000-000000000004',null,null,'${now}'); commit;`);
    expect(run(`select acting_authority_id||':'||acting_authority_evidence_id from public.approval_action where id='54100000-0000-4000-8000-000000000001';`)).toBe(`${activeAuthority}:47000000-0000-4000-8000-000000000011`);
  });

  it("records a REFERENCE receipt before activating the final official approval", () => {
    const instance = "55000000-0000-4000-8000-000000000001";
    run(`begin; set local role youone_request; ${userContext(submitter, submitter, "", "request:m04-reference")}
      select public.create_approval_instance('${instance}','${referencePolicyVersion}','${shaD}','${subject4}',1,'${shaE}',null,1,
        '55010000-0000-4000-8000-000000000001','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000003','${now}');
      select public.submit_approval_instance('${instance}',1,'55010000-0000-4000-8000-000000000004','55010000-0000-4000-8000-000000000005','55010000-0000-4000-8000-000000000006','55010000-0000-4000-8000-000000000007','${now}'); commit;`);
    run(`begin; set local role youone_privileged_writer; ${workerContext("worker:m04-reference")}
      select public.activate_approval_instance('${instance}',2,'55010000-0000-4000-8000-000000000008','55010000-0000-4000-8000-000000000009','55010000-0000-4000-8000-000000000010','55010000-0000-4000-8000-000000000011','${now}'); commit;`);
    const referenceStep = run(`select id from public.approval_step where instance_id='${instance}' and step_role='REFERENCE';`);
    const referenceParticipant = run(`select id from public.approval_participant where step_id='${referenceStep}';`);
    run(`begin; set local role youone_request; ${userContext(submitter, submitter, "", "request:m04-reference-action")}
      select public.perform_approval_action('${instance}','${referenceStep}','${referenceParticipant}','REFERENCE_RECEIPT',3,1,1,
        '55020000-0000-4000-8000-000000000001','55020000-0000-4000-8000-000000000002','55020000-0000-4000-8000-000000000003','55020000-0000-4000-8000-000000000004',null,null,'${now}'); commit;`);
    expect(run(`select state||':'||version_no from public.approval_instance where id='${instance}';`)).toBe("IN_PROGRESS:4");
    expect(run(`select count(*) from public.approval_action where instance_id='${instance}' and event_id='REFERENCE_RECEIPT';`)).toBe("1");
    expect(run(`select count(*) from public.approval_step where instance_id='${instance}' and step_role='APPROVAL' and state='ACTIVE';`)).toBe("1");
  });

  it("executes every completion mode and holds the same-sequence parallel barrier", () => {
    const instance = "56300000-0000-4000-8000-000000000001";
    const policyVersion = "56000000-0000-4000-8000-000000000002";
    const modeSubject = "56000000-0000-4000-8000-000000000004";
    const policyHash = "7".repeat(64);
    const subjectHash = "8".repeat(64);

    run(`
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code) values
        ('56000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000012','34000000-0000-4000-8000-000000000002','2026-01-01','M04_MODE_TEST'),
        ('56000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000003','34000000-0000-4000-8000-000000000002','2026-01-01','M04_MODE_TEST');
      insert into public.approval_policy(id,stable_code,status) values
        ('56000000-0000-4000-8000-000000000001','M04_MODE_POLICY','ACTIVE'),
        ('56000000-0000-4000-8000-000000000003','M04_MODE_SUBJECT','ACTIVE');
      insert into public.approval_policy_version(id,policy_id,version_no,state,subject_kind,checksum,valid_from,created_by_user_id) values
        ('${policyVersion}','56000000-0000-4000-8000-000000000001',1,'DRAFT','M04_MODE_SUBJECT','${policyHash}','2026-01-01','${submitter}'),
        ('${modeSubject}','56000000-0000-4000-8000-000000000003',1,'DRAFT','M04_MODE_SUBJECT','${subjectHash}','2026-01-01','${submitter}');
      insert into public.approval_policy_step_rule(id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required) values
        ('56100000-0000-4000-8000-000000000001','${policyVersion}','MODE_SEQUENTIAL',1,'REVIEW','SEQUENTIAL',true),
        ('56100000-0000-4000-8000-000000000002','${policyVersion}','MODE_ALL',2,'REVIEW','ALL',true),
        ('56100000-0000-4000-8000-000000000003','${policyVersion}','MODE_ANY_ONE',3,'REVIEW','ANY_ONE',true),
        ('56100000-0000-4000-8000-000000000004','${policyVersion}','MODE_SPECIFIC',4,'REVIEW','SPECIFIC',true),
        ('56100000-0000-4000-8000-000000000005','${policyVersion}','PARALLEL_A',5,'REVIEW','ANY_ONE',true),
        ('56100000-0000-4000-8000-000000000006','${policyVersion}','PARALLEL_B',5,'REVIEW','ANY_ONE',true),
        ('56100000-0000-4000-8000-000000000007','${policyVersion}','MODE_FINAL_APPROVAL',6,'APPROVAL','ANY_ONE',true);
      insert into public.approval_policy_participant_rule(id,step_rule_id,selector_kind,participant_user_id,position_id,participant_order,required_for_completion) values
        ('56200000-0000-4000-8000-000000000001','56100000-0000-4000-8000-000000000001','USER','${submitter}',null,1,true),
        ('56200000-0000-4000-8000-000000000002','56100000-0000-4000-8000-000000000001','USER','${director}',null,2,true),
        ('56200000-0000-4000-8000-000000000003','56100000-0000-4000-8000-000000000002','USER','${submitter}',null,1,true),
        ('56200000-0000-4000-8000-000000000004','56100000-0000-4000-8000-000000000002','USER','${director}',null,2,true),
        ('56200000-0000-4000-8000-000000000005','56100000-0000-4000-8000-000000000003','USER','${submitter}',null,1,true),
        ('56200000-0000-4000-8000-000000000006','56100000-0000-4000-8000-000000000003','USER','${director}',null,2,true),
        ('56200000-0000-4000-8000-000000000007','56100000-0000-4000-8000-000000000004','USER','${submitter}',null,1,true),
        ('56200000-0000-4000-8000-000000000008','56100000-0000-4000-8000-000000000004','USER','${director}',null,2,false),
        ('56200000-0000-4000-8000-000000000009','56100000-0000-4000-8000-000000000005','USER','${submitter}',null,1,true),
        ('56200000-0000-4000-8000-000000000010','56100000-0000-4000-8000-000000000006','USER','${director}',null,1,true),
        ('56200000-0000-4000-8000-000000000011','56100000-0000-4000-8000-000000000007','POSITION',null,'10000000-0000-4000-8000-000000000003',1,true);
      update public.approval_policy_version set state='PUBLISHED' where id='${policyVersion}';
      update public.approval_policy_version set state='SEALED' where id='${modeSubject}';
    `);
    run(`begin; set local role youone_request; ${userContext(submitter, submitter, "", "request:m04-modes")}
      select public.create_approval_instance('${instance}','${policyVersion}','${policyHash}','${modeSubject}',1,'${subjectHash}',null,1,
        '56310000-0000-4000-8000-000000000001','56310000-0000-4000-8000-000000000002','56310000-0000-4000-8000-000000000003','${now}');
      select public.submit_approval_instance('${instance}',1,'56320000-0000-4000-8000-000000000001','56320000-0000-4000-8000-000000000002','56320000-0000-4000-8000-000000000003','56320000-0000-4000-8000-000000000004','${now}'); commit;`);
    run(`begin; set local role youone_privileged_writer; ${workerContext("worker:m04-modes")}
      select public.activate_approval_instance('${instance}',2,'56330000-0000-4000-8000-000000000001','56330000-0000-4000-8000-000000000002','56330000-0000-4000-8000-000000000003','56330000-0000-4000-8000-000000000004','${now}'); commit;`);

    const perform = (stepKey: string, participantUser: string, expectedInstanceVersion: number, ordinal: number, event = "REVIEW") => {
      const stepId = run(`select id from public.approval_step where instance_id='${instance}' and step_key='${stepKey}';`);
      const participantId = run(`select id from public.approval_participant where step_id='${stepId}' and participant_user_id='${participantUser}';`);
      const recordPrefix = `56${ordinal.toString().padStart(6, "0")}`;
      run(`begin; set local role youone_request; ${userContext(participantUser, participantUser, "", `request:m04-mode-${ordinal}`)}
        select public.perform_approval_action('${instance}','${stepId}','${participantId}','${event}',${expectedInstanceVersion},1,1,
          '${recordPrefix}-0000-4000-8000-000000000001','${recordPrefix}-0000-4000-8000-000000000002','${recordPrefix}-0000-4000-8000-000000000003','${recordPrefix}-0000-4000-8000-000000000004',null,null,'${now}'); commit;`);
    };

    expect(run(`select string_agg(participant_order||':'||state,',' order by participant_order) from public.approval_participant where step_id=(select id from public.approval_step where instance_id='${instance}' and step_key='MODE_SEQUENTIAL');`)).toBe("1:ACTIVE,2:WAITING");
    perform("MODE_SEQUENTIAL", submitter, 3, 1);
    expect(run(`select state from public.approval_step where instance_id='${instance}' and step_key='MODE_SEQUENTIAL';`)).toBe("ACTIVE");
    expect(run(`select state from public.approval_participant where step_id=(select id from public.approval_step where instance_id='${instance}' and step_key='MODE_SEQUENTIAL') and participant_order=2;`)).toBe("ACTIVE");
    perform("MODE_SEQUENTIAL", director, 4, 2);
    expect(run(`select state from public.approval_step where instance_id='${instance}' and step_key='MODE_SEQUENTIAL';`)).toBe("REVIEWED");

    perform("MODE_ALL", submitter, 5, 3);
    expect(run(`select state from public.approval_step where instance_id='${instance}' and step_key='MODE_ALL';`)).toBe("ACTIVE");
    perform("MODE_ALL", director, 6, 4);
    expect(run(`select state from public.approval_step where instance_id='${instance}' and step_key='MODE_ALL';`)).toBe("REVIEWED");

    perform("MODE_ANY_ONE", submitter, 7, 5);
    expect(run(`select string_agg(state,',' order by participant_order) from public.approval_participant where step_id=(select id from public.approval_step where instance_id='${instance}' and step_key='MODE_ANY_ONE');`)).toBe("ACTED,CANCELLED");

    perform("MODE_SPECIFIC", director, 8, 6);
    expect(run(`select state from public.approval_step where instance_id='${instance}' and step_key='MODE_SPECIFIC';`)).toBe("ACTIVE");
    perform("MODE_SPECIFIC", submitter, 9, 7);
    expect(run(`select state from public.approval_step where instance_id='${instance}' and step_key='MODE_SPECIFIC';`)).toBe("REVIEWED");

    perform("PARALLEL_A", submitter, 10, 8);
    expect(run(`select state from public.approval_step where instance_id='${instance}' and step_key='MODE_FINAL_APPROVAL';`)).toBe("WAITING");
    expect(run(`select state from public.approval_step where instance_id='${instance}' and step_key='PARALLEL_B';`)).toBe("ACTIVE");
    perform("PARALLEL_B", director, 11, 9);
    expect(run(`select state from public.approval_step where instance_id='${instance}' and step_key='MODE_FINAL_APPROVAL';`)).toBe("ACTIVE");

    perform("MODE_FINAL_APPROVAL", director, 12, 10, "APPROVE");
    expect(run(`select state||':'||version_no from public.approval_instance where id='${instance}';`)).toBe("COMPLETED:13");
    expect(run(`select state from public.approval_policy_version where id='${modeSubject}';`)).toBe("PUBLISHED");
  }, 30_000);
});

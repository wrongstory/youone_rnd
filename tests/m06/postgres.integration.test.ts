import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.M06_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrations = [
  "20260821000100_m02_database_audit_kernel.sql",
  "20260821000200_m03_auth_rbac_scope.sql",
  "20260822000300_m04_approval_engine.sql",
  "20260822000400_m05_document_file.sql",
  "20260822000500_m06_project_wbs.sql",
].map((name) => readFileSync(resolve(import.meta.dirname, `../../supabase/migrations/${name}`), "utf8")).join("\n");
const dbDescribe = url === undefined ? describe.skip : describe;
const now = "2026-08-22T09:00:00Z";
const organization = "60000000-0000-4000-8000-000000000001";
const owner = "60000000-0000-4000-8000-000000000002";
const internal = "60000000-0000-4000-8000-000000000003";
const vendor = "60000000-0000-4000-8000-000000000004";
const otherVendor = "60000000-0000-4000-8000-000000000005";
const director = "60000000-0000-4000-8000-000000000006";
const senior = "60000000-0000-4000-8000-000000000007";
const representative = "60000000-0000-4000-8000-000000000008";
const vendorCompany = "60000000-0000-4000-8000-000000000009";
const otherVendorCompany = "60000000-0000-4000-8000-000000000010";
const vendorUser = "60000000-0000-4000-8000-000000000011";
const otherVendorUser = "60000000-0000-4000-8000-000000000012";
const project = "61000000-0000-4000-8000-000000000001";
const otherProject = "61000000-0000-4000-8000-000000000002";
const wbs = "61000000-0000-4000-8000-000000000003";
const application = "62000000-0000-4000-8000-000000000001";
const applicationVersion = "62000000-0000-4000-8000-000000000002";
const approvalInstance = "62000000-0000-4000-8000-000000000003";

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("M06_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url], { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}

function runAsync(sql: string): Promise<number | null> {
  if (url === undefined) throw new Error("M06_TEST_DATABASE_URL required");
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
    select set_config('app.correlation_id','request:m06-db',true);
    select set_config('app.causation_id','',true);
    select set_config('app.request_time','${now}',true);
    select set_config('app.acting_authority_id','',true);`;
}

dbDescribe.sequential("M06 PostgreSQL Project/WBS boundary", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M06 test DB required");
    run(migrations);
    run(`
      insert into public.organization(id,stable_code,legal_name,status) values('${organization}','M06-ORG','M06 Org','ACTIVE');
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values
        ('${owner}','m06-owner','INTERNAL','ACTIVE','2026-01-01'),('${internal}','m06-internal','INTERNAL','ACTIVE','2026-01-01'),
        ('${vendor}','m06-vendor','VENDOR','ACTIVE','2026-01-01'),('${otherVendor}','m06-other-vendor','VENDOR','ACTIVE','2026-01-01'),
        ('${director}','m06-director','INTERNAL','ACTIVE','2026-01-01'),('${senior}','m06-senior','INTERNAL','ACTIVE','2026-01-01'),
        ('${representative}','m06-representative','INTERNAL','ACTIVE','2026-01-01');
      insert into public.user_organization_assignment(id,user_id,organization_id,valid_from,grant_reason_code) values
        ('60000000-0000-4000-8000-000000000020','${owner}','${organization}','2026-01-01','M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000021','${internal}','${organization}','2026-01-01','M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000022','${director}','${organization}','2026-01-01','M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000023','${senior}','${organization}','2026-01-01','M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000024','${representative}','${organization}','2026-01-01','M06-FIXTURE');
      insert into public.user_position_assignment(id,user_id,position_id,valid_from,is_primary,grant_reason_code) values
        ('60000000-0000-4000-8000-000000000030','${director}','10000000-0000-4000-8000-000000000003','2026-01-01',true,'M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000031','${senior}','10000000-0000-4000-8000-000000000002','2026-01-01',true,'M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000032','${representative}','10000000-0000-4000-8000-000000000004','2026-01-01',true,'M06-FIXTURE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code) values
        ('60000000-0000-4000-8000-000000000040','${owner}','20000000-0000-4000-8000-000000000001','2026-01-01','M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000041','${internal}','20000000-0000-4000-8000-000000000001','2026-01-01','M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000042','${vendor}','20000000-0000-4000-8000-000000000005','2026-01-01','M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000043','${otherVendor}','20000000-0000-4000-8000-000000000005','2026-01-01','M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000044','${director}','20000000-0000-4000-8000-000000000003','2026-01-01','M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000045','${senior}','20000000-0000-4000-8000-000000000002','2026-01-01','M06-FIXTURE'),
        ('60000000-0000-4000-8000-000000000046','${representative}','20000000-0000-4000-8000-000000000004','2026-01-01','M06-FIXTURE');
      insert into public.vendor(id,vendor_code,legal_name,status) values
        ('${vendorCompany}','M06-VENDOR-A','Vendor A','ACTIVE'),('${otherVendorCompany}','M06-VENDOR-B','Vendor B','ACTIVE');
      insert into public.vendor_user(id,vendor_id,user_id,status,valid_from,grant_reason_code) values
        ('${vendorUser}','${vendorCompany}','${vendor}','ACTIVE','2026-01-01','M06-FIXTURE'),
        ('${otherVendorUser}','${otherVendorCompany}','${otherVendor}','ACTIVE','2026-01-01','M06-FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
      select ('60100000-0000-4000-8000-'||lpad(row_number() over(order by id)::text,12,'0'))::uuid,
        '20000000-0000-4000-8000-000000000001',id,'2026-01-01','M06-FIXTURE' from public.permission
        where stable_code in('approval.instance.submit','approval.instance.recall','project.record.create','project.record.update',
          'project.summary.read','project.wbs.update','project.wbs.read','project.research_designation.submit','project.vendor_scope.manage');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code) values
        ('60100000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000003','34000000-0000-4000-8000-000000000004','2026-01-01','M06-FIXTURE'),
        ('60100000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000003','34000000-0000-4000-8000-000000000005','2026-01-01','M06-FIXTURE');
    `);
  }, 30_000);

  it("applies M02 through M06 cleanly with exact typed constraints and FORCE RLS", () => {
    expect(run("select count(*) from information_schema.tables where table_schema='public' and table_name in ('project','project_member','project_product','project_vendor_grant','wbs_node','research_project_application','research_project_application_version','research_project_designation','approval_subject_research_project_application');")).toBe("9");
    expect(run("select count(*) from pg_class where relnamespace='public'::regnamespace and relname in ('project','project_member','project_product','project_vendor_grant','wbs_node','research_project_application','research_project_application_version','research_project_designation','approval_subject_research_project_application') and relrowsecurity and relforcerowsecurity;")).toBe("9");
  });

  it("allows every active INTERNAL actor to create an ordinary Project and denies Vendor/direct writes", () => {
    run(`begin; set local role youone_request; ${requestContext()}
      select public.create_project('${project}','M06-PROJECT-A','Project A','${organization}','Objective','2026-08-22','2027-08-21','MEMBERS_ONLY',
        '61000000-0000-4000-8000-000000000010','61000000-0000-4000-8000-000000000011','61000000-0000-4000-8000-000000000012','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext(internal)}
      select public.create_project('${otherProject}','M06-PROJECT-B','Project B','${organization}','Other objective','2026-08-22','2027-08-21','MEMBERS_ONLY',
        '61000000-0000-4000-8000-000000000013','61000000-0000-4000-8000-000000000014','61000000-0000-4000-8000-000000000015','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext(vendor)} select public.create_project('61000000-0000-4000-8000-000000000099','FORGED','Forged','${organization}','x','2026-08-22','2026-08-23','MEMBERS_ONLY',extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),'${now}'); rollback;`, false);
    run(`begin; set local role youone_request; ${requestContext()} update public.project set state='ACTIVE' where id='${project}'; rollback;`, false);
    expect(run(`begin; set local role youone_request; ${requestContext(vendor)} select count(*) from public.project; rollback;`).split("\n").at(-1)).toBe("0");
  });

  it("enforces exact VendorMembership plus exact Project grants and immediate revoke", () => {
    for (const [grantId, action] of [["61100000-0000-4000-8000-000000000001", "project.summary.read"], ["61100000-0000-4000-8000-000000000002", "project.wbs.read"], ["61100000-0000-4000-8000-000000000003", "project.wbs.update"]] as const) {
      run(`begin; set local role youone_request; ${requestContext()} select public.grant_project_vendor_scope('${grantId}','${project}','${vendorUser}','${action}','${now}',null,'M06-GRANT',extensions.gen_random_uuid(),'${now}'); commit;`);
    }
    expect(run(`begin; set local role youone_request; ${requestContext(vendor)} select count(*) from public.read_project_vendor_summary('${project}','${now}'); rollback;`).split("\n").at(-1)).toBe("1");
    expect(run(`begin; set local role youone_request; ${requestContext(vendor)} select count(*) from public.read_project_vendor_summary('${otherProject}','${now}'); rollback;`).split("\n").at(-1)).toBe("0");
    expect(run(`begin; set local role youone_request; ${requestContext(otherVendor)} select count(*) from public.read_project_vendor_summary('${project}','${now}'); rollback;`).split("\n").at(-1)).toBe("0");
    run(`begin; set local role youone_request; ${requestContext()} select public.revoke_project_vendor_scope('61100000-0000-4000-8000-000000000001',1,'M06-REVOKE',extensions.gen_random_uuid(),'${now}'); commit;`);
    expect(run(`begin; set local role youone_request; ${requestContext(vendor)} select count(*) from public.read_project_vendor_summary('${project}','${now}'); rollback;`).split("\n").at(-1)).toBe("0");
  });

  it("serializes Project transitions and rolls back state/audit when outbox fails", () => {
    run(`begin; set local role youone_request; ${requestContext()}
      select public.transition_project('${project}','EVT-PROJECT-PLAN',1,null,'61200000-0000-4000-8000-000000000001','61200000-0000-4000-8000-000000000002','61200000-0000-4000-8000-000000000003','${now}');
      select public.transition_project('${project}','EVT-PROJECT-START',2,null,'61200000-0000-4000-8000-000000000004','61200000-0000-4000-8000-000000000005','61200000-0000-4000-8000-000000000006','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext()}
      select public.transition_project('${project}','EVT-PROJECT-HOLD',3,'RISK-HOLD','61200000-0000-4000-8000-000000000007','61200000-0000-4000-8000-000000000008','61200000-0000-4000-8000-000000000006','${now}'); commit;`, false);
    expect(run(`select state||':'||version_no from public.project where id='${project}';`)).toBe("ACTIVE:3");
    run(`begin; set local role youone_request; ${requestContext()} select public.transition_project('${project}','EVT-PROJECT-CLOSE',3,'CLOSE','61200000-0000-4000-8000-000000000009','61200000-0000-4000-8000-000000000010','61200000-0000-4000-8000-000000000011','${now}'); rollback;`, false);
  });

  it("enforces free hierarchy and Vendor-assigned WBS transition limits", () => {
    run(`begin; set local role youone_request; ${requestContext()}
      select public.create_wbs_node('${wbs}','${project}',null,'WBS-1','TASK','Vendor task','${owner}','${vendorUser}','2026-08-22','2026-09-01',0,
        '61300000-0000-4000-8000-000000000001','61300000-0000-4000-8000-000000000002','61300000-0000-4000-8000-000000000003','${now}');
      select public.transition_wbs_node('${wbs}','EVT-WBS-READY',1,0,null,'61300000-0000-4000-8000-000000000004','61300000-0000-4000-8000-000000000005','61300000-0000-4000-8000-000000000006','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext(vendor)} select public.transition_wbs_node('${wbs}','EVT-WBS-START',2,10,null,
      '61300000-0000-4000-8000-000000000007','61300000-0000-4000-8000-000000000008','61300000-0000-4000-8000-000000000009','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext(vendor)} select public.transition_wbs_node('${wbs}','EVT-WBS-ACCEPT',3,100,null,
      extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),'${now}'); rollback;`, false);
    run(`update public.wbs_node set parent_id='${wbs}' where id='${wbs}';`, false);
  });

  it("seals an exact immutable application and submits only the single Lab Director line", () => {
    const policyId = "62000000-0000-4000-8000-000000000010";
    const policyVersion = "62000000-0000-4000-8000-000000000011";
    const policyChecksum = "d".repeat(64);
    run(`
      insert into public.approval_policy(id,stable_code,status) values('${policyId}','M06-RP-DESIGNATION','ACTIVE');
      insert into public.approval_policy_version(id,policy_id,version_no,state,subject_kind,checksum,valid_from,created_by_user_id)
        values('${policyVersion}','${policyId}',1,'DRAFT','RESEARCH_PROJECT_APPLICATION','${policyChecksum}','2026-01-01','${owner}');
      insert into public.approval_policy_step_rule(id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required)
        values('62000000-0000-4000-8000-000000000012','${policyVersion}','LAB-DIRECTOR-CONSENT',1,'APPROVAL','SEQUENTIAL',true);
      insert into public.approval_policy_participant_rule(id,step_rule_id,selector_kind,position_id)
        values('62000000-0000-4000-8000-000000000013','62000000-0000-4000-8000-000000000012','POSITION','10000000-0000-4000-8000-000000000003');
      update public.approval_policy_version set state='PUBLISHED' where id='${policyVersion}';
    `);
    run(`begin; set local role youone_request; ${requestContext()}
      select public.create_research_project_application('${application}','${applicationVersion}','${project}','Purpose','Method','2026-08-22','2027-08-21',1000,'KRW','Report',true,'Security','Safety',
        '62000000-0000-4000-8000-000000000020','62000000-0000-4000-8000-000000000021','62000000-0000-4000-8000-000000000022','${now}');
      select public.add_research_project_application_member('${applicationVersion}','${owner}','RESEARCH_LEAD',100,'62000000-0000-4000-8000-000000000023','${now}');
      select public.add_research_project_application_output('${applicationVersion}','62000000-0000-4000-8000-000000000042','OUTPUT-REPORT','Final report',
        '62000000-0000-4000-8000-000000000043','${now}');
      select public.seal_research_project_application('${applicationVersion}',1,'62000000-0000-4000-8000-000000000024','62000000-0000-4000-8000-000000000025','${now}');
      select public.create_research_project_approval_instance('${approvalInstance}','${policyVersion}','${policyChecksum}','${applicationVersion}',null,1,
        '62000000-0000-4000-8000-000000000026','62000000-0000-4000-8000-000000000027','62000000-0000-4000-8000-000000000028','${now}');
      select public.submit_research_project_approval_instance('${approvalInstance}',1,'62000000-0000-4000-8000-000000000029','62000000-0000-4000-8000-000000000030',
        '62000000-0000-4000-8000-000000000031','62000000-0000-4000-8000-000000000032','62000000-0000-4000-8000-000000000033','62000000-0000-4000-8000-000000000034',
        '62000000-0000-4000-8000-000000000035','62000000-0000-4000-8000-000000000036','62000000-0000-4000-8000-000000000037','${now}'); commit;`);
    expect(run(`select state||':'||(sealed_snapshot_checksum is not null) from public.research_project_application_version where id='${applicationVersion}';`)).toBe("DIRECTOR_REVIEW_PENDING:true");
    run(`update public.research_project_application_version set purpose='forged' where id='${applicationVersion}';`, false);
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "APPROVAL_ENGINE")}
      select public.activate_approval_instance('${approvalInstance}',2,'62000000-0000-4000-8000-000000000038','62000000-0000-4000-8000-000000000039',
        '62000000-0000-4000-8000-000000000040','62000000-0000-4000-8000-000000000041','${now}'); commit;`);
  });

  it("denies Senior, Representative and Vendor and allows exactly one concurrent Lab Director consent", async () => {
    const step = run(`select id from public.approval_step where instance_id='${approvalInstance}';`);
    const participant = run(`select id from public.approval_participant where step_id='${step}';`);
    const call = (actor: string, suffix: string) => `begin; set local role youone_request; ${requestContext(actor)}
      select public.perform_research_project_approval_action('${approvalInstance}','${step}','${participant}','APPROVE',3,1,1,3,
        '62100000-0000-4000-8000-0000000000${suffix}1','62100000-0000-4000-8000-0000000000${suffix}2','62100000-0000-4000-8000-0000000000${suffix}3',
        '62100000-0000-4000-8000-0000000000${suffix}4','62100000-0000-4000-8000-0000000000${suffix}5','62100000-0000-4000-8000-0000000000${suffix}6',
        '62100000-0000-4000-8000-0000000000${suffix}7','62100000-0000-4000-8000-0000000000${suffix}8','62100000-0000-4000-8000-0000000000${suffix}9',null,null,'${now}'); commit;`;
    run(call(senior, "1"), false); run(call(representative, "2"), false); run(call(vendor, "3"), false);
    const [first, second] = await Promise.all([runAsync(call(director, "4")), runAsync(call(director, "5"))]);
    expect([first, second].sort()).toEqual([0, 3]);
    expect(run(`select i.state||':'||v.state||':'||(select count(*) from public.research_project_designation d where d.approval_instance_id=i.id)
      from public.approval_instance i join public.approval_subject_research_project_application s on s.instance_id=i.id
      join public.research_project_application_version v on v.id=s.application_version_id where i.id='${approvalInstance}';`)).toBe("COMPLETED:APPROVED:1");
    expect(run(`begin; set local role youone_request; ${requestContext()} select status from public.read_formal_research_status('${project}','${now}'); rollback;`).split("\n").at(-1)).toBe("FORMAL_RESEARCH_PROJECT");
    run(`update public.research_project_designation set application_checksum='${"e".repeat(64)}' where approval_instance_id='${approvalInstance}';`, false);
  }, 30_000);

  it("atomically recalls a typed application, then preserves fixed RETURN provenance on its newer revision", () => {
    const policyVersion = "62000000-0000-4000-8000-000000000011";
    const policyChecksum = "d".repeat(64);
    const root = "63000000-0000-4000-8000-000000000001";
    const firstVersion = "63000000-0000-4000-8000-000000000002";
    const firstInstance = "63000000-0000-4000-8000-000000000003";
    run(`begin; set local role youone_request; ${requestContext(internal)}
      select public.create_research_project_application('${root}','${firstVersion}','${otherProject}','Purpose','Method','2026-08-22','2027-08-21',1000,'KRW','Report',false,'Security','Safety',
        '63000000-0000-4000-8000-000000000010','63000000-0000-4000-8000-000000000011','63000000-0000-4000-8000-000000000012','${now}');
      select public.add_research_project_application_member('${firstVersion}','${internal}','RESEARCH_LEAD',100,'63000000-0000-4000-8000-000000000013','${now}');
      select public.add_research_project_application_output('${firstVersion}','63000000-0000-4000-8000-000000000014','OUTPUT-REPORT','Report','63000000-0000-4000-8000-000000000015','${now}');
      select public.seal_research_project_application('${firstVersion}',1,'63000000-0000-4000-8000-000000000016','63000000-0000-4000-8000-000000000017','${now}');
      select public.create_research_project_approval_instance('${firstInstance}','${policyVersion}','${policyChecksum}','${firstVersion}',null,1,
        '63000000-0000-4000-8000-000000000018','63000000-0000-4000-8000-000000000019','63000000-0000-4000-8000-000000000020','${now}');
      select public.submit_research_project_approval_instance('${firstInstance}',1,'63000000-0000-4000-8000-000000000021','63000000-0000-4000-8000-000000000022',
        '63000000-0000-4000-8000-000000000023','63000000-0000-4000-8000-000000000024','63000000-0000-4000-8000-000000000025','63000000-0000-4000-8000-000000000026',
        '63000000-0000-4000-8000-000000000027','63000000-0000-4000-8000-000000000028','63000000-0000-4000-8000-000000000029','${now}'); commit;`);
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "APPROVAL_ENGINE")}
      select public.activate_approval_instance('${firstInstance}',2,'63000000-0000-4000-8000-000000000030','63000000-0000-4000-8000-000000000031',
        '63000000-0000-4000-8000-000000000032','63000000-0000-4000-8000-000000000033','${now}'); commit;`);
    run(`begin; set local role youone_request; ${requestContext(internal)}
      select public.request_research_project_approval_recall('${firstInstance}',3,'63000000-0000-4000-8000-000000000034','63000000-0000-4000-8000-000000000035',
        '63000000-0000-4000-8000-000000000036','63000000-0000-4000-8000-000000000037','APPLICANT-CORRECTION','${now}'); commit;`);
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "APPROVAL_ENGINE")}
      select public.complete_research_project_approval_recall('${firstInstance}',4,3,'63000000-0000-4000-8000-000000000038','63000000-0000-4000-8000-000000000039',
        '63000000-0000-4000-8000-000000000040','63000000-0000-4000-8000-000000000041','63000000-0000-4000-8000-000000000042',
        '63000000-0000-4000-8000-000000000043','63000000-0000-4000-8000-000000000044','APPLICANT-CORRECTION','${now}'); commit;`);
    expect(run(`select i.state||':'||v.state from public.approval_instance i join public.approval_subject_research_project_application s on s.instance_id=i.id
      join public.research_project_application_version v on v.id=s.application_version_id where i.id='${firstInstance}';`)).toBe("RECALLED:RETURNED");
    expect(run(`select count(*) from public.outbox_event where aggregate_type='RESEARCH_PROJECT_APPLICATION' and aggregate_id='${firstVersion}' and event_type='EVT-RP-APPLICATION-RETURNED';`)).toBe("1");

    const secondVersion = "63100000-0000-4000-8000-000000000001";
    const secondInstance = "63100000-0000-4000-8000-000000000002";
    run(`begin; set local role youone_request; ${requestContext(internal)}
      select public.create_research_project_application_revision('${firstVersion}','${secondVersion}',2,1,'Revised purpose','Method','2026-08-22','2027-08-21',1000,'KRW','Report',false,'Security','Safety',
        'RECALL-CORRECTION','63100000-0000-4000-8000-000000000010','63100000-0000-4000-8000-000000000011','63100000-0000-4000-8000-000000000012','${now}');
      select public.add_research_project_application_member('${secondVersion}','${internal}','RESEARCH_LEAD',100,'63100000-0000-4000-8000-000000000013','${now}');
      select public.add_research_project_application_output('${secondVersion}','63100000-0000-4000-8000-000000000014','OUTPUT-REPORT','Revised report','63100000-0000-4000-8000-000000000015','${now}');
      select public.seal_research_project_application('${secondVersion}',1,'63100000-0000-4000-8000-000000000016','63100000-0000-4000-8000-000000000017','${now}');
      select public.create_research_project_approval_instance('${secondInstance}','${policyVersion}','${policyChecksum}','${secondVersion}','${firstInstance}',2,
        '63100000-0000-4000-8000-000000000018','63100000-0000-4000-8000-000000000019','63100000-0000-4000-8000-000000000020','${now}');
      select public.submit_research_project_approval_instance('${secondInstance}',1,'63100000-0000-4000-8000-000000000021','63100000-0000-4000-8000-000000000022',
        '63100000-0000-4000-8000-000000000023','63100000-0000-4000-8000-000000000024','63100000-0000-4000-8000-000000000025','63100000-0000-4000-8000-000000000026',
        '63100000-0000-4000-8000-000000000027','63100000-0000-4000-8000-000000000028','63100000-0000-4000-8000-000000000029','${now}'); commit;`);
    run(`begin; set local role youone_privileged_writer; ${requestContext("", "SYSTEM", "APPROVAL_ENGINE")}
      select public.activate_approval_instance('${secondInstance}',2,'63100000-0000-4000-8000-000000000030','63100000-0000-4000-8000-000000000031',
        '63100000-0000-4000-8000-000000000032','63100000-0000-4000-8000-000000000033','${now}'); commit;`);
    const step = run(`select id from public.approval_step where instance_id='${secondInstance}';`);
    const participant = run(`select id from public.approval_participant where step_id='${step}';`);
    run(`begin; set local role youone_request; ${requestContext(director)}
      select public.perform_research_project_approval_action('${secondInstance}','${step}','${participant}','RETURN',3,1,1,3,
        '63100000-0000-4000-8000-000000000034','63100000-0000-4000-8000-000000000035','63100000-0000-4000-8000-000000000036',
        '63100000-0000-4000-8000-000000000037','63100000-0000-4000-8000-000000000038','63100000-0000-4000-8000-000000000039',
        '63100000-0000-4000-8000-000000000040',null,null,'DETAIL-CODE','Please revise the method','${now}'); commit;`);
    expect(run(`select i.state||':'||v.state||':'||a.reason_code||':'||a.opinion from public.approval_instance i
      join public.approval_subject_research_project_application s on s.instance_id=i.id join public.research_project_application_version v on v.id=s.application_version_id
      join public.approval_action a on a.instance_id=i.id and a.event_id='REJECT' where i.id='${secondInstance}';`)).toBe("REJECTED:RETURNED:RP-RETURNED-FOR-REVISION:Please revise the method");
  });

  it("forces output/evidence RLS and denies direct request mutation", () => {
    expect(run("select count(*) from pg_class where relnamespace='public'::regnamespace and relname in ('research_project_application_output','research_project_application_evidence') and relrowsecurity and relforcerowsecurity;")).toBe("2");
    run(`begin; set local role youone_request; ${requestContext()} insert into public.research_project_application_output(application_version_id,output_id,output_type_id,title)
      values('${applicationVersion}',extensions.gen_random_uuid(),'FORGED','Forged'); rollback;`, false);
    expect(run(`begin; set local role youone_request; ${requestContext(vendor)} select count(*) from public.research_project_application_output; rollback;`).split("\n").at(-1)).toBe("0");
    expect(run(`begin; set local role youone_request; ${requestContext(vendor)} select count(*) from public.research_project_application_evidence; rollback;`).split("\n").at(-1)).toBe("0");
  });

  it("keeps direct generic action and formal-label mutation surfaces closed", () => {
    expect(run("select count(*) from information_schema.columns where table_schema='public' and table_name='project' and column_name like '%formal%';")).toBe("0");
    expect(run("select has_table_privilege('youone_request','public.research_project_designation','insert')||':'||has_table_privilege('youone_privileged_writer','public.research_project_designation','insert');")).toBe("false:false");
    expect(run(`select count(*) from public.audit_log where resource_type in ('PROJECT','WBS_NODE','RESEARCH_PROJECT_APPLICATION','RESEARCH_PROJECT_DESIGNATION') and result='SUCCEEDED';`)).not.toBe("0");
  });
});

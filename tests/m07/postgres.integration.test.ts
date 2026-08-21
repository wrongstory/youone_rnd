import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.M07_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrations = [
  "20260821000100_m02_database_audit_kernel.sql",
  "20260821000200_m03_auth_rbac_scope.sql",
  "20260822000300_m04_approval_engine.sql",
  "20260822000400_m05_document_file.sql",
  "20260822000500_m06_project_wbs.sql",
  "20260822000600_m07_vendor_contract.sql",
].map((name) => readFileSync(resolve(import.meta.dirname, `../../supabase/migrations/${name}`), "utf8")).join("\n");
const dbDescribe = url === undefined ? describe.skip : describe;
const now = "2026-08-22T09:00:00Z";
const organization = "70000000-0000-4000-8000-000000000001";
const manager = "70000000-0000-4000-8000-000000000002";
const vendorActor = "70000000-0000-4000-8000-000000000003";
const otherVendorActor = "70000000-0000-4000-8000-000000000004";
const vendor = "70000000-0000-4000-8000-000000000005";
const otherVendor = "70000000-0000-4000-8000-000000000006";
const vendorUser = "70000000-0000-4000-8000-000000000007";
const otherVendorUser = "70000000-0000-4000-8000-000000000008";
const project = "70000000-0000-4000-8000-000000000009";
const contract = "70000000-0000-4000-8000-000000000010";
const otherContract = "70000000-0000-4000-8000-000000000011";
const grant = "70000000-0000-4000-8000-000000000012";
const otherGrant = "70000000-0000-4000-8000-000000000013";
const concurrentContract = "70000000-0000-4000-8000-000000000014";

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("M07_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url], { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}

function runAsync(sql: string): Promise<number | null> {
  if (url === undefined) throw new Error("M07_TEST_DATABASE_URL required");
  return new Promise((resolvePromise) => {
    const child = spawn(psql, ["-X", "--no-psqlrc", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url]);
    child.stdin.end(sql);
    child.on("close", resolvePromise);
  });
}

function requestContext(actor = manager): string {
  return `
    select set_config('app.actor_kind','USER',true);
    select set_config('app.actor_user_id','${actor}',true);
    select set_config('app.effective_actor_user_id','${actor}',true);
    select set_config('app.anonymous_subject_fingerprint','',true);
    select set_config('app.system_actor_id','',true);
    select set_config('app.correlation_id','request:m07-db',true);
    select set_config('app.causation_id','',true);
    select set_config('app.request_time','${now}',true);
    select set_config('app.acting_authority_id','',true);`;
}

dbDescribe.sequential("M07 PostgreSQL Vendor/Contract boundary", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M07 test DB required");
    run(migrations);
    run(`
      insert into public.organization(id,stable_code,legal_name,status) values('${organization}','M07-ORG','M07 Org','ACTIVE');
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values
        ('${manager}','m07-manager','INTERNAL','ACTIVE','2026-01-01'),
        ('${vendorActor}','m07-vendor','VENDOR','ACTIVE','2026-01-01'),
        ('${otherVendorActor}','m07-other-vendor','VENDOR','ACTIVE','2026-01-01');
      insert into public.user_organization_assignment(id,user_id,organization_id,valid_from,grant_reason_code)
        values('70000000-0000-4000-8000-000000000020','${manager}','${organization}','2026-01-01','M07-FIXTURE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code) values
        ('70000000-0000-4000-8000-000000000021','${manager}','20000000-0000-4000-8000-000000000001','2026-01-01','M07-FIXTURE'),
        ('70000000-0000-4000-8000-000000000022','${vendorActor}','20000000-0000-4000-8000-000000000005','2026-01-01','M07-FIXTURE'),
        ('70000000-0000-4000-8000-000000000023','${otherVendorActor}','20000000-0000-4000-8000-000000000005','2026-01-01','M07-FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
      select ('70100000-0000-4000-8000-'||lpad(row_number() over(order by id)::text,12,'0'))::uuid,
        '20000000-0000-4000-8000-000000000001',id,'2026-01-01','M07-FIXTURE' from public.permission
        where stable_code in('contract.record.create','contract.record.update','contract.detail.finance.read','contract.scope.manage');
      insert into public.vendor(id,vendor_code,legal_name,status) values
        ('${vendor}','M07-VENDOR-A','Vendor A','ACTIVE'),('${otherVendor}','M07-VENDOR-B','Vendor B','ACTIVE');
      insert into public.vendor_user(id,vendor_id,user_id,status,valid_from,grant_reason_code) values
        ('${vendorUser}','${vendor}','${vendorActor}','ACTIVE','2026-01-01','M07-FIXTURE'),
        ('${otherVendorUser}','${otherVendor}','${otherVendorActor}','ACTIVE','2026-01-01','M07-FIXTURE');
      insert into public.project(id,project_code,name,organization_id,owner_user_id,objective,period_start,period_end,visibility_code,state,created_at,updated_at)
        values('${project}','M07-PROJECT','Project','${organization}','${manager}','Objective','2026-08-01','2027-08-01','MEMBERS_ONLY','ACTIVE','${now}','${now}');
      insert into public.vendor_contract(id,contract_no,vendor_id,manager_user_id,title,state,version_no,created_at,updated_at) values
        ('${contract}','M07-C-1','${vendor}','${manager}','Contract A','CLOSING',5,'${now}','${now}'),
        ('${otherContract}','M07-C-2','${vendor}','${manager}','Contract B','TERMINATION_REVIEW',3,'${now}','${now}');
      insert into public.contract_project(id,contract_id,project_id,valid_from) values
        ('70000000-0000-4000-8000-000000000030','${contract}','${project}','2026-08-01'),
        ('70000000-0000-4000-8000-000000000031','${otherContract}','${project}','2026-08-01');
      insert into public.contract_vendor_grant(id,contract_id,project_id,vendor_user_id,status,valid_from,granted_by_user_id,grant_reason_code) values
        ('${grant}','${contract}','${project}','${vendorUser}','ACTIVE','2026-08-01','${manager}','M07-FIXTURE'),
        ('${otherGrant}','${otherContract}','${project}','${vendorUser}','ACTIVE','2026-08-01','${manager}','M07-FIXTURE');
      insert into public.contract_vendor_grant_action(grant_id,permission_id) values
        ('${grant}','37000000-0000-4000-8000-000000000003'),('${grant}','37000000-0000-4000-8000-000000000004'),
        ('${otherGrant}','37000000-0000-4000-8000-000000000003'),('${otherGrant}','37000000-0000-4000-8000-000000000004');
    `);
  }, 30_000);

  it("applies M02 through M07 cleanly with exact constraints and FORCE RLS", () => {
    const tables = ["vendor_contract", "contract_version", "contract_project", "contract_milestone", "deliverable", "deliverable_version", "guarantee", "warranty_issue", "contract_vendor_grant", "approval_subject_contract_version"];
    expect(run(`select count(*) from information_schema.tables where table_schema='public' and table_name in (${tables.map((name) => `'${name}'`).join(",")});`)).toBe(String(tables.length));
    expect(run(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in (${tables.map((name) => `'${name}'`).join(",")}) and relrowsecurity and relforcerowsecurity;`)).toBe(String(tables.length));
    expect(run("select count(*) from pg_constraint where conrelid='public.approval_subject_contract_version'::regclass and pg_get_constraintdef(oid) like 'FOREIGN KEY (contract_version_id, contract_id, subject_version_no, subject_checksum, subject_sealed_at)%';")).toBe("1");
  });

  it("denies Vendor base tables and exposes only exact list/basic projections", () => {
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.vendor_contract; rollback;`).split("\n").at(-1)).toBe("0");
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.read_vendor_contract_list_safe('${now}'); rollback;`).split("\n").at(-1)).toBe("2");
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.read_vendor_contract_basic('${contract}','${now}'); rollback;`).split("\n").at(-1)).toBe("1");
    expect(run(`begin; set local role youone_request; ${requestContext(otherVendorActor)} select count(*) from public.read_vendor_contract_list_safe('${now}'); rollback;`).split("\n").at(-1)).toBe("0");
    expect(run("select pg_get_function_result('public.read_vendor_contract_list_safe(timestamptz)'::regprocedure);")).not.toMatch(/amount|currency|payment|guarantee|evaluation|risk/i);
  });

  it("removes access immediately for disabled, revoked and expired membership/scope", () => {
    run(`update public.user_account set status='DISABLED' where id='${vendorActor}';`);
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.read_vendor_contract_list_safe('${now}'); rollback;`).split("\n").at(-1)).toBe("0");
    run(`update public.user_account set status='ACTIVE' where id='${vendorActor}'; update public.contract_vendor_grant set valid_until='2026-08-22T08:00:00Z' where id='${grant}';`);
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.read_vendor_contract_basic('${contract}','${now}'); rollback;`).split("\n").at(-1)).toBe("0");
    run(`update public.contract_vendor_grant set valid_until=null where id='${grant}'; update public.vendor_user set status='REVOKED',revoked_at='${now}',revoked_by_user_id='${manager}' where id='${vendorUser}';`);
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.read_vendor_contract_list_safe('${now}'); rollback;`).split("\n").at(-1)).toBe("0");
    run(`update public.vendor_user set status='ACTIVE',revoked_at=null,revoked_by_user_id=null where id='${vendorUser}';`);
  });

  it("closes Contract and revokes Scope with audit/transition/outbox atomically", () => {
    run(`begin; set local role youone_request; ${requestContext()}
      select public.transition_vendor_contract_and_revoke_scope('${contract}','EVT-CONTRACT-CLOSE',5,'CONTRACT-CLOSE',
        '71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000003','${now}'); commit;`);
    expect(run(`select c.state||':'||c.version_no||':'||g.status from public.vendor_contract c join public.contract_vendor_grant g on g.contract_id=c.id where c.id='${contract}';`)).toBe("CLOSED:6:REVOKED");
    expect(run(`select count(*) from public.audit_log a join public.state_transition_history t on t.audit_log_id=a.id join public.outbox_event o on o.initiating_audit_log_id=a.id where a.resource_id='${contract}' and a.result='SUCCEEDED';`)).toBe("1");
  });

  it("rolls back termination state and Scope when the outbox write fails", () => {
    run(`begin; set local role youone_request; ${requestContext()}
      select public.transition_vendor_contract_and_revoke_scope('${otherContract}','EVT-CONTRACT-TERMINATE',3,'TERMINATE',
        '71000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000003','${now}'); commit;`, false);
    expect(run(`select c.state||':'||c.version_no||':'||g.status from public.vendor_contract c join public.contract_vendor_grant g on g.contract_id=c.id where c.id='${otherContract}';`)).toBe("TERMINATION_REVIEW:3:ACTIVE");
  });

  it("serializes exact Contract/Project/VendorMembership Scope issuance to one winner", async () => {
    run(`insert into public.vendor_contract(id,contract_no,vendor_id,manager_user_id,title,state,version_no,created_at,updated_at)
      values('${concurrentContract}','M07-C-CONCURRENT','${vendor}','${manager}','Concurrent Contract','SIGNED',1,'${now}','${now}');
      insert into public.contract_project(id,contract_id,project_id,valid_from)
      values('70000000-0000-4000-8000-000000000032','${concurrentContract}','${project}','2026-08-01');`);
    const insert = (id: string) => `begin;
      insert into public.contract_vendor_grant(id,contract_id,project_id,vendor_user_id,status,valid_from,granted_by_user_id,grant_reason_code)
      values('${id}','${concurrentContract}','${project}','${vendorUser}','ACTIVE','2026-08-01','${manager}','M07-CONCURRENT');
      select pg_sleep(0.2); commit;`;
    const results = await Promise.all([
      runAsync(insert("70000000-0000-4000-8000-000000000040")),
      runAsync(insert("70000000-0000-4000-8000-000000000041")),
    ]);
    expect(results.filter((status) => status === 0)).toHaveLength(1);
    expect(run(`select count(*) from public.contract_vendor_grant where contract_id='${concurrentContract}' and project_id='${project}' and vendor_user_id='${vendorUser}' and status='ACTIVE';`)).toBe("1");
  });

  it("prevents request and privileged roles from bypassing guarded writes", () => {
    run(`begin; set local role youone_request; ${requestContext(vendorActor)} update public.vendor_contract set state='ACTIVE' where id='${otherContract}'; rollback;`, false);
    expect(run("select has_function_privilege('youone_privileged_writer','public.transition_vendor_contract_and_revoke_scope(uuid,text,bigint,text,uuid,uuid,uuid,timestamptz)','execute');")).toBe("f");
    expect(run("select has_table_privilege('youone_privileged_writer','public.vendor_contract','update');")).toBe("f");
  });
});

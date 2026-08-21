import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// M02 and M03 mutate the public schema, so CI must give this suite a dedicated DB.
const url = process.env.M03_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const m02 = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260821000100_m02_database_audit_kernel.sql"), "utf8");
const m03 = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260821000200_m03_auth_rbac_scope.sql"), "utf8");
const dbDescribe = url === undefined ? describe.skip : describe;
const requestTime = "2026-08-21T12:00:00Z";

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("M03_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url], { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}

function context(userId: string, effectiveUserId = userId, actingAuthorityId = ""): string {
  return `
    select set_config('app.actor_kind','USER',true);
    select set_config('app.actor_user_id','${userId}',true);
    select set_config('app.effective_actor_user_id','${effectiveUserId}',true);
    select set_config('app.anonymous_subject_fingerprint','',true);
    select set_config('app.system_actor_id','',true);
    select set_config('app.correlation_id','request:m03-db',true);
    select set_config('app.causation_id','',true);
    select set_config('app.request_time','${requestTime}',true);
    select set_config('app.acting_authority_id','${actingAuthorityId}',true);`;
}

const internal = "11000000-0000-4000-8000-000000000001";
const vendorUser = "11000000-0000-4000-8000-000000000002";
const otherVendorUser = "11000000-0000-4000-8000-000000000003";
const disabled = "11000000-0000-4000-8000-000000000004";
const expired = "11000000-0000-4000-8000-000000000005";
const vendorLifecycleUser = "11000000-0000-4000-8000-000000000006";
const vendorDisableUser = "11000000-0000-4000-8000-000000000007";
const effectiveInternal = "11000000-0000-4000-8000-000000000008";
const vendorOne = "22000000-0000-4000-8000-000000000001";
const vendorTwo = "22000000-0000-4000-8000-000000000002";
const vendorThree = "22000000-0000-4000-8000-000000000003";
const vendorFour = "22000000-0000-4000-8000-000000000004";
const membershipOne = "33000000-0000-4000-8000-000000000001";
const membershipTwo = "33000000-0000-4000-8000-000000000002";
const expiredMembership = "33000000-0000-4000-8000-000000000003";
const revokedMembership = "33000000-0000-4000-8000-000000000004";
const lifecycleMembership = "33000000-0000-4000-8000-000000000005";
const vendorDisableMembership = "33000000-0000-4000-8000-000000000006";

dbDescribe.sequential("M03 PostgreSQL RLS", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M03 test DB required");
    run(`${m02}\n${m03}`);
    run(`
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from,valid_until) values
        ('${internal}','internal','INTERNAL','ACTIVE','2026-01-01',null),
        ('${vendorUser}','vendor-one','VENDOR','ACTIVE','2026-01-01',null),
        ('${otherVendorUser}','vendor-two','VENDOR','ACTIVE','2026-01-01',null),
        ('${disabled}','disabled','INTERNAL','DISABLED','2026-01-01',null),
        ('${expired}','expired','VENDOR','ACTIVE','2026-01-01','2026-08-01'),
        ('${vendorLifecycleUser}','vendor-lifecycle','VENDOR','ACTIVE','2026-01-01',null),
        ('${vendorDisableUser}','vendor-disable','VENDOR','ACTIVE','2026-01-01',null),
        ('${effectiveInternal}','effective-internal','INTERNAL','ACTIVE','2026-01-01',null);
      insert into public.vendor(id,vendor_code,legal_name,status) values
        ('${vendorOne}','VENDOR_ONE','Vendor One','ACTIVE'),('${vendorTwo}','VENDOR_TWO','Vendor Two','ACTIVE'),
        ('${vendorThree}','VENDOR_THREE','Vendor Three','ACTIVE'),('${vendorFour}','VENDOR_FOUR','Vendor Four','ACTIVE');
      insert into public.vendor_user(id,vendor_id,user_id,status,valid_from,valid_until,grant_reason_code) values
        ('${membershipOne}','${vendorOne}','${vendorUser}','ACTIVE','2026-01-01',null,'M03_FIXTURE'),
        ('${membershipTwo}','${vendorTwo}','${otherVendorUser}','ACTIVE','2026-01-01',null,'M03_FIXTURE'),
        ('${expiredMembership}','${vendorOne}','${expired}','ACTIVE','2026-01-01','2026-08-01','M03_FIXTURE'),
        ('${revokedMembership}','${vendorTwo}','${vendorUser}','REVOKED','2026-01-01',null,'M03_FIXTURE'),
        ('${vendorDisableMembership}','${vendorFour}','${vendorDisableUser}','ACTIVE','2026-01-01',null,'M03_FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
        values
          ('44000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000001','2026-01-01','M03_FIXTURE'),
          ('44000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000004','2026-01-01','M03_FIXTURE'),
          ('44000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000005','2026-01-01','M03_FIXTURE'),
          ('44000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000006','2026-01-01','M03_FIXTURE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code)
        values ('44000000-0000-4000-8000-000000000002','${internal}','20000000-0000-4000-8000-000000000006','2026-01-01','M03_FIXTURE');
    `);
  }, 30_000);

  it("allows active self while disabled and expired accounts see nothing", () => {
    expect(run(`begin; set local role youone_request; ${context(internal)} select count(*) from public.user_account; rollback;`).split("\n").at(-1)).toBe("1");
    expect(run(`begin; set local role youone_request; ${context(disabled)} select count(*) from public.user_account; rollback;`).split("\n").at(-1)).toBe("0");
    expect(run(`begin; set local role youone_request; ${context(expired)} select count(*) from public.user_account; rollback;`).split("\n").at(-1)).toBe("0");
  });

  it("denies expired membership and cross-vendor membership", () => {
    expect(run(`begin; set local role youone_request; ${context(vendorUser)} select app_private.actor_has_vendor_membership('${membershipOne}','${vendorOne}'); rollback;`).split("\n").at(-1)).toBe("t");
    expect(run(`begin; set local role youone_request; ${context(vendorUser)} select app_private.actor_has_vendor_membership('${membershipTwo}','${vendorTwo}'); rollback;`).split("\n").at(-1)).toBe("f");
    expect(run(`begin; set local role youone_request; ${context(expired)} select app_private.actor_has_vendor_membership('${expiredMembership}','${vendorOne}'); rollback;`).split("\n").at(-1)).toBe("f");
    expect(run(`begin; set local role youone_request; ${context(vendorUser)} select app_private.actor_has_vendor_membership('${revokedMembership}','${vendorTwo}'); rollback;`).split("\n").at(-1)).toBe("f");
    expect(run(`begin; set local role youone_request; ${context(vendorUser)} select count(*) from public.vendor; rollback;`).split("\n").at(-1)).toBe("1");
  });

  it("denies direct request-role writes to protected tables", () => {
    run(`begin; set local role youone_request; ${context(internal)} insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code) values(extensions.gen_random_uuid(),'${internal}','20000000-0000-4000-8000-000000000001','2026-01-01','FORGED'); rollback;`, false);
    run(`begin; set local role youone_request; ${context(internal)} select * from public.audit_log; rollback;`, false);
    run(`begin; set local role youone_request; ${context(internal)} select * from public.field_projection_field; rollback;`, false);
    run(`begin; set local role youone_request; ${context(internal)} select app_private.resolve_actor_context_snapshot('vendor-two','${requestTime}'); rollback;`, false);
    run(`insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code) values('55000000-0000-4000-8000-000000000090','${vendorUser}','20000000-0000-4000-8000-000000000006','2026-01-01','M03_FORGED_ADMIN');`, false);
  });

  it("allows only the isolated resolver principal to resolve a verified subject", () => {
    expect(run(`begin; set local role youone_identity_resolver; select app_private.resolve_actor_context_snapshot('internal','${requestTime}')->>'userId'; rollback;`).split("\n").at(-1)).toBe(internal);
  });

  it("audits a role grant atomically and rejects caller-controlled past time", () => {
    run(`begin; set local role youone_request; ${context(internal)} select app_private.grant_user_role('55000000-0000-4000-8000-000000000001','${vendorUser}','20000000-0000-4000-8000-000000000005','${requestTime}',null,'M03_TEST_GRANT','66000000-0000-4000-8000-000000000001','${"a".repeat(64)}','${requestTime}'); commit;`);
    expect(run("select count(*) from public.audit_log where id='66000000-0000-4000-8000-000000000001';")).toBe("1");
    run(`begin; set local role youone_request; ${context(internal)} select app_private.revoke_user_role('55000000-0000-4000-8000-000000000001',0,'M03_TEST_REVOKE','66000000-0000-4000-8000-000000000003','${"a".repeat(64)}','${"c".repeat(64)}','${requestTime}'); commit;`);
    expect(run("select count(*) from public.audit_log where id='66000000-0000-4000-8000-000000000003';")).toBe("1");
    expect(run("select count(*) from public.user_role_assignment where id='55000000-0000-4000-8000-000000000001' and revoked_at is not null and version_no=1;")).toBe("1");
    run(`begin; set local role youone_request; ${context(internal)} select app_private.grant_user_role('55000000-0000-4000-8000-000000000002','${vendorUser}','20000000-0000-4000-8000-000000000005','2026-01-01',null,'M03_TEST_GRANT','66000000-0000-4000-8000-000000000002','${"b".repeat(64)}','2026-01-01'); rollback;`, false);
    expect(run("select count(*) from public.user_role_assignment where id='55000000-0000-4000-8000-000000000002';")).toBe("0");
    run(`begin; set local role youone_request; ${context(internal)} select app_private.grant_user_role('55000000-0000-4000-8000-000000000091','${internal}','20000000-0000-4000-8000-000000000005','${requestTime}',null,'M03_KIND_MISMATCH','66000000-0000-4000-8000-000000000091','${"b".repeat(64)}','${requestTime}'); rollback;`, false);
  });

  it("guards vendor membership lifecycle and makes revocation immediate", () => {
    run(`begin; set local role youone_request; ${context(internal)} select app_private.grant_vendor_membership('${lifecycleMembership}','${vendorThree}','${vendorLifecycleUser}','${requestTime}',null,'M03_VENDOR_GRANT','66000000-0000-4000-8000-000000000010','${"d".repeat(64)}','${requestTime}'); commit;`);
    expect(run(`begin; set local role youone_request; ${context(vendorLifecycleUser)} select app_private.actor_has_vendor_membership('${lifecycleMembership}','${vendorThree}'); rollback;`).split("\n").at(-1)).toBe("t");
    run(`begin; set local role youone_request; ${context(internal)} select app_private.revoke_vendor_membership('${lifecycleMembership}',0,'M03_VENDOR_REVOKE','66000000-0000-4000-8000-000000000011','${"d".repeat(64)}','${"e".repeat(64)}','${requestTime}'); commit;`);
    expect(run(`begin; set local role youone_request; ${context(vendorLifecycleUser)} select app_private.actor_has_vendor_membership('${lifecycleMembership}','${vendorThree}'); rollback;`).split("\n").at(-1)).toBe("f");
    run(`begin; set local role youone_request; ${context(internal)} select app_private.revoke_vendor_membership('${lifecycleMembership}',0,'M03_STALE','66000000-0000-4000-8000-000000000012','${"d".repeat(64)}','${"e".repeat(64)}','${requestTime}'); rollback;`, false);
    run(`begin; set local role youone_request; ${context(vendorUser)} select app_private.disable_vendor('${vendorThree}',0,'M03_UNAUTHORIZED','66000000-0000-4000-8000-000000000013','${"d".repeat(64)}','${"e".repeat(64)}','${requestTime}'); rollback;`, false);
    run(`begin; set local role youone_request; ${context(internal)} select app_private.grant_vendor_membership('33000000-0000-4000-8000-000000000099','${vendorThree}','${internal}','${requestTime}',null,'M03_INTERNAL_FORGED','66000000-0000-4000-8000-000000000014','${"d".repeat(64)}','${requestTime}'); rollback;`, false);
  });

  it("disables vendor and account with immediate RLS/helper denial and stale protection", () => {
    run(`begin; set local role youone_request; ${context(internal)} select app_private.disable_vendor('${vendorFour}',0,'M03_VENDOR_DISABLE','66000000-0000-4000-8000-000000000020','${"f".repeat(64)}','${"1".repeat(64)}','${requestTime}'); commit;`);
    expect(run(`begin; set local role youone_request; ${context(vendorDisableUser)} select app_private.actor_has_vendor_membership('${vendorDisableMembership}','${vendorFour}'); rollback;`).split("\n").at(-1)).toBe("f");
    expect(run(`begin; set local role youone_request; ${context(vendorDisableUser)} select count(*) from public.vendor; rollback;`).split("\n").at(-1)).toBe("0");
    run(`begin; set local role youone_request; ${context(internal)} select app_private.disable_user_account('${vendorDisableUser}',0,'M03_ACCOUNT_DISABLE','66000000-0000-4000-8000-000000000021','${"2".repeat(64)}','${"3".repeat(64)}','${requestTime}'); commit;`);
    expect(run(`begin; set local role youone_request; ${context(vendorDisableUser)} select count(*) from public.user_account; rollback;`).split("\n").at(-1)).toBe("0");
    run(`begin; set local role youone_request; ${context(internal)} select app_private.disable_user_account('${vendorDisableUser}',0,'M03_STALE','66000000-0000-4000-8000-000000000022','${"2".repeat(64)}','${"3".repeat(64)}','${requestTime}'); rollback;`, false);
  });

  it("rejects vendor internal assignments, primary position overlap, and revalidates acting authority", () => {
    run(`insert into public.user_position_assignment(id,user_id,position_id,valid_from,grant_reason_code) values('77000000-0000-4000-8000-000000000001','${vendorUser}','10000000-0000-4000-8000-000000000001','2026-01-01','M03_FORGED');`, false);
    run(`insert into public.user_position_assignment(id,user_id,position_id,valid_from,grant_reason_code) values('77000000-0000-4000-8000-000000000002','${internal}','10000000-0000-4000-8000-000000000001','2026-01-01','M03_PRIMARY');`);
    run(`insert into public.user_position_assignment(id,user_id,position_id,valid_from,grant_reason_code) values('77000000-0000-4000-8000-000000000003','${internal}','10000000-0000-4000-8000-000000000003','2026-02-01','M03_OVERLAP');`, false);
    run(`
      insert into public.permission(id,stable_code) values('30000000-0000-4000-8000-000000000099','approval.step.approve');
      insert into public.authorization_action_set(id,stable_code) values('88000000-0000-4000-8000-000000000001','M03_ACTING_APPROVE');
      insert into public.authorization_action_set_version(action_set_id,version_no,valid_from,valid_until) values('88000000-0000-4000-8000-000000000001',1,'2026-01-01','2026-09-01');
      insert into public.authorization_action_set_permission values('88000000-0000-4000-8000-000000000001',1,'30000000-0000-4000-8000-000000000099');
      insert into public.acting_authority_assignment(id,authenticated_user_id,effective_actor_user_id,role_id,action_set_id,action_set_version,valid_from,valid_until,evidence_id,granted_by_user_id,grant_reason_code)
      values
        ('99000000-0000-4000-8000-000000000001','${internal}','${effectiveInternal}','20000000-0000-4000-8000-000000000003','88000000-0000-4000-8000-000000000001',1,'2026-08-01','2026-09-01','99000000-0000-4000-8000-000000000002','${internal}','M03_ACTING'),
        ('99000000-0000-4000-8000-000000000003','${internal}','${effectiveInternal}','20000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001',1,'2026-08-01','2026-09-01','99000000-0000-4000-8000-000000000004','${internal}','M03_NON_OFFICIAL');
    `);
    run(`insert into public.acting_authority_assignment(id,authenticated_user_id,effective_actor_user_id,role_id,action_set_id,action_set_version,valid_from,valid_until,evidence_id,granted_by_user_id,grant_reason_code)
      values('99000000-0000-4000-8000-000000000099','${vendorUser}','${effectiveInternal}','20000000-0000-4000-8000-000000000003','88000000-0000-4000-8000-000000000001',1,'2026-08-01','2026-09-01','99000000-0000-4000-8000-000000000098','${internal}','M03_VENDOR_ACTING');`, false);
    expect(run(`begin; set local role youone_request; ${context(internal,effectiveInternal,"99000000-0000-4000-8000-000000000001")} select app_private.acting_authority_allows('approval.step.approve'); rollback;`).split("\n").at(-1)).toBe("t");
    expect(run(`begin; set local role youone_request; ${context(internal,internal,"99000000-0000-4000-8000-000000000001")} select app_private.acting_authority_allows('approval.step.approve'); rollback;`).split("\n").at(-1)).toBe("f");
    expect(run(`begin; set local role youone_request; ${context(internal,effectiveInternal,"99000000-0000-4000-8000-000000000003")} select app_private.acting_authority_allows('approval.step.approve'); rollback;`).split("\n").at(-1)).toBe("f");
    run(`update public.acting_authority_assignment set revoked_at='${requestTime}',revoked_by_user_id='${internal}' where id='99000000-0000-4000-8000-000000000001';`);
    expect(run(`begin; set local role youone_request; ${context(internal,effectiveInternal,"99000000-0000-4000-8000-000000000001")} select app_private.acting_authority_allows('approval.step.approve'); rollback;`).split("\n").at(-1)).toBe("f");
  });
});

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.P0_DEVICE_TRUST_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const databaseDescribe = databaseUrl === undefined ? describe.skip : describe;
const migrationDirectory = resolve(import.meta.dirname, "../../supabase/migrations");
const migrationSql = readdirSync(migrationDirectory)
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(resolve(migrationDirectory, name), "utf8"))
  .join("\n");

const userId = "66000000-0000-4000-8000-000000000001";
const authSubject = "66000000-0000-4000-8000-000000000002";
const sessionId = "66000000-0000-4000-8000-000000000003";
const factorId = "66000000-0000-4000-8000-000000000004";
const evidenceId = "66000000-0000-4000-8000-000000000005";
const sourceEvidenceId = "66000000-0000-4000-8000-000000000006";
const policyId = "66000000-0000-4000-8000-000000000007";
const policyApprovalId = "66000000-0000-4000-8000-000000000008";
const deviceId = "66000000-0000-4000-8000-000000000009";
const requestTime = "2026-08-25T05:00:00Z";
const credentialHmac = "a".repeat(64);

function run(sql: string, succeeds = true): string {
  if (databaseUrl === undefined) throw new Error("P0_DEVICE_TRUST_TEST_DATABASE_URL required");
  const result = spawnSync(
    psql,
    ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl],
    { input: sql, encoding: "utf8" }
  );
  if (succeeds && result.status !== 0) throw new Error(`DeviceTrust PostgreSQL test failed: ${result.stderr}`);
  if (!succeeds && result.status === 0) throw new Error("DeviceTrust PostgreSQL adversarial statement unexpectedly succeeded");
  return result.stdout.trim();
}

function context(session = sessionId): string {
  return `
    select
      set_config('app.actor_kind','USER',true),
      set_config('app.actor_user_id','${userId}',true),
      set_config('app.effective_actor_user_id','${userId}',true),
      set_config('app.correlation_id','test:device-trust',true),
      set_config('app.request_time','${requestTime}',true),
      set_config('app.session_id','${session}',true),
      set_config('app.assurance_level','AAL2',true);
  `;
}

databaseDescribe.sequential("P0 DeviceTrust and account activation DB enforcement", () => {
  beforeAll(() => {
    if (databaseUrl === undefined) return;
    if (!/test/i.test(new URL(databaseUrl).pathname)) throw new Error("DeviceTrust database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") {
      throw new Error("clean dedicated DeviceTrust test DB required");
    }
    run(migrationSql);
    run(`
      create schema auth;
      create table auth.mfa_factors(
        id uuid primary key,
        user_id uuid not null,
        factor_type text not null,
        status text not null,
        created_at timestamptz not null,
        updated_at timestamptz
      );
      create table auth.sessions(
        id uuid primary key,
        user_id uuid not null,
        created_at timestamptz,
        updated_at timestamptz,
        factor_id uuid,
        aal text,
        not_after timestamptz,
        refreshed_at timestamp without time zone
      );
      create role youone_activation_test_login login password 'activation-test'
        nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
      grant youone_activation to youone_activation_test_login;

      insert into public.user_account(id,auth_subject,account_kind,status,valid_from)
      values ('${userId}','${authSubject}','INTERNAL','PENDING','2026-08-25T04:00:00Z');
      insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
      values ('${factorId}','${authSubject}','totp','verified','2026-08-25T04:40:00Z','2026-08-25T04:45:00Z');
      insert into auth.sessions(id,user_id,created_at,updated_at,factor_id,aal,refreshed_at)
      values ('${sessionId}','${authSubject}','2026-08-25T04:30:00Z','2026-08-25T04:50:00Z','${factorId}','aal2',timestamp '2026-08-25 04:50:00');
      insert into public.identity_activation_evidence(
        id,user_account_id,evidence_kind,source_evidence_id,source_evidence_sha256,
        provider_auth_subject,approved_at,provider_invitation_accepted_at,
        password_established_at,valid_from,created_at
      ) values (
        '${evidenceId}','${userId}','OD042_BOOTSTRAP','${sourceEvidenceId}','${"b".repeat(64)}',
        '${authSubject}','2026-08-25T04:00:00Z','2026-08-25T04:30:00Z',
        '2026-08-25T04:31:00Z','2026-08-25T04:45:00Z','2026-08-25T04:46:00Z'
      );
    `);
  }, 60_000);

  it("fails enrollment closed until a canonical-hash-bound policy exists", () => {
    expect(run(`begin; set local role youone_activation; select app_private.load_effective_device_trust_policy('${requestTime}') is null; rollback;`).split("\n").at(-1)).toBe("t");
    run(`
      begin; set local role youone_activation; ${context()}
      select app_private.create_pending_device_trust(
        '${deviceId}','${authSubject}','${sessionId}','${evidenceId}','${credentialHmac}',
        '${policyId}','2026-08-25T06:00:00Z','66000000-0000-4000-8000-000000000010','${requestTime}'
      ); rollback;
    `, false);
  });

  it("blocks replay/cross-session and never activates the account as a side effect", () => {
    const canonical = [
      "YOUONE_DEVICE_TRUST_POLICY_V1",
      `DEVICE_TRUST_POLICY_TEST|3600|PASSWORD_TOTP_AAL2|${policyApprovalId}|2026-08-25T04:00:00.000000Z|2026-08-25T04:30:00.000000Z|null`
    ].join("\n");
    run(`
      insert into public.device_trust_policy_version(
        id,policy_code,maximum_trust_seconds,authentication_method,approval_evidence_id,
        approval_snapshot_sha256,created_at,approved_at,effective_at
      ) values (
        '${policyId}','DEVICE_TRUST_POLICY_TEST',3600,'PASSWORD_TOTP_AAL2','${policyApprovalId}',
        encode(extensions.digest(convert_to('${canonical.replaceAll("'", "''")}', 'UTF8'),'sha256'),'hex'),
        '2026-08-25T03:00:00Z','2026-08-25T04:00:00Z','2026-08-25T04:30:00Z'
      );
      begin; set local role youone_activation; ${context()}
      select app_private.create_pending_device_trust(
        '${deviceId}','${authSubject}','${sessionId}','${evidenceId}','${credentialHmac}',
        '${policyId}','2026-08-25T06:00:00Z','66000000-0000-4000-8000-000000000011','${requestTime}'
      ); commit;
    `);
    expect(run(`select status from public.user_account where id='${userId}';`)).toBe("PENDING");
    run(`begin; set local role youone_activation; ${context()}
      select app_private.create_pending_device_trust(
        '66000000-0000-4000-8000-000000000012','${authSubject}','${sessionId}','${evidenceId}','${"c".repeat(64)}',
        '${policyId}','2026-08-25T06:00:00Z','66000000-0000-4000-8000-000000000013','${requestTime}'); rollback;`, false);
    expect(run(`begin; set local role youone_activation; ${context("66000000-0000-4000-8000-000000000099")}
      select app_private.load_exact_device_trust(
        '${authSubject}','66000000-0000-4000-8000-000000000099','${evidenceId}','${deviceId}','${credentialHmac}','${requestTime}') is null; rollback;`
    ).split("\n").at(-1)).toBe("t");
  });

  it("activates DeviceTrust once and requires a separate assignment-bound account command", () => {
    run(`begin; set local role youone_activation; ${context()}
      select app_private.activate_pending_device_trust(
        '${authSubject}','${sessionId}','${evidenceId}','${deviceId}','${credentialHmac}',0,'${policyId}',
        '66000000-0000-4000-8000-000000000014','66000000-0000-4000-8000-000000000015','${requestTime}'); commit;`);
    expect(run(`select state||':'||version_no from public.device_trust where id='${deviceId}';`)).toBe("ACTIVE:1");
    expect(run(`select status from public.user_account where id='${userId}';`)).toBe("PENDING");

    run(`begin; set local role youone_activation; ${context()}
      select app_private.activate_pending_user_account(
        '${authSubject}','${sessionId}','${evidenceId}','${deviceId}','${credentialHmac}',0,
        '66000000-0000-4000-8000-000000000016','${requestTime}'); rollback;`, false);

    run(`insert into public.user_position_assignment(
      id,user_id,position_id,valid_from,is_primary,grant_reason_code
    ) values (
      '66000000-0000-4000-8000-000000000017','${userId}',
      '10000000-0000-4000-8000-000000000003','2026-08-25T04:00:00Z',true,'OD042_BOOTSTRAP'
    );
    begin; set local role youone_activation; ${context()}
      select app_private.activate_pending_user_account(
        '${authSubject}','${sessionId}','${evidenceId}','${deviceId}','${credentialHmac}',0,
        '66000000-0000-4000-8000-000000000018','${requestTime}'); commit;`);
    expect(run(`select status||':'||version_no from public.user_account where id='${userId}';`)).toBe("ACTIVE:1");
  });

  it("denies all direct table access to the activation capability", () => {
    run("begin; set local role youone_activation; select * from public.device_trust; rollback;", false);
    run("begin; set local role youone_activation; update public.user_account set status='ACTIVE'; rollback;", false);
  });
});

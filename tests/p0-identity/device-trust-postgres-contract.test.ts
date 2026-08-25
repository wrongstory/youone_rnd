import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(import.meta.dirname, "../../supabase/migrations");
const migrationName = readdirSync(migrationsDirectory)
  .find((name) => /^\d+_p0_device_trust_activation\.sql$/.test(name));
if (migrationName === undefined) throw new Error("DeviceTrust migration missing");
const migration = readFileSync(resolve(migrationsDirectory, migrationName), "utf8");
const adapter = readFileSync(resolve(
  import.meta.dirname,
  "../../packages/infrastructure/postgres/src/activation.ts"
), "utf8");
const pool = readFileSync(resolve(
  import.meta.dirname,
  "../../packages/infrastructure/postgres/src/node-activation-pool.ts"
), "utf8");

describe("P0 DeviceTrust PostgreSQL migration contract", () => {
  it("uses a dedicated non-login non-bypass activation capability", () => {
    expect(migration).toMatch(
      /create role youone_activation[\s\S]*nologin[\s\S]*noinherit[\s\S]*nobypassrls/i
    );
    expect(migration).toContain("unsafe or missing youone_activation attributes");
    expect(pool).toContain("login_can_set_only_activation_role");
    expect(pool).toContain("candidate.rolname not in (session_user, 'youone_activation')");
    expect(adapter).toContain('principal: "youone_activation"');
  });

  it("stores only an exact account/session HMAC binding and typed lifecycle fields", () => {
    expect(migration).toContain("create table public.device_trust (");
    expect(migration).toContain("user_account_id uuid not null references public.user_account(id)");
    expect(migration).toContain("provider_session_id uuid not null");
    expect(migration).toContain("device_credential_hmac_sha256 text not null");
    expect(migration).toContain("state text not null check (state in ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED'))");
    expect(migration).toContain("version_no bigint not null default 0");
    expect(migration).toContain("device_trust_live_session_unique");
    expect(migration).not.toMatch(/\b(?:raw_device_nonce|browser_fingerprint|access_token|refresh_token|totp_secret|cookie_value)\b/i);
  });

  it("has no current policy seed and cryptographically binds every effective policy value", () => {
    expect(migration).toContain("create table public.device_trust_policy_version");
    expect(migration).toContain("maximum_trust_seconds integer not null check (maximum_trust_seconds > 0)");
    expect(migration).toContain("YOUONE_DEVICE_TRUST_POLICY_V1");
    expect(migration).toContain("approval_snapshot_sha256 = app_private.device_trust_policy_sha256(policy.id)");
    expect(migration).not.toMatch(/insert\s+into\s+public\.device_trust_policy_version/i);
  });

  it("derives ActivationContext only from exact PENDING account, live TOTP AAL2 session and immutable evidence", () => {
    expect(migration).toContain("app_private.resolve_active_actor_context_snapshot");
    expect(migration).toContain("business_snapshot->>'accountStatus' <> 'PENDING'");
    expect(migration).toContain("from auth.sessions current_session");
    expect(migration).toContain("current_session.id = $1::uuid");
    expect(migration).toContain("current_session.user_id = $2::uuid");
    expect(migration).toContain("current_session.aal::text = 'aal2'");
    expect(migration).toContain("factor.factor_type::text = 'totp'");
    expect(migration).toContain("factor.status::text = 'verified'");
    expect(migration).toContain("create trigger identity_activation_evidence_immutable");
    expect(migration).toContain("identity_activation_evidence_revocation");
  });

  it("separates DeviceTrust activation from the explicit all-condition account activation command", () => {
    const deviceActivation = migration.slice(
      migration.indexOf("create or replace function app_private.activate_pending_device_trust"),
      migration.indexOf("create or replace function app_private.read_activation_readiness_facts")
    );
    expect(deviceActivation).not.toContain("update public.user_account");
    expect(migration).toContain("create or replace function app_private.activate_pending_user_account");
    expect(migration).toContain("trust->>'state' <> 'ACTIVE'");
    expect(migration).toContain("hasActiveRequiredAssignment");
    expect(migration).toContain("hasActiveVendorMembership");
    expect(migration).toContain("account.status = 'PENDING'");
    expect(migration).toContain("app_private.next_version(account.version_no, entry_expected_account_version)");
  });

  it("forces RLS and blocks direct internal and Data API table/RPC access", () => {
    expect(migration).toContain("alter table public.%I force row level security");
    expect(migration).toContain("from public, youone_request, youone_privileged_writer, youone_identity_resolver, youone_activation");
    expect(migration).toContain("array['anon', 'authenticated']");
    expect(migration).toContain("revoke execute on all functions in schema app_private from public");
    expect(migration).toMatch(
      /grant execute on function app_private\.resolve_activation_context_snapshot\(text,text,timestamptz\)[\s\S]*to youone_activation/i
    );
    expect(migration).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]{0,100}to\s+youone_activation/i);
  });
});

describe("P0 DeviceTrust Postgres adapter contract", () => {
  it("keeps readiness read-only and account activation an explicit write", () => {
    expect(adapter).toContain("public async readActivationReadiness(");
    expect(adapter).toContain("return readOnlyWithContext(this.pool, context");
    expect(adapter).toContain("public async activatePendingUser(");
    expect(adapter).toContain("return writeWithContext(this.pool, context");
  });

  it("sets the exact trusted actor/session context and never uses the request role", () => {
    expect(adapter).toContain("set local role youone_activation");
    expect(adapter).not.toContain("set local role youone_request");
    expect(adapter).toContain("set_config('app.actor_user_id', $1, true)");
    expect(adapter).toContain("set_config('app.effective_actor_user_id', $1, true)");
    expect(adapter).toContain("set_config('app.session_id', $4, true)");
    expect(adapter).toContain("set_config('app.assurance_level', 'AAL2', true)");
  });
});

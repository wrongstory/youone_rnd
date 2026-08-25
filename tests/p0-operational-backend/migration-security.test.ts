import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(import.meta.dirname, "../../supabase/migrations");
const migrationName = "20260824101551_b01_lock_down_data_api_functions.sql";
const migration = readFileSync(resolve(migrationsDirectory, migrationName), "utf8");
const allMigrations = readdirSync(migrationsDirectory)
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(resolve(migrationsDirectory, name), "utf8"))
  .join("\n");

describe("B01 hosted Supabase Data API function security contract", () => {
  it("removes existing and future function execution from PUBLIC and every available Data API role", () => {
    expect(migration).toMatch(
      /revoke\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+public\s+from\s+public/i
    );
    expect(migration).toMatch(
      /alter\s+default\s+privileges\s+for\s+role\s+postgres\s+in\s+schema\s+public[\s\S]*revoke\s+execute\s+on\s+functions\s+from\s+public/i
    );
    expect(migration).toContain("rolname = 'anon'");
    expect(migration).toContain("revoke execute on all functions in schema public from anon");
    expect(migration).toContain(
      "alter default privileges for role postgres in schema public revoke execute on functions from anon"
    );
    expect(migration).toContain("rolname = 'authenticated'");
    expect(migration).toContain("revoke execute on all functions in schema public from authenticated");
    expect(migration).toContain(
      "alter default privileges for role postgres in schema public revoke execute on functions from authenticated"
    );
  });

  it("fails the migration when a public SECURITY DEFINER RPC remains exposed", () => {
    expect(migration).toContain("function_record.prosecdef");
    expect(migration).toContain("pg_catalog.to_regrole('anon')");
    expect(migration).toContain("pg_catalog.to_regrole('authenticated')");
    expect(migration).toContain(
      "has_function_privilege(pg_catalog.to_regrole('anon'), function_record.oid, 'execute')"
    );
    expect(migration).toContain(
      "has_function_privilege(pg_catalog.to_regrole('authenticated'), function_record.oid, 'execute')"
    );
    expect(migration).toContain("if exposed_count <> 0 then");
    expect(migration).toContain("using errcode = '42501'");
  });

  it("pins every Advisor-reported helper to a non-user-controlled search path", () => {
    for (const signature of [
      "app_private.is_stable_code(text)",
      "app_private.is_opaque_key(text)",
      "app_private.is_sha256(text)",
      "app_private.payload_contains_forbidden_key(jsonb)",
      "app_private.next_version(bigint,bigint)"
    ]) {
      expect(migration).toContain(`alter function ${signature} set search_path = pg_catalog`);
    }
  });

  it("keeps every later migration from reopening public Data API RPC execution", () => {
    const orderedNames = readdirSync(migrationsDirectory)
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .sort();
    const lockdownIndex = orderedNames.indexOf(migrationName);
    const laterSql = orderedNames
      .slice(lockdownIndex + 1)
      .map((name) => readFileSync(resolve(migrationsDirectory, name), "utf8"))
      .join("\n");

    expect(lockdownIndex).toBeGreaterThanOrEqual(0);
    expect(laterSql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\./i);
    expect(allMigrations.lastIndexOf("revoke execute on all functions in schema public"))
      .toBeGreaterThan(allMigrations.lastIndexOf("grant execute on function public."));
  });
});

describe("B01 exact session revocation migration contract", () => {
  const confirmationName = "20260824115454_b01_auth_session_revocation_confirmation.sql";
  const confirmation = readFileSync(resolve(migrationsDirectory, confirmationName), "utf8");

  it("exposes exact presence only to the identity resolver", () => {
    expect(confirmation).toContain("create or replace function app_private.auth_session_exists");
    expect(confirmation).toContain("where id = $1::uuid and user_id = $2::uuid");
    expect(confirmation).toMatch(
      /revoke\s+all\s+on\s+function\s+app_private\.auth_session_exists\(text,text\)[\s\S]*from\s+public,\s*youone_request,\s*youone_privileged_writer/i
    );
    expect(confirmation).toContain(
      "revoke all on function app_private.auth_session_exists(text,text) from anon"
    );
    expect(confirmation).toContain(
      "revoke all on function app_private.auth_session_exists(text,text) from authenticated"
    );
    expect(confirmation).toMatch(
      /grant\s+execute\s+on\s+function\s+app_private\.auth_session_exists\(text,text\)[\s\S]*to\s+youone_identity_resolver/i
    );
  });

  it("binds reconciliation to the trusted actor/session and approved retry cadence", () => {
    expect(confirmation).toContain("auth_session_revocation_reconciliation_binding");
    expect(confirmation).toContain("new.payload->>'retryAttempts' <> '3'");
    expect(confirmation).toContain("new.payload->>'reconciliationIntervalMinutes' <> '15'");
    expect(confirmation).toContain("new.available_at <> new.occurred_at + interval '15 minutes'");
    expect(confirmation).toContain("payload_session is distinct from app_private.required_setting('app.session_id')");
    expect(confirmation).toContain("account.id = new.actor_user_id");
    expect(confirmation).toContain("account.auth_subject = payload_subject");
  });

  it("registers a typed audit/outbox contract without credential fields", () => {
    expect(confirmation).toContain("AUTH_SESSION_REVOCATION_RECONCILIATION_REQUESTED");
    expect(confirmation).toContain("AUTH_SESSION_REVOCATION_RECONCILIATION_V1");
    expect(confirmation).not.toMatch(/['"](?:accessToken|refreshToken|password|cookie|authorization)['"]/i);
  });
});

describe("B01 distributed Auth rate-limit and audit migration contract", () => {
  const rateLimitName = "20260824154415_b01_auth_rate_limit_audit.sql";
  const rateLimit = readFileSync(resolve(migrationsDirectory, rateLimitName), "utf8");

  it("requires an immutable approved policy and exact six-action rule set without seeding defaults", () => {
    expect(rateLimit).toContain("create table public.auth_rate_limit_policy_version");
    expect(rateLimit).toContain("approval_snapshot_sha256");
    expect(rateLimit).toContain("create table public.auth_rate_limit_policy_approval");
    expect(rateLimit).toContain("security_owner_action_id uuid not null unique references public.approval_action(id)");
    expect(rateLimit).toContain("lab_director_action_id uuid not null unique references public.approval_action(id)");
    expect(rateLimit).toContain("auth_rate_limit_policy_version_immutable");
    expect(rateLimit).toContain("auth_rate_limit_policy_rule_immutable");
    expect(rateLimit).toContain("auth_rate_limit_policy_approval_immutable");
    expect(rateLimit).toContain("select count(*) from public.auth_rate_limit_policy_rule");
    expect(rateLimit).toContain(") <> 6 then");
    expect(rateLimit).toContain("YOUONE_AUTH_RATE_LIMIT_POLICY_V1");
    expect(rateLimit).toContain("policy.approval_snapshot_sha256 = app_private.auth_rate_limit_policy_sha256(policy.id)");
    expect(rateLimit).toContain("security_role.stable_code = 'ADMIN_SECURITY'");
    expect(rateLimit).toContain("director_position.stable_code = 'POSITION_LAB_DIRECTOR'");
    expect(rateLimit).toContain("security_action.effective_actor_user_id <> director_action.effective_actor_user_id");
    expect(rateLimit).not.toMatch(/insert\s+into\s+public\.auth_rate_limit_policy_version/i);
  });

  it("binds counters to trusted anonymous HMAC fingerprints and current effective policy", () => {
    expect(rateLimit).toContain("app_private.required_setting('app.actor_kind') <> 'ANONYMOUS'");
    expect(rateLimit).toContain("app.anonymous_subject_fingerprint");
    expect(rateLimit).toContain("policy.effective_at = (");
    expect(rateLimit).toContain("select max(candidate.effective_at)");
    expect(rateLimit).toContain("scope_kind in ('GLOBAL', 'SUBJECT')");
    expect(rateLimit).toContain("on conflict (scope_kind, scope_fingerprint, action_id) do update");
  });

  it("keeps policy and counters out of Data API roles and exposes only the request capability", () => {
    expect(rateLimit).toContain("alter table public.auth_rate_limit_bucket force row level security");
    expect(rateLimit).toContain("alter table public.auth_rate_limit_policy_approval force row level security");
    expect(rateLimit).toContain("revoke all on public.auth_rate_limit_bucket from public, youone_request");
    expect(rateLimit).toContain("revoke all on public.auth_rate_limit_bucket from anon");
    expect(rateLimit).toContain("revoke all on public.auth_rate_limit_bucket from authenticated");
    expect(rateLimit).toMatch(
      /grant\s+execute\s+on\s+function\s+app_private\.consume_auth_rate_limit\(text,text,text,text,timestamptz\)[\s\S]*to\s+youone_request/i
    );
  });

  it("binds consume and result audit evidence to one exact approved policy version", () => {
    expect(rateLimit).toContain("returns table(allowed boolean, policy_version_id uuid, retry_after_seconds integer)");
    expect(rateLimit).toContain("create or replace function app_private.append_auth_rate_limit_outcome");
    expect(rateLimit).toContain("consumed.reason_record_ref = entry_policy_version_id");
    expect(rateLimit).toContain("consumed.action_id = entry_action_id || '.rate_limit.consume'");
    expect(rateLimit).toMatch(
      /grant\s+execute\s+on\s+function\s+app_private\.append_auth_rate_limit_outcome\(uuid,uuid,text,uuid,text,text,timestamptz\)[\s\S]*to\s+youone_request/i
    );
  });

  it("contains no raw credential-bearing persistence fields", () => {
    expect(rateLimit).not.toMatch(/\b(?:email|identifier|password|access_token|refresh_token|cookie|authorization|network_address)\b/i);
  });
});

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
  it("removes existing and future function execution from every Data API role", () => {
    expect(migration).toMatch(
      /revoke\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+public\s+from\s+public,\s*anon,\s*authenticated/i
    );
    expect(migration).toMatch(
      /alter\s+default\s+privileges\s+for\s+role\s+postgres\s+in\s+schema\s+public[\s\S]*revoke\s+execute\s+on\s+functions\s+from\s+public,\s*anon,\s*authenticated/i
    );
  });

  it("fails the migration when a public SECURITY DEFINER RPC remains exposed", () => {
    expect(migration).toContain("function_record.prosecdef");
    expect(migration).toContain("has_function_privilege('anon', function_record.oid, 'execute')");
    expect(migration).toContain("has_function_privilege('authenticated', function_record.oid, 'execute')");
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
      /revoke\s+all\s+on\s+function\s+app_private\.auth_session_exists\(text,text\)[\s\S]*from\s+public,\s*anon,\s*authenticated,\s*youone_request,\s*youone_privileged_writer/i
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

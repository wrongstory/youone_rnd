import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(import.meta.dirname, "../../supabase/migrations");
const migrations = readdirSync(migrationsDirectory)
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort()
  .map((name) => ({ name, sql: readFileSync(resolve(migrationsDirectory, name), "utf8") }));
const combined = migrations.map(({ sql }) => sql).join("\n");
const registryForwardFix = migrations.find(({ name }) => name === "20260823001500_m16_force_registry_rls.sql")?.sql ?? "";
const stableRegistries = [
  "aggregate_type_definition",
  "action_definition",
  "domain_event_definition",
  "state_machine_definition",
  "state_definition",
  "transition_definition"
] as const;

describe("M16 PostgreSQL security and recovery contract", () => {
  it("keeps request, worker, and identity resolver principals non-bypass and separate", () => {
    expect(combined).toMatch(/create role youone_request[\s\S]*nobypassrls/i);
    expect(combined).toMatch(/create role youone_privileged_writer[\s\S]*nobypassrls/i);
    expect(combined).toMatch(/create role youone_identity_resolver[\s\S]*nobypassrls/i);
    expect(combined).toContain("revoke all on all tables in schema public from youone_request, youone_privileged_writer");
  });

  it("closes table-owner RLS bypass on every stable definition registry", () => {
    expect(registryForwardFix).not.toBe("");
    for (const table of stableRegistries) expect(registryForwardFix).toContain(`'${table}'`);
    expect(registryForwardFix).toContain("force row level security");
    expect(registryForwardFix).toContain("from public, youone_request, youone_privileged_writer, youone_identity_resolver");
    expect(registryForwardFix).not.toMatch(/grant\s+(insert|update|delete|truncate|all)/i);
  });

  it("keeps audit, transition, outbox, and M15 conflict evidence append-only", () => {
    for (const trigger of [
      "audit_log_append_only",
      "state_transition_append_only",
      "outbox_event_immutable",
      "offline_command_immutable",
      "offline_command_result_immutable",
      "sync_conflict_immutable",
      "sync_conflict_resolution_immutable"
    ]) expect(combined).toContain(trigger);
  });

  it("binds live offline replay to active owner and exact current session", () => {
    const m15 = migrations.find(({ name }) => name.includes("m15_pwa_offline_sync"))?.sql ?? "";
    expect(m15).toContain("app_private.actor_is_active(trusted_time)");
    expect(m15).toContain("target_authenticated_actor<>app_private.current_actor_user_id()");
    expect(m15).toContain("target_effective_actor<>app_private.current_effective_actor_user_id()");
    expect(m15).toContain("app_private.required_setting('app.session_id')");
    expect(m15).toContain("offline_command_owner_read");
    expect(m15).toContain("sync_conflict_owner_read");
  });

  it("has a strictly ordered full migration chain for clean and upgrade rehearsals", () => {
    expect(migrations.length).toBeGreaterThanOrEqual(14);
    expect(migrations[0]?.name).toBe("20260821000100_m02_database_audit_kernel.sql");
    expect(migrations.some(({ name }) => name === "20260823001400_m15_pwa_offline_sync.sql")).toBe(true);
    expect(new Set(migrations.map(({ name }) => name.slice(0, 14))).size).toBe(migrations.length);
  });
});

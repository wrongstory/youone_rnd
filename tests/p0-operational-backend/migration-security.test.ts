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

  it("keeps the lockdown as the migration head so later grants cannot bypass it", () => {
    const orderedNames = readdirSync(migrationsDirectory)
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .sort();

    expect(orderedNames.at(-1)).toBe(migrationName);
    expect(allMigrations.lastIndexOf("revoke execute on all functions in schema public"))
      .toBeGreaterThan(allMigrations.lastIndexOf("grant execute on function public."));
  });
});

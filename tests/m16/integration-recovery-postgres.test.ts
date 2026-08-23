import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRecoveryManifest, verifyRestore } from "../../apps/worker/src/composition/recovery-manifest.js";

const sourceUrl = process.env.M16_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const pgDump = process.env.PG_DUMP_BIN ?? "pg_dump";
const pgRestore = process.env.PG_RESTORE_BIN ?? "pg_restore";
const databaseDescribe = sourceUrl === undefined ? describe.skip : describe;
const migrationDirectory = resolve(import.meta.dirname, "../../supabase/migrations");
const migrationNames = readdirSync(migrationDirectory)
  .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
const migrations = migrationNames.map((name) => readFileSync(join(migrationDirectory, name), "utf8")).join("\n");
const migrationHead = migrationNames.at(-1);

let restoreUrl: string | undefined;
let restoreDatabaseName: string | undefined;
let temporaryDirectory: string | undefined;

function execute(binary: string, args: readonly string[], input?: string): string {
  const result = spawnSync(binary, args, { input, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function sql(databaseUrl: string, statement: string): string {
  return execute(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl], statement);
}

databaseDescribe.sequential("M16 clean migration and recovery drill", () => {
  beforeAll(() => {
    if (sourceUrl === undefined || migrationHead === undefined) return;
    const parsed = new URL(sourceUrl);
    if (!/m16.*test|test.*m16/i.test(parsed.pathname)) throw new Error("dedicated M16 test database required");
    expect(sql(sourceUrl, "select count(*) from information_schema.tables where table_schema='public';")).toBe("0");

    // A full rollback proves every migration can run from a clean database as one ordered set.
    sql(sourceUrl, `begin;${migrations}rollback;`);
    // The committed fixture represents a pre-existing customer object and must survive the upgrade.
    sql(sourceUrl, "create table public.m16_upgrade_fixture(id integer primary key, evidence text not null); insert into public.m16_upgrade_fixture values (1, 'preserve-on-upgrade');");
    sql(sourceUrl, migrations);
    expect(sql(sourceUrl, "select evidence from public.m16_upgrade_fixture where id=1;")).toBe("preserve-on-upgrade");
  }, 120_000);

  afterAll(() => {
    if (sourceUrl !== undefined && restoreDatabaseName !== undefined) {
      const maintenance = new URL(sourceUrl);
      maintenance.pathname = "/postgres";
      sql(maintenance.toString(), `drop database if exists "${restoreDatabaseName}" with (force);`);
    }
    if (temporaryDirectory !== undefined && existsSync(temporaryDirectory)) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("dumps, hashes, restores and verifies the complete PostgreSQL schema", () => {
    if (sourceUrl === undefined || migrationHead === undefined) throw new Error("M16_TEST_DATABASE_URL required");
    temporaryDirectory = mkdtempSync(join(tmpdir(), "youone-m16-recovery-"));
    const dumpFile = join(temporaryDirectory, "database.backup");
    execute(pgDump, ["--format=custom", "--no-owner", "--no-acl", "--file", dumpFile, "--dbname", sourceUrl]);
    const dumpBytes = readFileSync(dumpFile);
    const dumpHash = createHash("sha256").update(dumpBytes).digest("hex");
    const manifest = createRecoveryManifest({
      manifestVersion: 1,
      migrationHead,
      database: { sizeBytes: statSync(dumpFile).size, sha256: dumpHash },
      storage: [],
      storageObjectCount: 0,
      completedAt: new Date().toISOString()
    });

    const source = new URL(sourceUrl);
    const sourceDatabaseName = source.pathname.slice(1);
    restoreDatabaseName = `${sourceDatabaseName}_restore`;
    if (!/^[a-zA-Z0-9_]+$/.test(restoreDatabaseName)) throw new Error("unsafe restore database identifier");
    const maintenance = new URL(sourceUrl);
    maintenance.pathname = "/postgres";
    sql(maintenance.toString(), `drop database if exists "${restoreDatabaseName}" with (force);`);
    sql(maintenance.toString(), `create database "${restoreDatabaseName}";`);
    const restored = new URL(sourceUrl);
    restored.pathname = `/${restoreDatabaseName}`;
    restoreUrl = restored.toString();
    execute(pgRestore, ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", restoreUrl, dumpFile]);

    expect(sql(restoreUrl, "select evidence from public.m16_upgrade_fixture where id=1;")).toBe("preserve-on-upgrade");
    const tableCount = "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';";
    expect(sql(restoreUrl, tableCount)).toBe(sql(sourceUrl, tableCount));
    const rlsCount = "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity;";
    expect(sql(restoreUrl, rlsCount)).toBe(sql(sourceUrl, rlsCount));
    expect(() => verifyRestore(manifest, {
      migrationHead,
      databaseSha256: createHash("sha256").update(readFileSync(dumpFile)).digest("hex"),
      storage: []
    })).not.toThrow();
  }, 120_000);
});

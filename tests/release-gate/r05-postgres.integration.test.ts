import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createNodePostgresWorkerPool, type NodePostgresWorkerPool } from "../../packages/infrastructure/postgres/src/node-worker-pool.js";

const adminUrl = process.env.R05_TEST_DATABASE_URL;
const databaseDescribe = adminUrl === undefined ? describe.skip : describe;
const psql = process.env.PSQL_BIN ?? "psql";
const migrationsDirectory = resolve(import.meta.dirname, "../../supabase/migrations");
const migrations = readdirSync(migrationsDirectory)
  .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(join(migrationsDirectory, name), "utf8"))
  .join("\n");

let workerUrl: string | undefined;
let pool: NodePostgresWorkerPool | undefined;

function sql(connectionString: string, statement: string): string {
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", connectionString], {
    input: statement,
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`);
  return result.stdout.trim();
}

databaseDescribe.sequential("R05 Worker PostgreSQL readiness", () => {
  beforeAll(() => {
    if (!adminUrl) return;
    const parsed = new URL(adminUrl);
    if (!/r05.*test|test.*r05/i.test(parsed.pathname)) throw new Error("dedicated R05 test database required");
    sql(adminUrl, migrations);
    sql(adminUrl, `
      create role youone_r05_worker_login login password 'worker-test'
        noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      grant youone_privileged_writer to youone_r05_worker_login;
    `);
    parsed.username = "youone_r05_worker_login";
    parsed.password = "worker-test";
    workerUrl = parsed.toString();
  }, 120_000);

  afterAll(async () => {
    await pool?.close();
    if (adminUrl) sql(adminUrl, "drop role if exists youone_r05_worker_login;");
  });

  it("accepts only the dedicated noinherit Worker login and exact capability", async () => {
    if (!workerUrl) throw new Error("R05_TEST_DATABASE_URL required");
    pool = createNodePostgresWorkerPool({ connectionString: workerUrl, tls: "disable", max: 1 });
    await expect(pool.probe()).resolves.toEqual({ principal: "youone_privileged_writer", ready: true, rowSecurity: true });
  });

  it("rejects the same login after an overprivileged inheritance change", async () => {
    if (!adminUrl || !workerUrl) throw new Error("R05_TEST_DATABASE_URL required");
    await pool?.close();
    pool = undefined;
    sql(adminUrl, "alter role youone_r05_worker_login inherit;");
    const unsafe = createNodePostgresWorkerPool({ connectionString: workerUrl, tls: "disable", max: 1 });
    await expect(unsafe.probe()).rejects.toMatchObject({ reasonCode: "WORKER_DATABASE_PRINCIPAL_INVALID" });
    await unsafe.close();
    sql(adminUrl, "alter role youone_r05_worker_login noinherit;");
  });
});

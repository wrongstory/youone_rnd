import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import {
  IdentityResolverDatabaseBoundaryError,
  PostgresActorContextSource,
  createNodePostgresIdentityResolverPool
} from "../../packages/infrastructure/postgres/src/identity-resolver.js";
import { utcInstant } from "../../packages/shared-kernel/src/public.js";

const adminDatabaseUrl = process.env.R02_ADMIN_DATABASE_URL;
const resolverDatabaseUrl = process.env.R02_IDENTITY_RESOLVER_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const databaseDescribe = adminDatabaseUrl && resolverDatabaseUrl ? describe : describe.skip;
const migrationDirectory = resolve(import.meta.dirname, "../../supabase/migrations");
const migrationSql = readdirSync(migrationDirectory)
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(resolve(migrationDirectory, name), "utf8"))
  .join("\n");

const authSubject = "18000000-0000-4000-8000-000000000001";
const sessionId = "18000000-0000-4000-8000-000000000002";
const otherSubject = "18000000-0000-4000-8000-000000000003";
const requestTime = utcInstant("2026-08-23T12:00:00.000Z");

function runAdmin(sql: string): string {
  if (!adminDatabaseUrl) throw new Error("R02_ADMIN_DATABASE_URL required");
  const result = spawnSync(
    psql,
    ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", adminDatabaseUrl],
    { input: sql, encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(`R02 PostgreSQL setup failed: ${result.stderr}`);
  return result.stdout.trim();
}

function overprivilegedResolverUrl(): string {
  if (!resolverDatabaseUrl) throw new Error("R02_IDENTITY_RESOLVER_DATABASE_URL required");
  const url = new URL(resolverDatabaseUrl);
  url.username = "youone_identity_overprivileged_login";
  url.password = "overprivileged-test";
  return url.toString();
}

databaseDescribe.sequential("R02 active Supabase session identity boundary", () => {
  beforeAll(() => {
    if (!adminDatabaseUrl) return;
    if (!/test/i.test(new URL(adminDatabaseUrl).pathname)) throw new Error("R02 database name must contain test");
    runAdmin(migrationSql);
    runAdmin(`
      create schema auth;
      create table auth.sessions(id uuid primary key, user_id uuid not null);
      create role youone_identity_resolver_login login password 'resolver-test'
        nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
      grant youone_identity_resolver to youone_identity_resolver_login;
      create role r02_forbidden_bypass nologin nosuperuser nocreatedb nocreaterole
        noinherit noreplication bypassrls;
      create role youone_identity_overprivileged_login login password 'overprivileged-test'
        nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
      grant youone_identity_resolver, r02_forbidden_bypass to youone_identity_overprivileged_login;
      insert into public.user_account(id, auth_subject, account_kind, status, valid_from)
      values ('${authSubject}', '${authSubject}', 'INTERNAL', 'ACTIVE', '2026-01-01');
      insert into auth.sessions(id, user_id) values ('${sessionId}', '${authSubject}');
    `);
  }, 60_000);

  it("loads identity only for the exact active provider session and subject", async () => {
    if (!resolverDatabaseUrl) return;
    const pool = createNodePostgresIdentityResolverPool({
      connectionString: resolverDatabaseUrl,
      max: 1,
      tls: "disable"
    });
    const source = new PostgresActorContextSource(pool);

    await expect(source.load(authSubject, sessionId, requestTime)).resolves.toMatchObject({
      identity: { authSubject, userId: authSubject }
    });
    await expect(source.load(otherSubject, sessionId, requestTime)).resolves.toBeNull();

    runAdmin(`delete from auth.sessions where id = '${sessionId}'`);
    await expect(source.load(authSubject, sessionId, requestTime)).resolves.toBeNull();
    await pool.close();
  });

  it("rejects a resolver LOGIN that can SET ROLE to an additional privileged role", async () => {
    const pool = createNodePostgresIdentityResolverPool({
      connectionString: overprivilegedResolverUrl(),
      max: 1,
      tls: "disable"
    });
    await expect(pool.probe()).rejects.toBeInstanceOf(IdentityResolverDatabaseBoundaryError);
    await pool.close();
  });
});

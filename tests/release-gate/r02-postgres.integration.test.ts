import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

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
const factorId = "18000000-0000-4000-8000-000000000004";
const newerSessionId = "18000000-0000-4000-8000-000000000005";
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

function resetProviderSession(): void {
  runAdmin(`
    truncate auth.sessions, auth.mfa_factors;
    insert into auth.mfa_factors(id, user_id, factor_type, status)
    values ('${factorId}', '${authSubject}', 'totp', 'verified');
    insert into auth.sessions(
      id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at
    ) values (
      '${sessionId}', '${authSubject}', '2026-08-23T11:00:00Z', '2026-08-23T11:45:00Z',
      '${factorId}', 'aal2', null, timestamp '2026-08-23 11:45:00'
    );
  `);
}

databaseDescribe.sequential("R02 active Supabase session identity boundary", () => {
  beforeAll(() => {
    if (!adminDatabaseUrl) return;
    if (!/test/i.test(new URL(adminDatabaseUrl).pathname)) throw new Error("R02 database name must contain test");
    runAdmin(migrationSql);
    runAdmin(`
      create schema auth;
      create table auth.mfa_factors(
        id uuid primary key,
        user_id uuid not null,
        factor_type text not null,
        status text not null
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
    `);
  }, 60_000);

  beforeEach(() => {
    if (!adminDatabaseUrl) return;
    resetProviderSession();
  });

  it("loads identity only for the exact active TOTP AAL2 provider session and subject", async () => {
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

  it.each([
    ["absolute lifetime", `update auth.sessions set created_at='2026-08-23T03:59:59Z', refreshed_at=timestamp '2026-08-23 11:45:00' where id='${sessionId}'`],
    ["refresh inactivity", `update auth.sessions set refreshed_at=timestamp '2026-08-23 10:59:59' where id='${sessionId}'`],
    ["provider not_after", `update auth.sessions set not_after='2026-08-23T11:59:59Z' where id='${sessionId}'`],
    ["AAL1", `update auth.sessions set aal='aal1' where id='${sessionId}'`],
    ["non-TOTP factor", `update auth.mfa_factors set factor_type='phone' where id='${factorId}'`]
  ] as const)("rejects a session violating OD-019 %s", async (_label, mutation) => {
    if (!resolverDatabaseUrl) return;
    runAdmin(mutation);
    const pool = createNodePostgresIdentityResolverPool({ connectionString: resolverDatabaseUrl, max: 1, tls: "disable" });
    const source = new PostgresActorContextSource(pool);
    await expect(source.load(authSubject, sessionId, requestTime)).resolves.toBeNull();
    await pool.close();
  });

  it("rejects an older session when a newer sign-in exists for the same user", async () => {
    if (!resolverDatabaseUrl) return;
    runAdmin(`
      insert into auth.sessions(id,user_id,created_at,updated_at,aal)
      values ('${newerSessionId}','${authSubject}','2026-08-23T11:30:00Z','2026-08-23T11:30:00Z','aal1');
    `);
    const pool = createNodePostgresIdentityResolverPool({ connectionString: resolverDatabaseUrl, max: 1, tls: "disable" });
    const source = new PostgresActorContextSource(pool);
    await expect(source.load(authSubject, sessionId, requestTime)).resolves.toBeNull();
    await pool.close();
  });

  it("uses created_at as inactivity baseline before the first refresh", async () => {
    if (!resolverDatabaseUrl) return;
    runAdmin(`update auth.sessions set created_at='2026-08-23T11:30:00Z', refreshed_at=null where id='${sessionId}'`);
    const pool = createNodePostgresIdentityResolverPool({ connectionString: resolverDatabaseUrl, max: 1, tls: "disable" });
    const source = new PostgresActorContextSource(pool);
    await expect(source.load(authSubject, sessionId, requestTime)).resolves.toMatchObject({ identity: { userId: authSubject } });
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

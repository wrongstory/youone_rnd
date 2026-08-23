import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { TrustedActorContextFactory, type ActorContextSource } from "../../packages/core/authorization/src/public.js";
import type { IdentitySnapshot } from "../../packages/core/identity/src/public.js";
import {
  createNodePostgresRequestPool,
  createTrustedRequestUnitOfWork
} from "../../packages/infrastructure/postgres/src/request.js";
import { correlationId, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const adminDatabaseUrl = process.env.R01_ADMIN_DATABASE_URL;
const requestDatabaseUrl = process.env.R01_REQUEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const databaseDescribe = adminDatabaseUrl && requestDatabaseUrl ? describe : describe.skip;
const migrationDirectory = resolve(import.meta.dirname, "../../supabase/migrations");
const migrationSql = readdirSync(migrationDirectory)
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(resolve(migrationDirectory, name), "utf8"))
  .join("\n");

const actorId = uuid("17000000-0000-4000-8000-000000000001");
const requestTime = utcInstant("2026-08-23T12:00:00.000Z");

function overprivilegedDatabaseUrl(): string {
  if (!requestDatabaseUrl) throw new Error("R01_REQUEST_DATABASE_URL required");
  const url = new URL(requestDatabaseUrl);
  url.username = "youone_request_overprivileged_login";
  url.password = "overprivileged-test";
  return url.toString();
}

function runAdmin(sql: string): string {
  if (!adminDatabaseUrl) throw new Error("R01_ADMIN_DATABASE_URL required");
  const result = spawnSync(
    psql,
    ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", adminDatabaseUrl],
    { input: sql, encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(`R01 PostgreSQL setup failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function trustedActor() {
  const identity: IdentitySnapshot = {
    userId: actorId,
    authSubject: "r01-internal",
    accountKind: "INTERNAL",
    accountStatus: "ACTIVE",
    accountValidFrom: utcInstant("2026-01-01T00:00:00.000Z"),
    accountVersion: version(1),
    organizations: [],
    departments: [],
    positions: [],
    roles: [],
    permissions: [],
    vendorMemberships: [],
    actingAuthorities: [],
    evidenceIds: []
  };
  const source: ActorContextSource = {
    load: async () => ({ identity, scopeGrants: [], securityEntitlements: [] })
  };
  return new TrustedActorContextFactory(
    {
      verify: async () => ({
        authSubject: identity.authSubject,
        sessionId: "r01-session",
        assuranceLevel: "AAL2",
        expiresAt: utcInstant("2026-08-23T13:00:00.000Z")
      })
    },
    source,
    { now: () => requestTime }
  ).create("opaque-session", correlationId("request:r01-runtime"));
}

databaseDescribe.sequential("R01 real PostgreSQL request runtime", () => {
  beforeAll(() => {
    if (!adminDatabaseUrl || !requestDatabaseUrl) return;
    if (!/test/i.test(new URL(adminDatabaseUrl).pathname)) throw new Error("R01 database name must contain test");
    runAdmin(migrationSql);
    runAdmin(`
      create role youone_request_login login password 'request-test'
        nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
      grant youone_request to youone_request_login;
      create role r01_forbidden_bypass nologin nosuperuser nocreatedb nocreaterole
        noinherit noreplication bypassrls;
      create role youone_request_overprivileged_login login password 'overprivileged-test'
        nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
      grant youone_request, r01_forbidden_bypass to youone_request_overprivileged_login;
      insert into public.user_account(id, auth_subject, account_kind, status, valid_from)
      values ('${actorId}', 'r01-internal', 'INTERNAL', 'ACTIVE', '2026-01-01');
    `);
  }, 60_000);

  it("uses SET LOCAL request role and clears actor context after commit and rollback", async () => {
    if (!requestDatabaseUrl) return;
    const pool = createNodePostgresRequestPool({
      connectionString: requestDatabaseUrl,
      max: 1,
      tls: "disable"
    });
    const unitOfWork = createTrustedRequestUnitOfWork(pool);
    const actor = await trustedActor();

    await expect(unitOfWork.execute(actor, async (transaction) => {
      const result = await transaction.query<{
        actor_user_id: string;
        actor_rows: string;
        current_user: string;
        row_security: string;
      }>(`select current_setting('app.actor_user_id') as actor_user_id,
          current_user, current_setting('row_security') as row_security,
          (select count(*)::text from public.user_account) as actor_rows`);
      return result.rows[0];
    })).resolves.toEqual({
      actor_rows: "1",
      actor_user_id: actorId,
      current_user: "youone_request",
      row_security: "on"
    });
    await expect(pool.probe()).resolves.toMatchObject({ ready: true });

    await expect(unitOfWork.execute(actor, async () => {
      throw new Error("force rollback");
    })).rejects.toThrow("force rollback");
    await expect(pool.probe()).resolves.toMatchObject({ ready: true });
    await pool.close();
  });

  it("rejects the superuser connection even when it can SET ROLE", async () => {
    if (!adminDatabaseUrl) return;
    const unsafePool = createNodePostgresRequestPool({
      connectionString: adminDatabaseUrl,
      max: 1,
      tls: "disable"
    });
    await expect(unsafePool.probe()).rejects.toMatchObject({
      reasonCode: "REQUEST_DATABASE_PRINCIPAL_INVALID"
    });
    await unsafePool.close();
  });

  it("rejects a login that can SET ROLE beyond youone_request", async () => {
    const unsafePool = createNodePostgresRequestPool({
      connectionString: overprivilegedDatabaseUrl(),
      max: 1,
      tls: "disable"
    });
    await expect(unsafePool.probe()).rejects.toMatchObject({
      reasonCode: "REQUEST_DATABASE_PRINCIPAL_INVALID"
    });
    await unsafePool.close();
  });
});

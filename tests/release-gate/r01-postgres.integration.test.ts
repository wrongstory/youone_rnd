import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { TrustedActorContextFactory, type ActorContextSource } from "../../packages/core/authorization/src/public.js";
import type { IdentitySnapshot } from "../../packages/core/identity/src/public.js";
import {
  PostgresOperationalAuthAbusePrevention,
  createNodePostgresRequestPool,
  createTrustedRequestUnitOfWork
} from "../../packages/infrastructure/postgres/src/request.js";
import { correlationId, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

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
      insert into public.auth_rate_limit_policy_version(
        id, policy_version, approval_snapshot_sha256, created_at, approved_at, effective_at, approved_by_user_id
      ) values (
        '17000000-0000-4000-8000-000000000090', 'AUTH_RATE_LIMIT_R01_TEST_V1', '${"9".repeat(64)}',
        '2026-08-23T10:00:00Z', '2026-08-23T10:01:00Z', '2026-08-23T10:02:00Z', '${actorId}'
      );
      insert into public.auth_rate_limit_policy_rule(
        policy_version_id, action_id, window_seconds, subject_max_attempts, global_max_attempts
      ) values
        ('17000000-0000-4000-8000-000000000090','auth.login',60,2,3),
        ('17000000-0000-4000-8000-000000000090','auth.logout',60,2,3),
        ('17000000-0000-4000-8000-000000000090','auth.mfa.enroll',60,2,3),
        ('17000000-0000-4000-8000-000000000090','auth.mfa.verify',60,2,3),
        ('17000000-0000-4000-8000-000000000090','auth.recovery',60,2,3),
        ('17000000-0000-4000-8000-000000000090','auth.refresh',60,2,3);
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

  it("atomically enforces approved subject/global Auth limits and appends anonymous audit evidence", async () => {
    if (!requestDatabaseUrl) return;
    const pool = createNodePostgresRequestPool({ connectionString: requestDatabaseUrl, max: 2, tls: "disable" });
    const prevention = new PostgresOperationalAuthAbusePrevention(pool);
    const subject = sha256("1".repeat(64));
    const otherSubject = sha256("2".repeat(64));
    const globalFingerprint = sha256("3".repeat(64));
    const attempt = (sequence: number, subjectFingerprint = subject) => Object.freeze({
      action: "LOGIN" as const,
      attemptId: uuid(`17000000-0000-4000-8000-${String(100 + sequence).padStart(12, "0")}`),
      correlationId: correlationId(`request:r01-rate-limit:${sequence}`),
      globalFingerprint,
      occurredAt: utcInstant(`2026-08-23T12:00:0${sequence}.000Z`),
      policyVersion: stableCode("AUTH_RATE_LIMIT_R01_TEST_V1"),
      rateLimitAuditId: uuid(`17000000-0000-4000-8000-${String(200 + sequence).padStart(12, "0")}`),
      subjectFingerprint
    });

    await expect(prevention.consume(attempt(1))).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    await expect(prevention.consume(attempt(2))).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    await expect(prevention.consume(attempt(3))).resolves.toMatchObject({ allowed: false });
    await expect(prevention.consume(attempt(4, otherSubject))).resolves.toMatchObject({ allowed: false });
    await prevention.recordOutcome(attempt(1), {
      auditId: uuid("17000000-0000-4000-8000-000000000301"),
      reasonCode: stableCode("AUTH_REQUEST_COMPLETED"),
      result: "SUCCEEDED"
    });

    expect(runAdmin("select count(*) from public.audit_log where resource_type='AUTH_SECURITY_ATTEMPT';")).toBe("5");
    expect(runAdmin("select count(*) from public.auth_rate_limit_bucket;")).toBe("3");
    expect(runAdmin("select count(*) from public.audit_log where anonymous_subject_fingerprint is null and resource_type='AUTH_SECURITY_ATTEMPT';")).toBe("0");
    await pool.close();
  });

  it("fails closed for an unapproved or stale Auth rate-limit policy version", async () => {
    if (!requestDatabaseUrl) return;
    const pool = createNodePostgresRequestPool({ connectionString: requestDatabaseUrl, max: 1, tls: "disable" });
    const prevention = new PostgresOperationalAuthAbusePrevention(pool);
    await expect(prevention.consume(Object.freeze({
      action: "LOGIN",
      attemptId: uuid("17000000-0000-4000-8000-000000000401"),
      correlationId: correlationId("request:r01-rate-limit:missing-policy"),
      globalFingerprint: sha256("4".repeat(64)),
      occurredAt: utcInstant("2026-08-23T12:01:00.000Z"),
      policyVersion: stableCode("AUTH_RATE_LIMIT_NOT_APPROVED"),
      rateLimitAuditId: uuid("17000000-0000-4000-8000-000000000402"),
      subjectFingerprint: sha256("5".repeat(64))
    }))).rejects.toThrow();
    await pool.close();
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

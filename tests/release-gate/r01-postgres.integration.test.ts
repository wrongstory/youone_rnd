import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const directorId = uuid("17000000-0000-4000-8000-000000000002");
const ratePolicyId = uuid("17000000-0000-4000-8000-000000000090");
const ratePolicyVersion = "AUTH_RATE_LIMIT_R01_TEST_V1";
const ratePolicySha256 = createHash("sha256").update([
  "YOUONE_AUTH_RATE_LIMIT_POLICY_V1",
  ratePolicyVersion,
  "auth.login|60|2|3",
  "auth.logout|60|2|3",
  "auth.mfa.enroll|60|2|3",
  "auth.mfa.verify|60|2|3",
  "auth.recovery|60|2|3",
  "auth.refresh|60|2|3"
].join("\n"), "utf8").digest("hex");
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
      values
        ('${actorId}', 'r01-internal', 'INTERNAL', 'ACTIVE', '2026-01-01'),
        ('${directorId}', 'r01-director', 'INTERNAL', 'ACTIVE', '2026-01-01');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code)
      values ('17000000-0000-4000-8000-000000000010','${actorId}',
        '20000000-0000-4000-8000-000000000007','2026-01-01','R01_SECURITY_OWNER');
      insert into public.user_position_assignment(id,user_id,position_id,valid_from,is_primary,grant_reason_code)
      values ('17000000-0000-4000-8000-000000000011','${directorId}',
        '10000000-0000-4000-8000-000000000003','2026-01-01',true,'R01_LAB_DIRECTOR');

      insert into public.approval_policy(id,stable_code,status)
      values ('17000000-0000-4000-8000-000000000020','AUTH_RATE_LIMIT_APPROVAL','ACTIVE');
      insert into public.approval_policy_version(
        id,policy_id,version_no,state,subject_kind,checksum,recall_allowed,valid_from,created_by_user_id
      ) values (
        '17000000-0000-4000-8000-000000000021','17000000-0000-4000-8000-000000000020',1,
        'DRAFT','AUTH_RATE_LIMIT_POLICY_VERSION','${"8".repeat(64)}',false,'2026-01-01','${actorId}'
      );
      insert into public.approval_policy_step_rule(
        id,policy_version_id,step_key,sequence_no,step_role,completion_mode,required
      ) values
        ('17000000-0000-4000-8000-000000000022','17000000-0000-4000-8000-000000000021',
          'SECURITY_OWNER_AGREEMENT',1,'AGREEMENT','SPECIFIC',true),
        ('17000000-0000-4000-8000-000000000023','17000000-0000-4000-8000-000000000021',
          'LAB_DIRECTOR_APPROVAL',2,'APPROVAL','SPECIFIC',true);
      insert into public.approval_policy_participant_rule(
        id,step_rule_id,selector_kind,role_id,position_id,participant_order,required_for_completion
      ) values
        ('17000000-0000-4000-8000-000000000024','17000000-0000-4000-8000-000000000022',
          'ROLE','20000000-0000-4000-8000-000000000007',null,1,true),
        ('17000000-0000-4000-8000-000000000025','17000000-0000-4000-8000-000000000023',
          'POSITION',null,'10000000-0000-4000-8000-000000000003',1,true);
      update public.approval_policy_version set state='PUBLISHED'
      where id='17000000-0000-4000-8000-000000000021';
      insert into public.approval_instance(
        id,policy_version_id,policy_version_no,policy_checksum_snapshot,submitter_user_id,generation,
        state,line_checksum,version_no,created_at,submitted_at,completed_at
      ) values (
        '17000000-0000-4000-8000-000000000030','17000000-0000-4000-8000-000000000021',1,
        '${"8".repeat(64)}','${actorId}',1,'COMPLETED','${"7".repeat(64)}',5,
        '2026-08-23T10:00:00Z','2026-08-23T10:00:30Z','2026-08-23T10:01:40Z'
      );
      insert into public.approval_step(
        id,instance_id,policy_step_rule_id,step_key,sequence_no,step_role,completion_mode,required,state,version_no
      ) values
        ('17000000-0000-4000-8000-000000000031','17000000-0000-4000-8000-000000000030',
          '17000000-0000-4000-8000-000000000022','SECURITY_OWNER_AGREEMENT',1,'AGREEMENT','SPECIFIC',true,'AGREED',2),
        ('17000000-0000-4000-8000-000000000032','17000000-0000-4000-8000-000000000030',
          '17000000-0000-4000-8000-000000000023','LAB_DIRECTOR_APPROVAL',2,'APPROVAL','SPECIFIC',true,'APPROVED',2);
      insert into public.approval_participant(
        id,step_id,policy_participant_rule_id,participant_user_id,position_id_snapshot,role_id_snapshot,
        assignment_evidence_id,participant_order,required_for_completion,state,version_no
      ) values
        ('17000000-0000-4000-8000-000000000033','17000000-0000-4000-8000-000000000031',
          '17000000-0000-4000-8000-000000000024','${actorId}',null,
          '20000000-0000-4000-8000-000000000007','17000000-0000-4000-8000-000000000010',1,true,'ACTED',2),
        ('17000000-0000-4000-8000-000000000034','17000000-0000-4000-8000-000000000032',
          '17000000-0000-4000-8000-000000000025','${directorId}',
          '10000000-0000-4000-8000-000000000003',null,'17000000-0000-4000-8000-000000000011',1,true,'ACTED',2);
      insert into public.audit_log(
        id,actor_kind,actor_user_id,effective_actor_user_id,action_id,resource_type,resource_id,
        resource_version,result,reason_code,correlation_id,occurred_at
      ) values
        ('17000000-0000-4000-8000-000000000035','USER','${actorId}','${actorId}',
          'approval.step.agree','APPROVAL_INSTANCE','17000000-0000-4000-8000-000000000030',4,
          'SUCCEEDED','R01_SECURITY_OWNER_AGREED','request:r01-policy-approval','2026-08-23T10:01:00Z'),
        ('17000000-0000-4000-8000-000000000036','USER','${directorId}','${directorId}',
          'approval.step.approve','APPROVAL_INSTANCE','17000000-0000-4000-8000-000000000030',5,
          'SUCCEEDED','R01_LAB_DIRECTOR_APPROVED','request:r01-policy-approval','2026-08-23T10:01:30Z');
      insert into public.approval_action(
        id,instance_id,step_id,participant_id,audit_log_id,event_id,actor_kind,
        authenticated_actor_user_id,effective_actor_user_id,occurred_at
      ) values
        ('17000000-0000-4000-8000-000000000037','17000000-0000-4000-8000-000000000030',
          '17000000-0000-4000-8000-000000000031','17000000-0000-4000-8000-000000000033',
          '17000000-0000-4000-8000-000000000035','AGREE','USER','${actorId}','${actorId}','2026-08-23T10:01:00Z'),
        ('17000000-0000-4000-8000-000000000038','17000000-0000-4000-8000-000000000030',
          '17000000-0000-4000-8000-000000000032','17000000-0000-4000-8000-000000000034',
          '17000000-0000-4000-8000-000000000036','APPROVE','USER','${directorId}','${directorId}','2026-08-23T10:01:30Z');

      insert into public.auth_rate_limit_policy_version(
        id, policy_version, approval_snapshot_sha256, created_at, effective_at
      ) values (
        '${ratePolicyId}', '${ratePolicyVersion}', '${ratePolicySha256}',
        '2026-08-23T10:00:00Z', '2026-08-23T10:02:00Z'
      );
      insert into public.auth_rate_limit_policy_rule(
        policy_version_id, action_id, window_seconds, subject_max_attempts, global_max_attempts
      ) values
        ('${ratePolicyId}','auth.login',60,2,3),
        ('${ratePolicyId}','auth.logout',60,2,3),
        ('${ratePolicyId}','auth.mfa.enroll',60,2,3),
        ('${ratePolicyId}','auth.mfa.verify',60,2,3),
        ('${ratePolicyId}','auth.recovery',60,2,3),
        ('${ratePolicyId}','auth.refresh',60,2,3);
      insert into public.auth_rate_limit_policy_approval(
        policy_version_id,approval_instance_id,security_owner_action_id,lab_director_action_id,linked_at
      ) values (
        '${ratePolicyId}','17000000-0000-4000-8000-000000000030',
        '17000000-0000-4000-8000-000000000037','17000000-0000-4000-8000-000000000038',
        '2026-08-23T10:01:50Z'
      );
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

    await expect(prevention.consume(attempt(1))).resolves.toEqual({
      allowed: true,
      policyVersionId: ratePolicyId,
      retryAfterSeconds: 0
    });
    await expect(prevention.consume(attempt(2))).resolves.toEqual({
      allowed: true,
      policyVersionId: ratePolicyId,
      retryAfterSeconds: 0
    });
    await expect(prevention.consume(attempt(3))).resolves.toMatchObject({ allowed: false });
    await expect(prevention.consume(attempt(4, otherSubject))).resolves.toMatchObject({ allowed: false });
    await prevention.recordOutcome(attempt(1), {
      auditId: uuid("17000000-0000-4000-8000-000000000301"),
      policyVersionId: ratePolicyId,
      reasonCode: stableCode("AUTH_REQUEST_COMPLETED"),
      result: "SUCCEEDED"
    });
    await expect(prevention.recordOutcome(attempt(5), {
      auditId: uuid("17000000-0000-4000-8000-000000000302"),
      policyVersionId: ratePolicyId,
      reasonCode: stableCode("AUTH_REQUEST_COMPLETED"),
      result: "SUCCEEDED"
    })).rejects.toThrow();

    expect(runAdmin("select count(*) from public.audit_log where resource_type='AUTH_SECURITY_ATTEMPT';")).toBe("5");
    expect(runAdmin("select count(*) from public.auth_rate_limit_bucket;")).toBe("3");
    expect(runAdmin("select count(*) from public.audit_log where anonymous_subject_fingerprint is null and resource_type='AUTH_SECURITY_ATTEMPT';")).toBe("0");
    expect(runAdmin(`select count(*) from public.audit_log where resource_type='AUTH_SECURITY_ATTEMPT' and reason_record_ref='${ratePolicyId}';`)).toBe("5");
    expect(runAdmin(`select app_private.auth_rate_limit_policy_sha256('${ratePolicyId}');`)).toBe(ratePolicySha256);
    expect(runAdmin(`select app_private.auth_rate_limit_policy_approval_valid('${ratePolicyId}','2026-08-23T12:00:00Z');`)).toBe("t");
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

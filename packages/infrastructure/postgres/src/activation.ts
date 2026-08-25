import { randomUUID } from "node:crypto";

import {
  assertTrustedActivationContext,
  evaluateAccountActivationReadiness,
  evaluateDeviceTrust,
  type AccountActivationReadiness,
  type ActivationContextSource,
  type ActivationEvidenceKind,
  type ActivationIdentitySnapshot,
  type DeviceTrustCommandPort,
  type DeviceTrustPolicySource,
  type DeviceTrustPolicyVersionSnapshot,
  type DeviceTrustSnapshot,
  type TrustedActivationContext
} from "@youone/core-identity/public";
import {
  sha256,
  stableCode,
  utcInstant,
  uuid,
  version,
  type Sha256,
  type StableCode,
  type UtcInstant,
  type Uuid,
  type Version
} from "@youone/shared-kernel/public";

import type { SqlConnection, SqlPool } from "./driver";

export type ActivationProviderBinding = Readonly<{
  issuer: string;
  projectId: StableCode;
}>;

export const ACTIVATION_DATABASE_BOUNDARY = Object.freeze({
  principal: "youone_activation" as const,
  bypassRls: false as const,
  serverOnly: true as const,
  acceptsVerifiedSubjectOnly: true as const
});

export class PostgresActivationContextSource implements ActivationContextSource {
  public constructor(
    private readonly pool: SqlPool,
    private readonly provider: ActivationProviderBinding
  ) {}

  public async load(
    authSubject: string,
    providerSessionId: string,
    requestTime: UtcInstant
  ): Promise<ActivationIdentitySnapshot | null> {
    return readOnly(this.pool, async (connection) => {
      const result = await connection.query<{ snapshot: unknown }>(
        "select app_private.resolve_activation_context_snapshot($1, $2, $3::timestamptz) as snapshot",
        [authSubject, providerSessionId, requestTime]
      );
      const raw = result.rows[0]?.snapshot;
      return raw === null || raw === undefined ? null : parseActivationIdentity(raw, this.provider);
    });
  }
}

export class PostgresDeviceTrustPolicySource implements DeviceTrustPolicySource {
  public constructor(private readonly pool: SqlPool) {}

  public async loadEffective(evaluatedAt: UtcInstant): Promise<DeviceTrustPolicyVersionSnapshot | null> {
    return readOnly(this.pool, async (connection) => {
      const result = await connection.query<{ policy: unknown }>(
        "select app_private.load_effective_device_trust_policy($1::timestamptz) as policy",
        [evaluatedAt]
      );
      const raw = result.rows[0]?.policy;
      return raw === null || raw === undefined ? null : parsePolicy(raw);
    });
  }
}

export class PostgresDeviceTrustCommandStore implements DeviceTrustCommandPort {
  public constructor(private readonly pool: SqlPool) {}

  public async createPending(input: Readonly<{
    context: TrustedActivationContext;
    deviceCredentialHmac: Sha256;
    policy: DeviceTrustPolicyVersionSnapshot;
    expiresAt: UtcInstant;
  }>): Promise<DeviceTrustSnapshot> {
    const { context } = input;
    assertTrustedActivationContext(context);
    return writeWithContext(this.pool, context, async (connection) => {
      const result = await connection.query<{ snapshot: unknown }>(
        `select app_private.create_pending_device_trust(
          $1::uuid, $2, $3, $4::uuid, $5, $6::uuid, $7::timestamptz,
          $8::uuid, $9::timestamptz
        ) as snapshot`,
        [
          randomUUID(), context.authSubject, context.providerSessionId,
          context.activationEvidenceId, input.deviceCredentialHmac,
          input.policy.policyVersionId, input.expiresAt, randomUUID(), context.requestTime
        ]
      );
      return parseRequiredDeviceTrust(result.rows[0]?.snapshot);
    });
  }

  public async activatePending(input: Readonly<{
    context: TrustedActivationContext;
    deviceTrustId: Uuid;
    deviceCredentialHmac: Sha256;
    expectedVersion: Version;
    policy: DeviceTrustPolicyVersionSnapshot;
  }>): Promise<DeviceTrustSnapshot> {
    const { context } = input;
    assertTrustedActivationContext(context);
    return writeWithContext(this.pool, context, async (connection) => {
      const result = await connection.query<{ snapshot: unknown }>(
        `select app_private.activate_pending_device_trust(
          $1, $2, $3::uuid, $4::uuid, $5, $6::bigint, $7::uuid,
          $8::uuid, $9::uuid, $10::timestamptz
        ) as snapshot`,
        [
          context.authSubject, context.providerSessionId, context.activationEvidenceId,
          input.deviceTrustId, input.deviceCredentialHmac, input.expectedVersion,
          input.policy.policyVersionId, randomUUID(), randomUUID(), context.requestTime
        ]
      );
      return parseRequiredDeviceTrust(result.rows[0]?.snapshot);
    });
  }

  public async loadExact(input: Readonly<{
    context: TrustedActivationContext;
    deviceTrustId?: Uuid;
    deviceCredentialHmac: Sha256;
  }>): Promise<DeviceTrustSnapshot | null> {
    const { context } = input;
    assertTrustedActivationContext(context);
    return readOnlyWithContext(this.pool, context, async (connection) => {
      const result = await connection.query<{ snapshot: unknown }>(
        `select app_private.load_exact_device_trust(
          $1, $2, $3::uuid, $4::uuid, $5, $6::timestamptz
        ) as snapshot`,
        [
          context.authSubject, context.providerSessionId, context.activationEvidenceId,
          input.deviceTrustId ?? null, input.deviceCredentialHmac, context.requestTime
        ]
      );
      const raw = result.rows[0]?.snapshot;
      return raw === null || raw === undefined ? null : parseDeviceTrust(raw);
    });
  }
}

export class PostgresAccountActivationStore {
  public constructor(
    private readonly pool: SqlPool,
    private readonly provider: ActivationProviderBinding
  ) {}

  public async readActivationReadiness(
    context: TrustedActivationContext,
    deviceCredentialHmac: Sha256
  ): Promise<AccountActivationReadiness> {
    assertTrustedActivationContext(context);
    return readOnlyWithContext(this.pool, context, async (connection) => {
      const result = await connection.query<{ facts: unknown }>(
        `select app_private.read_activation_readiness_facts(
          $1, $2, $3::uuid, $4, $5::timestamptz
        ) as facts`,
        [
          context.authSubject, context.providerSessionId, context.activationEvidenceId,
          deviceCredentialHmac, context.requestTime
        ]
      );
      const raw = record(result.rows[0]?.facts);
      const identity = parseActivationIdentity(raw.identity, this.provider);
      const policy = raw.policy === null || raw.policy === undefined ? null : parsePolicy(raw.policy);
      const deviceTrust = raw.deviceTrust === null || raw.deviceTrust === undefined
        ? null
        : parseDeviceTrust(raw.deviceTrust);
      const deviceTrustDecision = evaluateDeviceTrust({
        userAccountId: context.userAccountId,
        providerSessionId: context.providerSessionId,
        presentedDeviceCredentialHmac: deviceCredentialHmac,
        record: deviceTrust,
        policy,
        evaluatedAt: context.requestTime
      });
      return evaluateAccountActivationReadiness({
        identity,
        deviceTrustDecision,
        hasActiveRequiredAssignment: boolean(raw.hasActiveRequiredAssignment),
        hasActiveVendorMembership: boolean(raw.hasActiveVendorMembership),
        evaluatedAt: context.requestTime
      });
    });
  }

  public async activatePendingUser(input: Readonly<{
    context: TrustedActivationContext;
    deviceTrustId: Uuid;
    deviceCredentialHmac: Sha256;
    expectedAccountVersion: Version;
  }>): Promise<Readonly<{ accountVersion: Version; status: "ACTIVE"; userAccountId: Uuid }>> {
    const { context } = input;
    assertTrustedActivationContext(context);
    return writeWithContext(this.pool, context, async (connection) => {
      const result = await connection.query<{ outcome: unknown }>(
        `select app_private.activate_pending_user_account(
          $1, $2, $3::uuid, $4::uuid, $5, $6::bigint, $7::uuid, $8::timestamptz
        ) as outcome`,
        [
          context.authSubject, context.providerSessionId, context.activationEvidenceId,
          input.deviceTrustId, input.deviceCredentialHmac, input.expectedAccountVersion,
          randomUUID(), context.requestTime
        ]
      );
      const outcome = record(result.rows[0]?.outcome);
      if (string(outcome.status) !== "ACTIVE") throw new Error("ACCOUNT_ACTIVATION_RESULT_INVALID");
      return Object.freeze({
        accountVersion: version(number(outcome.accountVersion)),
        status: "ACTIVE" as const,
        userAccountId: uuid(string(outcome.userAccountId))
      });
    });
  }
}

async function readOnly<Result>(
  pool: SqlPool,
  operation: (connection: SqlConnection) => Promise<Result>
): Promise<Result> {
  return transaction(pool, "begin read only", operation);
}

async function readOnlyWithContext<Result>(
  pool: SqlPool,
  context: TrustedActivationContext,
  operation: (connection: SqlConnection) => Promise<Result>
): Promise<Result> {
  return transaction(pool, "begin read only", async (connection) => {
    await setActivationContext(connection, context);
    return operation(connection);
  });
}

async function writeWithContext<Result>(
  pool: SqlPool,
  context: TrustedActivationContext,
  operation: (connection: SqlConnection) => Promise<Result>
): Promise<Result> {
  return transaction(pool, "begin", async (connection) => {
    await setActivationContext(connection, context);
    return operation(connection);
  });
}

async function transaction<Result>(
  pool: SqlPool,
  begin: "begin" | "begin read only",
  operation: (connection: SqlConnection) => Promise<Result>
): Promise<Result> {
  const connection = await pool.connect();
  let began = false;
  let destroy = false;
  let commitAttempted = false;
  try {
    await connection.query(begin);
    began = true;
    await connection.query("set local role youone_activation");
    await connection.query("set local row_security = on");
    const result = await operation(connection);
    commitAttempted = true;
    await connection.query("commit");
    began = false;
    return result;
  } catch (error) {
    if (commitAttempted) destroy = true;
    if (began) {
      try {
        await connection.query("rollback");
        began = false;
      } catch {
        destroy = true;
      }
    }
    throw error;
  } finally {
    connection.release(destroy || began);
  }
}

async function setActivationContext(
  connection: SqlConnection,
  context: TrustedActivationContext
): Promise<void> {
  await connection.query(
    `select
      set_config('app.actor_kind', 'USER', true),
      set_config('app.actor_user_id', $1, true),
      set_config('app.effective_actor_user_id', $1, true),
      set_config('app.correlation_id', $2, true),
      set_config('app.causation_id', '', true),
      set_config('app.request_time', $3, true),
      set_config('app.session_id', $4, true),
      set_config('app.assurance_level', 'AAL2', true),
      set_config('app.acting_authority_id', '', true)`,
    [context.userAccountId, context.correlationId, context.requestTime, context.providerSessionId]
  );
}

function parseActivationIdentity(value: unknown, provider: ActivationProviderBinding): ActivationIdentitySnapshot {
  const raw = record(value);
  const accountKind = string(raw.accountKind);
  const accountStatus = string(raw.accountStatus);
  if (accountKind !== "INTERNAL" && accountKind !== "VENDOR") throw new Error("ACTIVATION_IDENTITY_INVALID");
  if (accountStatus !== "PENDING" && accountStatus !== "ACTIVE" && accountStatus !== "DISABLED") {
    throw new Error("ACTIVATION_IDENTITY_INVALID");
  }
  const evidenceRaw = raw.activationEvidence === null || raw.activationEvidence === undefined
    ? null
    : record(raw.activationEvidence);
  const totpRaw = raw.totp === null || raw.totp === undefined ? null : record(raw.totp);
  return Object.freeze({
    userAccountId: uuid(string(raw.userAccountId)),
    authSubject: string(raw.authSubject),
    accountKind,
    accountStatus,
    accountValidFrom: utcInstant(string(raw.accountValidFrom)),
    ...(raw.accountValidUntil === null || raw.accountValidUntil === undefined
      ? {}
      : { accountValidUntil: utcInstant(string(raw.accountValidUntil)) }),
    accountVersion: version(number(raw.accountVersion)),
    providerIssuer: provider.issuer,
    providerProjectId: provider.projectId,
    providerSessionId: string(raw.providerSessionId),
    providerSessionIsLive: boolean(raw.providerSessionIsLive),
    totp: totpRaw === null ? null : Object.freeze({
      method: exact(string(totpRaw.method), "TOTP"),
      assuranceLevel: exact(string(totpRaw.assuranceLevel), "AAL2"),
      verifiedAt: utcInstant(string(totpRaw.verifiedAt)),
      factorEvidenceId: uuid(string(totpRaw.factorEvidenceId))
    }),
    activationEvidence: evidenceRaw === null ? null : Object.freeze({
      evidenceId: uuid(string(evidenceRaw.evidenceId)),
      evidenceKind: activationEvidenceKind(string(evidenceRaw.evidenceKind)),
      state: exact(string(evidenceRaw.state), "APPROVED"),
      userAccountId: uuid(string(evidenceRaw.userAccountId)),
      authSubject: string(evidenceRaw.authSubject),
      approvedAt: utcInstant(string(evidenceRaw.approvedAt)),
      providerInvitationAcceptedAt: utcInstant(string(evidenceRaw.providerInvitationAcceptedAt)),
      passwordEstablishedAt: utcInstant(string(evidenceRaw.passwordEstablishedAt)),
      ...(evidenceRaw.validUntil === null || evidenceRaw.validUntil === undefined
        ? {}
        : { validUntil: utcInstant(string(evidenceRaw.validUntil)) }),
      evidenceSha256: sha256(string(evidenceRaw.evidenceSha256))
    })
  });
}

function parsePolicy(value: unknown): DeviceTrustPolicyVersionSnapshot {
  const raw = record(value);
  return Object.freeze({
    policyVersionId: uuid(string(raw.policyVersionId)),
    policyCode: stableCode(string(raw.policyCode)),
    state: exact(string(raw.state), "EFFECTIVE"),
    maximumTrustSeconds: positiveSafeInteger(raw.maximumTrustSeconds),
    approvedAt: utcInstant(string(raw.approvedAt)),
    effectiveAt: utcInstant(string(raw.effectiveAt)),
    ...(raw.validUntil === null || raw.validUntil === undefined
      ? {}
      : { validUntil: utcInstant(string(raw.validUntil)) }),
    approvalEvidenceId: uuid(string(raw.approvalEvidenceId))
  });
}

function parseRequiredDeviceTrust(value: unknown): DeviceTrustSnapshot {
  if (value === null || value === undefined) throw new Error("DEVICE_TRUST_RESULT_UNAVAILABLE");
  return parseDeviceTrust(value);
}

function parseDeviceTrust(value: unknown): DeviceTrustSnapshot {
  const raw = record(value);
  const state = string(raw.state);
  if (state !== "PENDING" && state !== "ACTIVE" && state !== "REVOKED" && state !== "EXPIRED") {
    throw new Error("DEVICE_TRUST_RESULT_INVALID");
  }
  return Object.freeze({
    deviceTrustId: uuid(string(raw.deviceTrustId)),
    userAccountId: uuid(string(raw.userAccountId)),
    providerSessionId: string(raw.providerSessionId),
    deviceCredentialHmac: sha256(string(raw.deviceCredentialHmac)),
    state,
    authenticationMethod: exact(string(raw.authenticationMethod), "PASSWORD_TOTP_AAL2"),
    policyVersionId: uuid(string(raw.policyVersionId)),
    createdAt: utcInstant(string(raw.createdAt)),
    ...(raw.approvedAt === null || raw.approvedAt === undefined
      ? {}
      : { approvedAt: utcInstant(string(raw.approvedAt)) }),
    expiresAt: utcInstant(string(raw.expiresAt)),
    ...(raw.revokedAt === null || raw.revokedAt === undefined
      ? {}
      : { revokedAt: utcInstant(string(raw.revokedAt)) }),
    optimisticVersion: version(number(raw.optimisticVersion))
  });
}

function activationEvidenceKind(value: string): ActivationEvidenceKind {
  if (value !== "REGISTRATION_APPROVAL" && value !== "OD042_BOOTSTRAP") {
    throw new Error("ACTIVATION_EVIDENCE_KIND_INVALID");
  }
  return value;
}

function positiveSafeInteger(value: unknown): number {
  const parsed = number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("DEVICE_TRUST_POLICY_INVALID");
  return parsed;
}

function exact<Value extends string>(value: string, expected: Value): Value {
  if (value !== expected) throw new Error("ACTIVATION_DATABASE_RESULT_INVALID");
  return expected;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ACTIVATION_DATABASE_RESULT_INVALID");
  }
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("ACTIVATION_DATABASE_RESULT_INVALID");
  return value;
}

function number(value: unknown): number {
  if (typeof value !== "number") throw new Error("ACTIVATION_DATABASE_RESULT_INVALID");
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("ACTIVATION_DATABASE_RESULT_INVALID");
  return value;
}

export {
  ActivationDatabaseBoundaryError,
  NodePostgresActivationPool,
  createNodePostgresActivationPool,
  type ActivationDatabaseOperationalEvent,
  type NodePostgresActivationPoolOptions
} from "./node-activation-pool";
export type { SqlConnection, SqlPool, SqlQueryResult } from "./driver";

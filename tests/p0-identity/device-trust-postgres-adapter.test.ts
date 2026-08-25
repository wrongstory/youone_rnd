import { describe, expect, it, vi } from "vitest";

import {
  TrustedActivationContextFactory,
  type ActivationIdentitySnapshot
} from "../../packages/core/identity/src/public.js";
import {
  PostgresActivationContextSource,
  PostgresDeviceTrustCommandStore,
  PostgresDeviceTrustPolicySource
} from "../../packages/infrastructure/postgres/src/activation.js";
import type {
  SqlConnection,
  SqlPool
} from "../../packages/infrastructure/postgres/src/driver.js";
import {
  correlationId,
  sha256,
  stableCode,
  utcInstant
} from "../../packages/shared-kernel/src/public.js";

const requestTime = utcInstant("2026-08-25T05:00:00Z");
const userAccountId = "65000000-0000-4000-8000-000000000001";
const authSubject = "65000000-0000-4000-8000-000000000002";
const sessionId = "65000000-0000-4000-8000-000000000003";
const evidenceId = "65000000-0000-4000-8000-000000000004";
const policyId = "65000000-0000-4000-8000-000000000005";
const factorId = "65000000-0000-4000-8000-000000000006";
const deviceTrustId = "65000000-0000-4000-8000-000000000007";
const hmac = sha256("a".repeat(64));

const provider = Object.freeze({
  issuer: "https://staging.example/auth/v1",
  projectId: stableCode("YOUONE_STAGING_PRIMARY")
});

describe("P0 Postgres ActivationContext and DeviceTrust adapters", () => {
  it("loads the exact server snapshot in an isolated read-only activation transaction", async () => {
    const calls: Array<Readonly<{ parameters: readonly unknown[]; sql: string }>> = [];
    const release = vi.fn();
    const source = new PostgresActivationContextSource(pool((sql, parameters) => {
      calls.push({ sql, parameters });
      return sql.includes("resolve_activation_context_snapshot")
        ? { rowCount: 1, rows: [{ snapshot: activationSnapshot() }] }
        : { rowCount: 0, rows: [] };
    }, release), provider);

    await expect(source.load(authSubject, sessionId, requestTime)).resolves.toMatchObject({
      userAccountId,
      authSubject,
      providerSessionId: sessionId,
      providerIssuer: provider.issuer,
      providerProjectId: provider.projectId,
      accountStatus: "PENDING"
    });
    expect(calls.map(({ sql }) => sql)).toEqual([
      "begin read only",
      "set local role youone_activation",
      "set local row_security = on",
      expect.stringContaining("resolve_activation_context_snapshot"),
      "commit"
    ]);
    expect(calls[3]?.parameters).toEqual([authSubject, sessionId, requestTime]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("returns null instead of inventing a DeviceTrust policy when none is effective", async () => {
    const source = new PostgresDeviceTrustPolicySource(pool((sql) => sql.includes("load_effective")
      ? { rowCount: 1, rows: [{ policy: null }] }
      : { rowCount: 0, rows: [] }));
    await expect(source.loadEffective(requestTime)).resolves.toBeNull();
  });

  it("binds createPending to the branded ActivationContext and one DB transaction", async () => {
    const context = await trustedContext();
    const calls: Array<Readonly<{ parameters: readonly unknown[]; sql: string }>> = [];
    const store = new PostgresDeviceTrustCommandStore(pool((sql, parameters) => {
      calls.push({ sql, parameters });
      return sql.includes("create_pending_device_trust")
        ? { rowCount: 1, rows: [{ snapshot: deviceTrustSnapshot("PENDING") }] }
        : { rowCount: 0, rows: [] };
    }));

    const created = await store.createPending({
      context,
      deviceCredentialHmac: hmac,
      policy: policySnapshot(),
      expiresAt: utcInstant("2026-08-25T06:00:00Z")
    });

    expect(created).toMatchObject({
      userAccountId,
      providerSessionId: sessionId,
      state: "PENDING",
      deviceCredentialHmac: hmac
    });
    expect(calls.map(({ sql }) => sql)).toEqual([
      "begin",
      "set local role youone_activation",
      "set local row_security = on",
      expect.stringContaining("set_config('app.actor_user_id'"),
      expect.stringContaining("create_pending_device_trust"),
      "commit"
    ]);
    expect(calls[3]?.parameters).toEqual([
      userAccountId,
      context.correlationId,
      context.requestTime,
      sessionId
    ]);
    expect(calls[4]?.parameters).toEqual(expect.arrayContaining([
      authSubject,
      sessionId,
      evidenceId,
      hmac,
      policyId,
      "2026-08-25T06:00:00.000Z",
      requestTime
    ]));
  });

  it("rolls back without exposing database detail when the command fails", async () => {
    const context = await trustedContext();
    const calls: string[] = [];
    const release = vi.fn();
    const store = new PostgresDeviceTrustCommandStore(pool((sql) => {
      calls.push(sql);
      if (sql.includes("create_pending_device_trust")) throw new Error("raw database detail");
      return { rowCount: 0, rows: [] };
    }, release));

    await expect(store.createPending({
      context,
      deviceCredentialHmac: hmac,
      policy: policySnapshot(),
      expiresAt: utcInstant("2026-08-25T06:00:00Z")
    })).rejects.toThrow("raw database detail");
    expect(calls.at(-1)).toBe("rollback");
    expect(release).toHaveBeenCalledWith(false);
  });
});

function pool(
  handler: (sql: string, parameters: readonly unknown[]) => { rowCount: number; rows: readonly object[] },
  release = vi.fn()
): SqlPool {
  const connection: SqlConnection = {
    query: async (sql, parameters = []) => handler(sql, parameters) as never,
    release
  };
  return { connect: vi.fn(async () => connection) };
}

async function trustedContext() {
  return new TrustedActivationContextFactory(
    { verify: vi.fn(async () => ({
      authSubject,
      sessionId,
      expiresAt: utcInstant("2026-08-25T06:00:00Z"),
      assuranceLevel: "AAL2"
    })) },
    { load: vi.fn(async () => activationSnapshot() as ActivationIdentitySnapshot) }
  ).create("provider-token-not-retained", correlationId("request:device-trust-postgres"), requestTime);
}

function activationSnapshot() {
  return {
    userAccountId,
    authSubject,
    accountKind: "INTERNAL",
    accountStatus: "PENDING",
    accountValidFrom: "2026-08-25T04:00:00.000Z",
    accountValidUntil: null,
    accountVersion: 0,
    providerSessionId: sessionId,
    providerSessionIsLive: true,
    totp: {
      method: "TOTP",
      assuranceLevel: "AAL2",
      verifiedAt: "2026-08-25T04:55:00.000Z",
      factorEvidenceId: factorId
    },
    activationEvidence: {
      evidenceId,
      evidenceKind: "OD042_BOOTSTRAP",
      state: "APPROVED",
      userAccountId,
      authSubject,
      approvedAt: "2026-08-25T04:00:00.000Z",
      providerInvitationAcceptedAt: "2026-08-25T04:30:00.000Z",
      passwordEstablishedAt: "2026-08-25T04:31:00.000Z",
      validUntil: null,
      evidenceSha256: "b".repeat(64)
    }
  };
}

function policySnapshot() {
  return {
    policyVersionId: policyId,
    policyCode: "DEVICE_TRUST_POLICY_V1",
    state: "EFFECTIVE",
    maximumTrustSeconds: 3600,
    approvedAt: "2026-08-25T04:00:00.000Z",
    effectiveAt: "2026-08-25T04:30:00.000Z",
    validUntil: null,
    approvalEvidenceId: "65000000-0000-4000-8000-000000000008"
  };
}

function deviceTrustSnapshot(state: "PENDING" | "ACTIVE") {
  return {
    deviceTrustId,
    userAccountId,
    providerSessionId: sessionId,
    deviceCredentialHmac: hmac,
    state,
    authenticationMethod: "PASSWORD_TOTP_AAL2",
    policyVersionId: policyId,
    createdAt: "2026-08-25T05:00:00.000Z",
    approvedAt: state === "ACTIVE" ? "2026-08-25T05:01:00.000Z" : null,
    expiresAt: "2026-08-25T06:00:00.000Z",
    revokedAt: null,
    optimisticVersion: state === "ACTIVE" ? 1 : 0
  };
}

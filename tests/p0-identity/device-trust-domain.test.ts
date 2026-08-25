import { describe, expect, it, vi } from "vitest";

import {
  ACTIVATION_ACTIONS,
  DeviceTrustActivationService,
  DeviceTrustPolicyUnavailableError,
  TrustedActivationContextFactory,
  assertTrustedActivationContext,
  evaluateAccountActivationReadiness,
  evaluateDeviceTrust,
  type ActivationContext,
  type ActivationContextSource,
  type ActivationIdentitySnapshot,
  type AuthSessionVerifier,
  type DeviceTrustCommandPort,
  type DeviceTrustPolicySource,
  type DeviceTrustPolicyVersionSnapshot,
  type DeviceTrustSnapshot,
  type TrustedActivationContext
} from "../../packages/core/identity/src/public.js";
import {
  correlationId,
  sha256,
  stableCode,
  utcInstant,
  uuid,
  version
} from "../../packages/shared-kernel/src/public.js";

const NOW = utcInstant("2026-08-25T12:00:00Z");
const USER_ID = uuid("10000000-0000-4000-8000-000000000001");
const EVIDENCE_ID = uuid("20000000-0000-4000-8000-000000000001");
const TOTP_EVIDENCE_ID = uuid("30000000-0000-4000-8000-000000000001");
const POLICY_ID = uuid("40000000-0000-4000-8000-000000000001");
const POLICY_EVIDENCE_ID = uuid("50000000-0000-4000-8000-000000000001");
const DEVICE_TRUST_ID = uuid("60000000-0000-4000-8000-000000000001");
const HMAC = sha256("a".repeat(64));
const OTHER_HMAC = sha256("b".repeat(64));

function identity(overrides: Partial<ActivationIdentitySnapshot> = {}): ActivationIdentitySnapshot {
  return {
    userAccountId: USER_ID,
    authSubject: "provider-user-1",
    accountKind: "INTERNAL",
    accountStatus: "PENDING",
    accountValidFrom: utcInstant("2026-08-01T00:00:00Z"),
    accountVersion: version(1),
    providerIssuer: "https://staging.example.invalid/auth/v1",
    providerProjectId: stableCode("YOUONE_STAGING_PRIMARY"),
    providerSessionId: "provider-session-1",
    providerSessionIsLive: true,
    totp: {
      method: "TOTP",
      assuranceLevel: "AAL2",
      verifiedAt: utcInstant("2026-08-25T11:55:00Z"),
      factorEvidenceId: TOTP_EVIDENCE_ID
    },
    activationEvidence: {
      evidenceId: EVIDENCE_ID,
      evidenceKind: "OD042_BOOTSTRAP",
      state: "APPROVED",
      userAccountId: USER_ID,
      authSubject: "provider-user-1",
      approvedAt: utcInstant("2026-08-25T10:00:00Z"),
      providerInvitationAcceptedAt: utcInstant("2026-08-25T11:00:00Z"),
      passwordEstablishedAt: utcInstant("2026-08-25T11:01:00Z"),
      evidenceSha256: sha256("c".repeat(64))
    },
    ...overrides
  };
}

function verifier(overrides: Partial<Awaited<ReturnType<AuthSessionVerifier["verify"]>>> = {}): AuthSessionVerifier {
  return {
    verify: vi.fn(async () => ({
      authSubject: "provider-user-1",
      sessionId: "provider-session-1",
      expiresAt: utcInstant("2026-08-25T13:00:00Z"),
      assuranceLevel: "AAL2",
      ...overrides
    }))
  };
}

function source(snapshot: ActivationIdentitySnapshot | null): ActivationContextSource {
  return { load: vi.fn(async () => snapshot) };
}

function policy(overrides: Partial<DeviceTrustPolicyVersionSnapshot> = {}): DeviceTrustPolicyVersionSnapshot {
  return {
    policyVersionId: POLICY_ID,
    policyCode: stableCode("DEVICE_TRUST_POLICY_V1"),
    state: "EFFECTIVE",
    maximumTrustSeconds: 3_600,
    approvedAt: utcInstant("2026-08-24T00:00:00Z"),
    effectiveAt: utcInstant("2026-08-25T00:00:00Z"),
    approvalEvidenceId: POLICY_EVIDENCE_ID,
    ...overrides
  };
}

function deviceTrust(overrides: Partial<DeviceTrustSnapshot> = {}): DeviceTrustSnapshot {
  return {
    deviceTrustId: DEVICE_TRUST_ID,
    userAccountId: USER_ID,
    providerSessionId: "provider-session-1",
    deviceCredentialHmac: HMAC,
    state: "ACTIVE",
    authenticationMethod: "PASSWORD_TOTP_AAL2",
    policyVersionId: POLICY_ID,
    createdAt: utcInstant("2026-08-25T11:30:00Z"),
    approvedAt: utcInstant("2026-08-25T11:31:00Z"),
    expiresAt: utcInstant("2026-08-25T12:30:00Z"),
    optimisticVersion: version(2),
    ...overrides
  };
}

async function activationContext(snapshot = identity()): Promise<TrustedActivationContext> {
  return new TrustedActivationContextFactory(verifier(), source(snapshot)).create(
    "opaque-provider-token",
    correlationId("request:device-trust"),
    NOW
  );
}

describe("P0 restricted ActivationContext", () => {
  it("derives an immutable exact-self context with only the three activation actions", async () => {
    const context = await activationContext();
    expect(context.userAccountId).toBe(USER_ID);
    expect(context.providerSessionId).toBe("provider-session-1");
    expect(context.assuranceLevel).toBe("AAL2");
    expect(context.authenticationMethod).toBe("TOTP");
    expect(context.allowedActions).toEqual([
      ACTIVATION_ACTIONS.enrollDeviceTrust,
      ACTIVATION_ACTIONS.verifyDeviceTrust,
      ACTIVATION_ACTIONS.readReadiness
    ]);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.allowedActions)).toBe(true);
    expect("roles" in context).toBe(false);
    expect("permissions" in context).toBe(false);
    expect("scopeGrants" in context).toBe(false);
  });

  it("does not accept a structurally forged ActivationContext", () => {
    const forged = Object.freeze({ allowedActions: [] }) as unknown as ActivationContext;
    expect(() => assertTrustedActivationContext(forged)).toThrow(/TrustedActivationContextFactory/);
  });

  it.each([
    ["AAL1", identity(), verifier({ assuranceLevel: "AAL1" }), /AAL2_REQUIRED/],
    ["missing provider session row", identity({ providerSessionIsLive: false }), verifier(), /PROVIDER_SESSION_REQUIRED/],
    ["ACTIVE account", identity({ accountStatus: "ACTIVE" }), verifier(), /ACCOUNT_NOT_PENDING/],
    ["disabled account", identity({ accountStatus: "DISABLED" }), verifier(), /ACCOUNT_DISABLED_OR_EXPIRED/],
    ["revoked evidence", identity({ activationEvidence: { ...identity().activationEvidence!, state: "REVOKED", revokedAt: NOW } }), verifier(), /EVIDENCE_INVALID/],
    ["non-TOTP factor", identity({ totp: null }), verifier(), /TOTP_AAL2_REQUIRED/]
  ])("fails closed for %s", async (_label, snapshot, sessionVerifier, expected) => {
    await expect(new TrustedActivationContextFactory(
      sessionVerifier as AuthSessionVerifier,
      source(snapshot as ActivationIdentitySnapshot)
    ).create("opaque", correlationId("request:denied"), NOW)).rejects.toThrow(expected as RegExp);
  });

  it("rejects cross-session and cross-user activation evidence", async () => {
    await expect(new TrustedActivationContextFactory(
      verifier(),
      source(identity({ providerSessionId: "other-session" }))
    ).create("opaque", correlationId("request:cross-session"), NOW)).rejects.toThrow(/EXACT_SESSION_IDENTITY_REQUIRED/);

    await expect(activationContext(identity({
      activationEvidence: {
        ...identity().activationEvidence!,
        userAccountId: uuid("10000000-0000-4000-8000-000000000002")
      }
    }))).rejects.toThrow(/EVIDENCE_INVALID/);
  });
});

describe("P0 DeviceTrust rules", () => {
  it("fails closed without an effective policy and never invents a trust duration", () => {
    expect(evaluateDeviceTrust({
      userAccountId: USER_ID,
      providerSessionId: "provider-session-1",
      presentedDeviceCredentialHmac: HMAC,
      record: deviceTrust(),
      policy: null,
      evaluatedAt: NOW
    })).toEqual({ trusted: false, reasonCode: "DEVICE_TRUST_POLICY_MISSING" });
  });

  it.each([
    ["other user", deviceTrust({ userAccountId: uuid("10000000-0000-4000-8000-000000000002") }), HMAC, "DEVICE_TRUST_BINDING_MISMATCH"],
    ["other session", deviceTrust({ providerSessionId: "other-session" }), HMAC, "DEVICE_TRUST_BINDING_MISMATCH"],
    ["tampered credential", deviceTrust(), OTHER_HMAC, "DEVICE_TRUST_CREDENTIAL_MISMATCH"],
    ["revoked", deviceTrust({ state: "REVOKED", revokedAt: utcInstant("2026-08-25T11:59:00Z") }), HMAC, "DEVICE_TRUST_REVOKED"],
    ["expired", deviceTrust({ state: "EXPIRED", expiresAt: NOW }), HMAC, "DEVICE_TRUST_EXPIRED"],
    ["pending", deviceTrust({ state: "PENDING", approvedAt: undefined }), HMAC, "DEVICE_TRUST_NOT_ACTIVE"]
  ])("rejects %s DeviceTrust", (_label, record, presentedHmac, reasonCode) => {
    const decision = evaluateDeviceTrust({
      userAccountId: USER_ID,
      providerSessionId: "provider-session-1",
      presentedDeviceCredentialHmac: presentedHmac as typeof HMAC,
      record: record as DeviceTrustSnapshot,
      policy: policy(),
      evaluatedAt: NOW
    });
    expect(decision.trusted).toBe(false);
    expect(decision.reasonCode).toBe(reasonCode);
  });

  it("accepts only an active exact-bound record under the exact effective policy", () => {
    expect(evaluateDeviceTrust({
      userAccountId: USER_ID,
      providerSessionId: "provider-session-1",
      presentedDeviceCredentialHmac: HMAC,
      record: deviceTrust(),
      policy: policy(),
      evaluatedAt: NOW
    })).toMatchObject({ trusted: true, reasonCode: "DEVICE_TRUST_ALLOWED", deviceTrustId: DEVICE_TRUST_ID });
  });

  it("rejects a record whose expiry exceeds its approved policy duration", () => {
    expect(evaluateDeviceTrust({
      userAccountId: USER_ID,
      providerSessionId: "provider-session-1",
      presentedDeviceCredentialHmac: HMAC,
      record: deviceTrust({ expiresAt: utcInstant("2026-08-25T13:00:01Z") }),
      policy: policy(),
      evaluatedAt: NOW
    }).reasonCode).toBe("DEVICE_TRUST_RECORD_INVALID");
  });

  it("blocks enrollment before persistence when no policy version is effective", async () => {
    const commands: DeviceTrustCommandPort = {
      createPending: vi.fn(),
      activatePending: vi.fn(),
      loadExact: vi.fn()
    };
    const policies: DeviceTrustPolicySource = { loadEffective: vi.fn(async () => null) };
    const service = new DeviceTrustActivationService(policies, commands);
    await expect(service.beginEnrollment(await activationContext(), HMAC)).rejects.toBeInstanceOf(DeviceTrustPolicyUnavailableError);
    expect(commands.createPending).not.toHaveBeenCalled();
  });

  it("derives enrollment expiry only from the effective policy version", async () => {
    const pending = deviceTrust({
      state: "PENDING",
      approvedAt: undefined,
      expiresAt: utcInstant("2026-08-25T13:00:00Z"),
      optimisticVersion: version(0)
    });
    const commands: DeviceTrustCommandPort = {
      createPending: vi.fn(async () => pending),
      activatePending: vi.fn(),
      loadExact: vi.fn()
    };
    const policies: DeviceTrustPolicySource = { loadEffective: vi.fn(async () => policy()) };
    const service = new DeviceTrustActivationService(policies, commands);
    await service.beginEnrollment(await activationContext(), HMAC);
    expect(commands.createPending).toHaveBeenCalledWith(expect.objectContaining({
      expiresAt: utcInstant("2026-08-25T13:00:00Z"),
      policy: policy()
    }));
  });

  it("rejects replay when the enrollment row is no longer PENDING", async () => {
    const commands: DeviceTrustCommandPort = {
      createPending: vi.fn(),
      activatePending: vi.fn(),
      loadExact: vi.fn(async () => deviceTrust())
    };
    const policies: DeviceTrustPolicySource = { loadEffective: vi.fn(async () => policy()) };
    const service = new DeviceTrustActivationService(policies, commands);
    await expect(service.activateEnrollment(await activationContext(), DEVICE_TRUST_ID, HMAC)).rejects.toThrow(/REPLAYED/);
    expect(commands.activatePending).not.toHaveBeenCalled();
  });
});

describe("P0 PENDING to ACTIVE gate", () => {
  it("does not activate from DeviceTrust alone", () => {
    const readiness = evaluateAccountActivationReadiness({
      identity: identity({
        activationEvidence: {
          ...identity().activationEvidence!,
          passwordEstablishedAt: undefined
        }
      }),
      deviceTrustDecision: { trusted: true, reasonCode: "DEVICE_TRUST_ALLOWED", deviceTrustId: DEVICE_TRUST_ID, policyVersionId: POLICY_ID, userAccountId: USER_ID, providerSessionId: "provider-session-1" },
      hasActiveRequiredAssignment: false,
      hasActiveVendorMembership: false,
      evaluatedAt: NOW
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.reasonCodes).toEqual(expect.arrayContaining([
      "ACTIVATION_PASSWORD_NOT_ESTABLISHED",
      "ACTIVATION_REQUIRED_ASSIGNMENT_MISSING"
    ]));
  });

  it("permits an INTERNAL transition only when every activation condition is true", () => {
    expect(evaluateAccountActivationReadiness({
      identity: identity(),
      deviceTrustDecision: { trusted: true, reasonCode: "DEVICE_TRUST_ALLOWED", deviceTrustId: DEVICE_TRUST_ID, policyVersionId: POLICY_ID, userAccountId: USER_ID, providerSessionId: "provider-session-1" },
      hasActiveRequiredAssignment: true,
      hasActiveVendorMembership: false,
      evaluatedAt: NOW
    })).toEqual({ ready: true, reasonCodes: [], accountVersion: version(1) });
  });

  it("does not reuse an allowed DeviceTrust decision across provider sessions", () => {
    expect(evaluateAccountActivationReadiness({
      identity: identity(),
      deviceTrustDecision: {
        trusted: true,
        reasonCode: "DEVICE_TRUST_ALLOWED",
        deviceTrustId: DEVICE_TRUST_ID,
        policyVersionId: POLICY_ID,
        userAccountId: USER_ID,
        providerSessionId: "other-session"
      },
      hasActiveRequiredAssignment: true,
      hasActiveVendorMembership: false,
      evaluatedAt: NOW
    }).reasonCodes).toContain("ACTIVATION_DEVICE_TRUST_REQUIRED");
  });

  it("requires an active VendorMembership instead of an internal assignment for VENDOR", () => {
    const facts = {
      identity: identity({ accountKind: "VENDOR" as const }),
      deviceTrustDecision: { trusted: true as const, reasonCode: "DEVICE_TRUST_ALLOWED" as const, deviceTrustId: DEVICE_TRUST_ID, policyVersionId: POLICY_ID, userAccountId: USER_ID, providerSessionId: "provider-session-1" },
      hasActiveRequiredAssignment: true,
      hasActiveVendorMembership: false,
      evaluatedAt: NOW
    };
    expect(evaluateAccountActivationReadiness(facts).reasonCodes).toContain("ACTIVATION_VENDOR_MEMBERSHIP_MISSING");
    expect(evaluateAccountActivationReadiness({ ...facts, hasActiveVendorMembership: true }).ready).toBe(true);
  });
});

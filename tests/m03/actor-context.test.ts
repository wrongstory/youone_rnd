import { describe, expect, it } from "vitest";

import type { Clock } from "../../packages/application-kernel/src/public.js";
import { TrustedActorContextFactory, type ActorContextSource } from "../../packages/core/authorization/src/public.js";
import type { AuthSessionVerifier, IdentitySnapshot } from "../../packages/core/identity/src/public.js";
import { correlationId, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const now = utcInstant("2026-08-21T12:00:00Z");
const userId = uuid("10000000-0000-4000-8000-000000000001");
const effectiveId = uuid("10000000-0000-4000-8000-000000000002");
const evidenceId = uuid("20000000-0000-4000-8000-000000000001");
const authorityId = uuid("30000000-0000-4000-8000-000000000001");

function identity(overrides: Partial<IdentitySnapshot> = {}): IdentitySnapshot {
  return {
    userId,
    authSubject: "verified-subject",
    accountKind: "VENDOR",
    accountStatus: "ACTIVE",
    accountValidFrom: utcInstant("2026-01-01T00:00:00Z"),
    accountVersion: version(1),
    organizations: [], departments: [], positions: [], roles: [], permissions: [], vendorMemberships: [],
    actingAuthorities: [{
      assignmentId: authorityId,
      roleId: stableCode("ROLE_LAB_DIRECTOR"),
      effectiveActorId: effectiveId,
      allowedActions: [stableCode("approval.step.approve")],
      validFrom: utcInstant("2026-08-01T00:00:00Z"),
      validUntil: utcInstant("2026-09-01T00:00:00Z"),
      evidenceId
    }],
    evidenceIds: [evidenceId],
    ...overrides
  };
}

function factory(snapshot: IdentitySnapshot): TrustedActorContextFactory {
  const verifier: AuthSessionVerifier = { verify: async () => ({ authSubject: "verified-subject", sessionId: "session", expiresAt: utcInstant("2026-09-01T00:00:00Z"), assuranceLevel: "AAL2" }) };
  const source: ActorContextSource = {
    load: async () => ({ identity: snapshot, scopeGrants: [], securityEntitlements: [] })
  };
  const clock: Clock = { now: () => now };
  return new TrustedActorContextFactory(verifier, source, clock);
}

describe("M03 TrustedActorContext", () => {
  it("takes account kind from the server snapshot and keeps actors equal by default", async () => {
    const actor = await factory(identity()).create("opaque-token", correlationId("request:m03"));
    expect(actor.actorKind).toBe("VENDOR");
    expect(actor.authenticatedActorId).toBe(userId);
    expect(actor.effectiveActorId).toBe(userId);
    expect(actor.actingAuthorities).toEqual([]);
  });

  it("rejects disabled and expired server accounts immediately", async () => {
    await expect(factory(identity({ accountStatus: "DISABLED" })).create("token", correlationId("request:disabled"))).rejects.toThrow(/disabled or expired/);
    await expect(factory(identity({ accountValidUntil: now })).create("token", correlationId("request:expired"))).rejects.toThrow(/disabled or expired/);
  });

  it("changes effective actor only for an exact active server authority", async () => {
    const actor = await factory(identity({ accountKind: "INTERNAL" })).create("token", correlationId("request:acting"), authorityId);
    expect(actor.authenticatedActorId).toBe(userId);
    expect(actor.effectiveActorId).toBe(effectiveId);
    expect(actor.selectedActingAuthorityId).toBe(authorityId);
    expect(actor.selectedActingAuthorityEvidenceId).toBe(evidenceId);
    await expect(factory(identity({ accountKind: "INTERNAL" })).create("token", correlationId("request:forged"), uuid("30000000-0000-4000-8000-000000000002"))).rejects.toThrow(/missing, expired, or revoked/);
    await expect(factory(identity()).create("token", correlationId("request:vendor-acting"), authorityId)).rejects.toThrow(/vendor accounts cannot/);
    expect(Object.isFrozen(actor.actingAuthorities[0]?.allowedActions)).toBe(true);
    expect(Object.isFrozen(actor.actingAuthorities[0])).toBe(true);
  });
});

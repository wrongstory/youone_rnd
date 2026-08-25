import { describe, expect, it, vi } from "vitest";

import { TrustedActorContextFactory, type ActorContextSource } from "../../packages/core/authorization/src/public.js";
import type { AuthSessionVerifier, IdentitySnapshot } from "../../packages/core/identity/src/public.js";
import { correlationId, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const requestTime = utcInstant("2026-08-25T05:00:00.000Z");

describe("#65 PENDING business boundary", () => {
  it("rejects a PENDING account before any Project query or command can receive an ActorContext", async () => {
    const identity: IdentitySnapshot = Object.freeze({
      userId: uuid("66000000-0000-4000-8000-000000000001"),
      authSubject: "66000000-0000-4000-8000-000000000001",
      accountKind: "INTERNAL",
      accountStatus: "PENDING",
      accountValidFrom: utcInstant("2026-08-25T04:00:00.000Z"),
      accountVersion: version(1),
      organizations: Object.freeze([]),
      departments: Object.freeze([]),
      positions: Object.freeze([]),
      roles: Object.freeze([]),
      permissions: Object.freeze([]),
      vendorMemberships: Object.freeze([]),
      actingAuthorities: Object.freeze([]),
      evidenceIds: Object.freeze([])
    });
    const verifier: AuthSessionVerifier = {
      verify: vi.fn(async () => Object.freeze({
        authSubject: identity.authSubject,
        sessionId: "66000000-0000-4000-8000-000000000011",
        expiresAt: utcInstant("2026-08-25T06:00:00.000Z"),
        assuranceLevel: "AAL2" as const
      }))
    };
    const source: ActorContextSource = {
      load: vi.fn(async () => Object.freeze({
        identity,
        scopeGrants: Object.freeze([]),
        securityEntitlements: Object.freeze([])
      }))
    };
    const projectQuery = vi.fn();
    const factory = new TrustedActorContextFactory(verifier, source, { now: () => requestTime });

    await expect(factory.create(
      "opaque-provider-access-token",
      correlationId("request:pending-project-denied")
    )).rejects.toThrow(/disabled or expired/);
    expect(projectQuery).not.toHaveBeenCalled();
  });
});

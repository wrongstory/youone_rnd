import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationService,
  TrustedActorContextFactory,
  TrustedResourceContextFactory,
  type ActorContextSource,
  type AuthorizationDecision,
  type TrustedAuthorizationDecision
} from "../../packages/core/authorization/src/public.js";
import type { IdentitySnapshot } from "../../packages/core/identity/src/public.js";
import { SupabaseServerSessionVerifier } from "../../packages/infrastructure/supabase-auth/src/request.js";
import {
  DISABLE_USER_ACTION,
  SupabaseServiceAuthAdapter,
  type ServiceAuthAuditBoundary
} from "../../packages/infrastructure/supabase-auth/src/service.js";
import { correlationId, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const now = utcInstant("2026-08-23T12:00:00.000Z");
const actorId = uuid("16000000-0000-4000-8000-000000000001");
const targetId = uuid("16000000-0000-4000-8000-000000000002");
const organizationId = uuid("16000000-0000-4000-8000-000000000003");
const grantId = uuid("16000000-0000-4000-8000-000000000004");
const evidenceId = uuid("16000000-0000-4000-8000-000000000005");

function snapshot(): IdentitySnapshot {
  return {
    userId: actorId,
    authSubject: "m16-operator",
    accountKind: "INTERNAL",
    accountStatus: "ACTIVE",
    accountValidFrom: utcInstant("2026-01-01T00:00:00.000Z"),
    accountVersion: version(1),
    organizations: [],
    departments: [],
    positions: [],
    roles: [],
    permissions: [{
      assignmentId: uuid("16000000-0000-4000-8000-000000000006"),
      stableCode: DISABLE_USER_ACTION,
      validFrom: utcInstant("2026-01-01T00:00:00.000Z"),
      evidenceId
    }],
    vendorMemberships: [],
    actingAuthorities: [],
    evidenceIds: [evidenceId]
  };
}

async function actor() {
  const source: ActorContextSource = {
    load: async () => ({
      identity: snapshot(),
      scopeGrants: [{
        grantId,
        scopeKind: "ORGANIZATION",
        targetId: organizationId,
        actionSetId: stableCode("IDENTITY_ADMIN_V1"),
        actionSetVersion: version(1),
        actions: [DISABLE_USER_ACTION],
        validFrom: utcInstant("2026-01-01T00:00:00.000Z"),
        evidenceId
      }],
      securityEntitlements: []
    })
  };
  return new TrustedActorContextFactory(
    { verify: async () => ({ authSubject: "m16-operator", sessionId: "m16-session", expiresAt: utcInstant("2026-08-23T13:00:00.000Z"), assuranceLevel: "AAL2" }) },
    source,
    { now: () => now }
  ).create("opaque-token", correlationId("request:m16-service-auth"));
}

async function targetResource(resourceId = targetId) {
  const loaded = await new TrustedResourceContextFactory({
    load: async () => ({
      resourceType: stableCode("USER_ACCOUNT"),
      resourceId,
      owningOrganizationId: organizationId,
      authSubject: "m16-target-subject",
      workflowAllows: true,
      securityAllows: true,
      explicitDeny: false
    })
  }).load({ resourceType: stableCode("USER_ACCOUNT"), resourceId }, now);
  if (loaded === null) throw new Error("missing test resource");
  return loaded;
}

describe("M16 session verification", () => {
  it("requires a provider-issued session ID instead of a subject-derived fallback", async () => {
    const verifier = new SupabaseServerSessionVerifier({
      getUser: async () => ({ user: { id: "subject-1" } }),
      getClaims: async () => ({ claims: { sub: "subject-1", exp: 2_000_000_000, aal: "aal2" } })
    });
    await expect(verifier.verify("token")).rejects.toThrow(/session ID is missing/);
  });

  it("fails closed for revoked/provider-failed sessions and malformed expiry", async () => {
    const revoked = new SupabaseServerSessionVerifier({
      getUser: async () => ({ user: null, error: new Error("revoked") }),
      getClaims: async () => ({ claims: { sub: "subject-1", exp: 2_000_000_000, session_id: "session-1" } })
    });
    await expect(revoked.verify("token")).rejects.toThrow(/verification failed/);

    const malformed = new SupabaseServerSessionVerifier({
      getUser: async () => ({ user: { id: "subject-1" } }),
      getClaims: async () => ({ claims: { sub: "subject-1", exp: Number.NaN, session_id: "session-1" } })
    });
    await expect(malformed.verify("token")).rejects.toThrow(/expiry is invalid/);
  });

  it("does not trust an incomplete session from any verifier implementation", async () => {
    const source: ActorContextSource = { load: async () => ({ identity: snapshot(), scopeGrants: [], securityEntitlements: [] }) };
    const factory = new TrustedActorContextFactory(
      { verify: async () => ({ authSubject: "m16-operator", sessionId: "", expiresAt: utcInstant("2026-08-23T13:00:00.000Z"), assuranceLevel: "AAL2" }) },
      source,
      { now: () => now }
    );
    await expect(factory.create("token", correlationId("request:m16-empty-session"))).rejects.toThrow(/identity is incomplete/);
  });
});

describe("M16 privileged Supabase Auth boundary", () => {
  it("requires exact trusted actor/resource/ALLOW provenance and an audit wrapper", async () => {
    const currentActor = await actor();
    const resource = await targetResource();
    const mutableRequest = { action: DISABLE_USER_ACTION, resource };
    const authorization = new AuthorizationService().decide(currentActor, mutableRequest);
    mutableRequest.action = stableCode("mutated.after.decision");
    const provider = { disableUser: vi.fn(async () => undefined) };
    const auditCalls: unknown[] = [];
    const audit: ServiceAuthAuditBoundary = {
      audited: async (input, operation) => {
        auditCalls.push(input);
        return operation();
      }
    };

    await new SupabaseServiceAuthAdapter(provider, audit).disableUser({ actor: currentActor, resource, authorization });

    expect(provider.disableUser).toHaveBeenCalledWith("m16-target-subject");
    expect(auditCalls).toMatchObject([{ actor: currentActor, action: DISABLE_USER_ACTION, resourceId: targetId }]);
  });

  it("rejects forged, denied, and cross-resource decisions before the provider call", async () => {
    const currentActor = await actor();
    const resource = await targetResource();
    const otherResource = await targetResource(uuid("16000000-0000-4000-8000-000000000009"));
    const provider = { disableUser: vi.fn(async () => undefined) };
    const audit: ServiceAuthAuditBoundary = { audited: async (_input, operation) => operation() };
    const adapter = new SupabaseServiceAuthAdapter(provider, audit);
    const allowed = new AuthorizationService().decide(currentActor, { action: DISABLE_USER_ACTION, resource });
    const forged = Object.freeze({ effect: "ALLOW", reason: stableCode("AUTHZ_ALLOWED"), scopeEvidence: [], obligations: [] }) as AuthorizationDecision;

    expect(() => adapter.disableUser({ actor: currentActor, resource, authorization: forged as TrustedAuthorizationDecision })).toThrow(/not produced/);
    expect(() => adapter.disableUser({ actor: currentActor, resource: otherResource, authorization: allowed })).toThrow(/exact actor, action, and resource/);

    const deniedResource = await new TrustedResourceContextFactory({ load: async () => ({ ...resource, explicitDeny: true }) })
      .load({ resourceType: resource.resourceType, resourceId: resource.resourceId }, now);
    if (deniedResource === null) throw new Error("missing denied resource");
    const denied = new AuthorizationService().decide(currentActor, { action: DISABLE_USER_ACTION, resource: deniedResource });
    expect(() => adapter.disableUser({ actor: currentActor, resource: deniedResource, authorization: denied })).toThrow(/not an ALLOW/);
    expect(provider.disableUser).not.toHaveBeenCalled();
  });
});

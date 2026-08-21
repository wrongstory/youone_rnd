import { describe, expect, it } from "vitest";
import {
  applyFieldProjection, AuthorizationService, ProjectionProfileRegistry, TrustedActorContextFactory,
  TrustedResourceContextFactory, type ActorContext, type ActorContextSource, type AuthorizationRequest,
  type ServerResourceContextRecord, type TrustedActorContext, type TrustedProjectionProfile, type TrustedResourceContext,
  type TypedScopeGrant
} from "../../packages/core/authorization/src/public.js";
import type { ActingAuthority, EffectiveAssignment, IdentitySnapshot } from "../../packages/core/identity/src/public.js";
import { correlationId, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const now = utcInstant("2026-08-21T00:00:00Z");
const userId = uuid("10000000-0000-4000-8000-000000000001");
const effectiveId = uuid("10000000-0000-4000-8000-000000000002");
const vendorId = uuid("20000000-0000-4000-8000-000000000001");
const vendorUserId = uuid("30000000-0000-4000-8000-000000000001");
const projectId = uuid("40000000-0000-4000-8000-000000000001");
const contractId = uuid("50000000-0000-4000-8000-000000000001");
const documentId = uuid("60000000-0000-4000-8000-000000000001");
const evidenceId = uuid("70000000-0000-4000-8000-000000000001");
const action = stableCode("contract.detail.read");

function grant(kind: TypedScopeGrant["scopeKind"], targetId: typeof projectId, id: string, grantAction = action, boundVendorUserId = vendorUserId): TypedScopeGrant {
  return { grantId: uuid(id), scopeKind: kind, targetId, actionSetId: stableCode("VENDOR_READ"), actionSetVersion: version(1), actions: [grantAction], vendorUserId: boundVendorUserId, validFrom: utcInstant("2026-01-01T00:00:00Z"), evidenceId: uuid(id.replace(/.$/, "f")) };
}

type ActorOverrides = Partial<Pick<ActorContext, "actorKind" | "positions" | "roles" | "permissions" | "vendorMemberships" | "scopeGrants" | "actingAuthorities" | "securityEntitlements">>;
async function actor(overrides: ActorOverrides = {}, selectedAuthorityId?: ReturnType<typeof uuid>): Promise<TrustedActorContext> {
  const base: ActorContext = {
    actorKind: "VENDOR", authenticatedActorId: userId, effectiveActorId: userId, authSubject: "verified-subject", sessionId: "session",
    assuranceLevel: "AAL1", requestTime: now, correlationId: correlationId("request:m03"), organizations: [], departments: [], positions: [],
    roles: [stableCode("ROLE_VENDOR_USER")], permissions: [action],
    vendorMemberships: [{ vendorUserId, vendorId, status: "ACTIVE", validFrom: utcInstant("2026-01-01T00:00:00Z"), evidenceId }],
    scopeGrants: [grant("CONTRACT", contractId, "80000000-0000-4000-8000-000000000001")], actingAuthorities: [], securityEntitlements: [], evidenceIds: [evidenceId], ...overrides
  };
  const assignment = (code: (typeof base.roles)[number]): EffectiveAssignment => ({ assignmentId: uuid("90000000-0000-4000-8000-000000000001"), stableCode: code, validFrom: utcInstant("2026-01-01T00:00:00Z"), evidenceId });
  const identity: IdentitySnapshot = {
    userId: base.authenticatedActorId, authSubject: base.authSubject, accountKind: base.actorKind, accountStatus: "ACTIVE",
    accountValidFrom: utcInstant("2026-01-01T00:00:00Z"), accountVersion: version(1), organizations: [], departments: [],
    positions: base.positions.map(assignment), roles: base.roles.map(assignment), permissions: base.permissions.map(assignment),
    vendorMemberships: base.vendorMemberships, actingAuthorities: base.actingAuthorities, evidenceIds: base.evidenceIds
  };
  const source: ActorContextSource = { load: async () => ({ identity, scopeGrants: base.scopeGrants, securityEntitlements: base.securityEntitlements }) };
  return new TrustedActorContextFactory(
    { verify: async () => ({ authSubject: base.authSubject, sessionId: base.sessionId, assuranceLevel: base.assuranceLevel, expiresAt: utcInstant("2026-09-01T00:00:00Z") }) },
    source, { now: () => now }
  ).create("verified-token", base.correlationId, selectedAuthorityId);
}

async function resource(overrides: Partial<ServerResourceContextRecord> = {}): Promise<TrustedResourceContext> {
  const record: ServerResourceContextRecord = {
    resourceType: stableCode("VENDOR_CONTRACT"), resourceId: contractId, contractId, projectId, vendorId,
    workflowAllows: true, securityAllows: true, explicitDeny: false, ...overrides
  };
  const loaded = await new TrustedResourceContextFactory({ load: async () => record }).load({ resourceType: record.resourceType, resourceId: record.resourceId }, now);
  if (loaded === null) throw new Error("test resource missing");
  return loaded;
}

function profile(profileAction = action, actorKind: "INTERNAL" | "VENDOR" = "VENDOR", resourceType = stableCode("VENDOR_CONTRACT")): TrustedProjectionProfile {
  const found = new ProjectionProfileRegistry([{ profileId: stableCode("CONTRACT_DETAIL_VENDOR_V1"), version: version(1), actorKind, resourceType, action: profileAction, fields: ["title", "state"] }]).resolve(stableCode("CONTRACT_DETAIL_VENDOR_V1"), version(1));
  if (found === null) throw new Error("test profile missing");
  return found;
}

function request(loadedResource: TrustedResourceContext, requestAction = action, projection = true): AuthorizationRequest {
  return { action: requestAction, resource: loadedResource, ...(projection ? { projectionProfileId: stableCode("CONTRACT_DETAIL_VENDOR_V1"), projectionProfileVersion: version(1) } : {}) };
}

describe("AUTHZ-V1 / AUTHZ-VENDOR-V1 adversarial", () => {
  it("allows only exact vendor membership, contract grant, and bound projection", async () => {
    expect(new AuthorizationService().decide(await actor(), request(await resource()), profile()).effect).toBe("ALLOW");
    expect(new AuthorizationService().decide(await actor(), request(await resource(), action, false)).reason).toBe("AUTHZ_VENDOR_PROJECTION_REQUIRED");
    expect(new AuthorizationService().decide(await actor(), request(await resource()), profile(action, "INTERNAL")).reason).toBe("AUTHZ_PROJECTION_PROFILE_UNTRUSTED");
    const summaryRead = stableCode("project.summary.read");
    const projectResource = await resource({ resourceType: stableCode("PROJECT"), resourceId: projectId, projectId, contractId: undefined });
    expect(new AuthorizationService().decide(await actor({ permissions: [summaryRead], scopeGrants: [grant("PROJECT", projectId, "80000000-0000-4000-8000-000000000010", summaryRead)] }), request(projectResource, summaryRead, false)).reason).toBe("AUTHZ_VENDOR_PROJECTION_REQUIRED");
  });

  it("denies cross-vendor, exact target forgery, kind mismatch, and membership cross-use", async () => {
    const otherVendor = uuid("20000000-0000-4000-8000-000000000002");
    const otherVendorUser = uuid("30000000-0000-4000-8000-000000000002");
    expect(new AuthorizationService().decide(await actor(), request(await resource({ vendorId: otherVendor })), profile()).effect).toBe("DENY");
    expect(new AuthorizationService().decide(await actor(), request(await resource({ contractId: uuid("50000000-0000-4000-8000-000000000002") })), profile()).effect).toBe("DENY");
    expect(new AuthorizationService().decide(await actor({ scopeGrants: [grant("PROJECT", contractId, "80000000-0000-4000-8000-000000000002")] }), request(await resource()), profile()).effect).toBe("DENY");
    const memberships = [...(await actor()).vendorMemberships, { vendorUserId: otherVendorUser, vendorId: otherVendor, status: "ACTIVE" as const, validFrom: utcInstant("2026-01-01T00:00:00Z"), evidenceId }];
    expect(new AuthorizationService().decide(await actor({ vendorMemberships: memberships, scopeGrants: [grant("CONTRACT", contractId, "80000000-0000-4000-8000-000000000003", action, otherVendorUser)] }), request(await resource()), profile()).effect).toBe("DENY");
  });

  it("requires exact document grant and same-membership parent", async () => {
    const docAction = stableCode("technical_document.content.preview");
    const docResourceWithoutApproval = await resource({ resourceType: stableCode("DOCUMENT_VERSION"), resourceId: documentId, documentVersionId: documentId, securityLevel: "SEC_L2_INTERNAL" });
    const docResource = await resource({ resourceType: stableCode("DOCUMENT_VERSION"), resourceId: documentId, documentVersionId: documentId, securityLevel: "SEC_L2_INTERNAL", externalReleaseApprovalEvidenceId: evidenceId });
    const documentGrant = grant("DOCUMENT_VERSION", documentId, "80000000-0000-4000-8000-000000000004", docAction);
    expect(new AuthorizationService().decide(await actor({ permissions: [docAction], scopeGrants: [documentGrant] }), request(docResource, docAction, false)).effect).toBe("DENY");
    const parent = grant("CONTRACT", contractId, "80000000-0000-4000-8000-000000000005", docAction);
    expect(new AuthorizationService().decide(await actor({ permissions: [docAction], scopeGrants: [documentGrant, parent] }), request(docResourceWithoutApproval, docAction, false)).reason).toBe("AUTHZ_VENDOR_EXTERNAL_RELEASE_APPROVAL_REQUIRED");
    expect(new AuthorizationService().decide(await actor({ permissions: [docAction], scopeGrants: [documentGrant, parent] }), request(docResource, docAction, false)).effect).toBe("ALLOW");
  });

  it("hard-denies vendor repository and L3/L4 source operations before owner/scope", async () => {
    for (const level of ["SEC_L3_CONFIDENTIAL", "SEC_L4_CORE_SECRET"] as const) {
      for (const forbidden of ["technical_document.content.preview", "technical_document.content.download", "technical_document.copy.render", "technical_document.copy.print"]) {
        const denied = stableCode(forbidden);
        const loaded = await resource({ resourceType: stableCode("DOCUMENT_VERSION"), resourceId: documentId, documentVersionId: documentId, securityLevel: level, ownerUserId: userId });
        expect(new AuthorizationService().decide(await actor({ permissions: [denied], scopeGrants: [grant("SELF", userId, "80000000-0000-4000-8000-000000000006", denied)] }), request(loaded, denied, false)).reason).toBe("AUTHZ_VENDOR_CONTROLLED_SOURCE_DENIED");
      }
    }
    const search = stableCode("technical_document.repository.search");
    expect(new AuthorizationService().decide(await actor({ permissions: [search], scopeGrants: [grant("SELF", userId, "80000000-0000-4000-8000-000000000007", search)] }), request(await resource({ ownerUserId: userId }), search, false)).reason).toBe("AUTHZ_VENDOR_REPOSITORY_SEARCH_DENIED");
  });

  it("requires exact official approval participant and capability", async () => {
    const approve = stableCode("approval.step.approve");
    const scope = [grant("CONTRACT", contractId, "80000000-0000-4000-8000-000000000008", approve)];
    const participantResource = await resource({ approvalParticipantUserId: userId, approvalParticipantEvidenceId: evidenceId });
    for (const overrides of [
      { actorKind: "INTERNAL" as const, positions: [stableCode("POSITION_JUNIOR_RESEARCHER")], roles: [], permissions: [approve], vendorMemberships: [], scopeGrants: scope },
      { actorKind: "INTERNAL" as const, positions: [], roles: [], permissions: [approve], vendorMemberships: [], scopeGrants: scope },
      { actorKind: "INTERNAL" as const, positions: [], roles: [stableCode("ADMIN_SYSTEM")], permissions: [approve], vendorMemberships: [], scopeGrants: scope }
    ]) expect(new AuthorizationService().decide(await actor(overrides), request(participantResource, approve, false)).reason).toBe("AUTHZ_OFFICIAL_APPROVER_REQUIRED");
    expect(new AuthorizationService().decide(await actor({ permissions: [approve], scopeGrants: scope }), request(participantResource, approve, false)).reason).toBe("AUTHZ_VENDOR_APPROVAL_DENIED");
    expect(new AuthorizationService().decide(await actor({ actorKind: "INTERNAL", positions: [stableCode("POSITION_LAB_DIRECTOR")], roles: [], permissions: [approve], vendorMemberships: [], scopeGrants: scope }), request(participantResource, approve, false)).effect).toBe("ALLOW");

    const authorityId = uuid("a0000000-0000-4000-8000-000000000001");
    const authority: ActingAuthority = { assignmentId: authorityId, roleId: stableCode("ROLE_LAB_DIRECTOR"), effectiveActorId: effectiveId, allowedActions: [approve], validFrom: utcInstant("2026-01-01T00:00:00Z"), validUntil: utcInstant("2026-09-01T00:00:00Z"), evidenceId };
    const actingResource = await resource({ approvalParticipantUserId: effectiveId, approvalParticipantEvidenceId: evidenceId });
    expect(new AuthorizationService().decide(await actor({ actorKind: "INTERNAL", positions: [stableCode("POSITION_SENIOR_RESEARCHER")], roles: [], permissions: [], vendorMemberships: [], scopeGrants: scope, actingAuthorities: [authority] }, authorityId), request(actingResource, approve, false)).effect).toBe("ALLOW");
  });

  it("requires exact SELF grant and rejects provenance clones/nested mutation", async () => {
    const update = stableCode("project.record.update");
    const owned = await resource({ resourceType: stableCode("PROJECT"), resourceId: projectId, projectId, ownerUserId: userId });
    const internal = { actorKind: "INTERNAL" as const, roles: [], positions: [], permissions: [update], vendorMemberships: [], scopeGrants: [] };
    expect(new AuthorizationService().decide(await actor(internal), request(owned, update, false)).effect).toBe("DENY");
    const trustedActor = await actor({ ...internal, scopeGrants: [grant("SELF", userId, "80000000-0000-4000-8000-000000000009", update)] });
    expect(new AuthorizationService().decide(trustedActor, request(owned, update, false)).effect).toBe("ALLOW");
    expect(() => Reflect.apply(new AuthorizationService().decide, new AuthorizationService(), [{ ...trustedActor }, request(owned, update, false)])).toThrow(/not produced/);
    expect(() => Reflect.apply(new AuthorizationService().decide, new AuthorizationService(), [trustedActor, { action: update, resource: { ...owned } }])).toThrow(/not produced/);

    const trustedProfile = profile();
    expect(() => applyFieldProjection({ title: "A" }, { ...trustedProfile } as TrustedProjectionProfile & { fields: readonly "title"[] })).toThrow(/not produced/);
    const projected = applyFieldProjection({ title: { nested: ["A"] }, state: "ACTIVE" }, trustedProfile as TrustedProjectionProfile & { fields: readonly ("title" | "state")[] });
    expect(Object.isFrozen(projected.title)).toBe(true);
    expect(Object.isFrozen(projected.title.nested)).toBe(true);
  });
});

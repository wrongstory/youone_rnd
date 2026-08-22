/** Public cross-module contracts for @youone/core-authorization. */

import type { Clock } from "@youone/application-kernel/public";
import type { ActingAuthority, AuthSessionVerifier, IdentitySnapshot, VendorMembership } from "@youone/core-identity/public";
import { IdentityVerificationError } from "@youone/core-identity/public";
import type { CorrelationId, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";

export type ScopeKind = "CONTRACT" | "DEPARTMENT" | "DOCUMENT_VERSION" | "ORGANIZATION" | "PROJECT" | "SELF" | "VENDOR";
export type TypedScopeGrant = Readonly<{ grantId: Uuid; scopeKind: ScopeKind; targetId: Uuid; actionSetId: StableCode; actionSetVersion: Version; actions: readonly StableCode[]; vendorUserId?: Uuid; validFrom: UtcInstant; validUntil?: UtcInstant; evidenceId: Uuid }>;
export type ActorKind = "INTERNAL" | "VENDOR";
export type ActorContext = Readonly<{
  actorKind: ActorKind; authenticatedActorId: Uuid; effectiveActorId: Uuid; authSubject: string; sessionId: string;
  assuranceLevel: "AAL1" | "AAL2" | "UNKNOWN"; requestTime: UtcInstant; correlationId: CorrelationId;
  organizations: readonly StableCode[]; departments: readonly StableCode[]; positions: readonly StableCode[];
  roles: readonly StableCode[]; permissions: readonly StableCode[]; vendorMemberships: readonly VendorMembership[];
  scopeGrants: readonly TypedScopeGrant[]; actingAuthorities: readonly ActingAuthority[];
  selectedActingAuthorityId?: Uuid; selectedActingAuthorityEvidenceId?: Uuid;
  securityEntitlements: readonly StableCode[]; evidenceIds: readonly Uuid[];
}>;

declare const trustedActorBrand: unique symbol;
export type TrustedActorContext = ActorContext & Readonly<{ [trustedActorBrand]: true }>;
const trustedActors = new WeakSet<object>();
export function assertTrustedActorContext(actor: ActorContext): asserts actor is TrustedActorContext {
  if (!trustedActors.has(actor)) throw new IdentityVerificationError("ActorContext was not produced by TrustedActorContextFactory");
}

export type ActorContextSnapshot = Readonly<{ identity: IdentitySnapshot; scopeGrants: readonly TypedScopeGrant[]; securityEntitlements: readonly StableCode[] }>;
export interface ActorContextSource { load(authSubject: string, requestTime: UtcInstant): Promise<ActorContextSnapshot | null>; }
/** M05/M06/M07 implement this with FK-backed scope tables and their own RLS. */
export interface ActorScopeExtensionSource { load(userId: Uuid, requestTime: UtcInstant): Promise<readonly TypedScopeGrant[]>; }

export class TrustedActorContextFactory {
  constructor(private readonly verifier: AuthSessionVerifier, private readonly source: ActorContextSource, private readonly clock: Clock) {}
  async create(accessToken: string, correlationId: CorrelationId, actingAuthorityId?: Uuid): Promise<TrustedActorContext> {
    const session = await this.verifier.verify(accessToken);
    const now = this.clock.now();
    if (session.authSubject.trim().length === 0 || session.sessionId.trim().length === 0) throw new IdentityVerificationError("verified session identity is incomplete");
    if (session.expiresAt <= now) throw new IdentityVerificationError("verified session is expired");
    const snapshot = await this.source.load(session.authSubject, now);
    if (snapshot === null || snapshot.identity.authSubject !== session.authSubject) throw new IdentityVerificationError("verified session has no matching server identity");
    const { identity } = snapshot;
    assertActiveIdentity(identity, now);
    if (identity.accountKind === "VENDOR" && actingAuthorityId !== undefined) throw new IdentityVerificationError("vendor accounts cannot select acting authority");
    const activeAuthorities = identity.actingAuthorities.filter((item) => isEffective(item, now));
    const selectedAuthority = actingAuthorityId === undefined ? undefined : activeAuthorities.find((item) => item.assignmentId === actingAuthorityId);
    if (actingAuthorityId !== undefined && selectedAuthority === undefined) throw new IdentityVerificationError("acting authority is missing, expired, or revoked");
    const actor: ActorContext = Object.freeze({
      actorKind: identity.accountKind, authenticatedActorId: identity.userId,
      effectiveActorId: selectedAuthority?.effectiveActorId ?? identity.userId, authSubject: identity.authSubject,
      sessionId: session.sessionId, assuranceLevel: session.assuranceLevel, requestTime: now, correlationId,
      organizations: frozenValues(identity.organizations.filter((item) => isEffective(item, now)).map((item) => item.stableCode)),
      departments: frozenValues(identity.departments.filter((item) => isEffective(item, now)).map((item) => item.stableCode)),
      positions: frozenValues(identity.positions.filter((item) => isEffective(item, now)).map((item) => item.stableCode)),
      roles: frozenValues(identity.roles.filter((item) => isEffective(item, now)).map((item) => item.stableCode)),
      permissions: frozenValues(identity.permissions.filter((item) => isEffective(item, now)).map((item) => item.stableCode)),
      vendorMemberships: Object.freeze(identity.vendorMemberships.filter((item) => isEffective(item, now)).map(cloneMembership)),
      scopeGrants: Object.freeze(snapshot.scopeGrants.filter((item) => isEffective(item, now)).map(cloneGrant)),
      actingAuthorities: selectedAuthority === undefined ? Object.freeze([]) : Object.freeze([cloneAuthority(selectedAuthority)]),
      ...(selectedAuthority === undefined ? {} : { selectedActingAuthorityId: selectedAuthority.assignmentId, selectedActingAuthorityEvidenceId: selectedAuthority.evidenceId }),
      securityEntitlements: frozenValues(snapshot.securityEntitlements), evidenceIds: frozenValues(identity.evidenceIds)
    });
    trustedActors.add(actor);
    return actor as TrustedActorContext;
  }
}

export type ServerResourceContextRecord = Readonly<{
  resourceType: StableCode; resourceId: Uuid; resourceVersion?: Version; owningOrganizationId?: Uuid;
  departmentId?: Uuid; projectId?: Uuid; contractId?: Uuid; vendorId?: Uuid; documentVersionId?: Uuid;
  ownerUserId?: Uuid; authSubject?: string; securityLevel?: "SEC_L1_PUBLIC_GENERAL" | "SEC_L2_INTERNAL" | "SEC_L3_CONFIDENTIAL" | "SEC_L4_CORE_SECRET";
  workflowState?: StableCode; approvalParticipantUserId?: Uuid; approvalParticipantEvidenceId?: Uuid;
  externalReleaseApprovalEvidenceId?: Uuid;
  workflowAllows: boolean; securityAllows: boolean; explicitDeny: boolean;
}>;
export type ResourceReference = Readonly<{ resourceType: StableCode; resourceId: Uuid }>;
/** Feature DB loaders resolve all ownership and relationship fields; request-body copies are never authoritative. */
export interface ServerResourceContextLoader { load(reference: ResourceReference, requestTime: UtcInstant): Promise<ServerResourceContextRecord | null>; }
declare const trustedResourceBrand: unique symbol;
export type TrustedResourceContext = ServerResourceContextRecord & Readonly<{ [trustedResourceBrand]: true }>;
const trustedResources = new WeakSet<object>();
export class TrustedResourceContextFactory {
  constructor(private readonly loader: ServerResourceContextLoader) {}
  async load(reference: ResourceReference, requestTime: UtcInstant): Promise<TrustedResourceContext | null> {
    const record = await this.loader.load(reference, requestTime);
    if (record === null) return null;
    if (record.resourceType !== reference.resourceType || record.resourceId !== reference.resourceId) throw new Error("server resource loader returned a mismatched identity");
    const resource = Object.freeze({ ...record });
    trustedResources.add(resource);
    return resource as TrustedResourceContext;
  }
}
export function assertTrustedResourceContext(resource: ServerResourceContextRecord): asserts resource is TrustedResourceContext {
  if (!trustedResources.has(resource)) throw new Error("ResourceContext was not produced by TrustedResourceContextFactory");
}

declare const trustedProjectionBrand: unique symbol;
export type TrustedProjectionProfile = Readonly<{ profileId: StableCode; version: Version; actorKind: ActorKind; resourceType: StableCode; action: StableCode; fields: readonly string[]; [trustedProjectionBrand]: true }>;
export type ProjectionProfileDefinition = Readonly<{ profileId: StableCode; version: Version; actorKind: ActorKind; resourceType: StableCode; action: StableCode; fields: readonly string[] }>;
const trustedProjections = new WeakSet<object>();
export class ProjectionProfileRegistry {
  private readonly profiles = new Map<string, TrustedProjectionProfile>();
  constructor(definitions: readonly ProjectionProfileDefinition[]) {
    for (const definition of definitions) {
      const profile = Object.freeze({ ...definition, fields: frozenValues(definition.fields) });
      trustedProjections.add(profile);
      this.profiles.set(`${definition.profileId}@${definition.version}`, profile as TrustedProjectionProfile);
    }
  }
  resolve(profileId: StableCode, version: Version): TrustedProjectionProfile | null { return this.profiles.get(`${profileId}@${version}`) ?? null; }
}
export function assertTrustedProjectionProfile(profile: TrustedProjectionProfile): void {
  if (!trustedProjections.has(profile)) throw new Error("ProjectionProfile was not produced by ProjectionProfileRegistry");
}

export type AuthorizationObligation = "AUDIT_DENIAL" | "AUDIT_SENSITIVE_READ" | "REAUTHORIZE_ON_DELIVERY" | "STEP_UP_AUTH";
export type AuthorizationDecision = Readonly<{ effect: "ALLOW" | "DENY"; reason: StableCode; scopeEvidence: readonly Uuid[]; projectionProfileId?: StableCode; obligations: readonly AuthorizationObligation[] }>;
export type AuthorizationRequest = Readonly<{ action: StableCode; resource: TrustedResourceContext; projectionProfileId?: StableCode; projectionProfileVersion?: Version }>;

declare const trustedDecisionBrand: unique symbol;
export type TrustedAuthorizationDecision = AuthorizationDecision & Readonly<{ [trustedDecisionBrand]: true }>;
const trustedDecisions = new WeakMap<object, Readonly<{
  actor: TrustedActorContext;
  action: StableCode;
  resource: TrustedResourceContext;
}>>();

export function assertTrustedAuthorizationDecision(
  decision: AuthorizationDecision
): asserts decision is TrustedAuthorizationDecision {
  if (!trustedDecisions.has(decision)) throw new Error("AuthorizationDecision was not produced by AuthorizationService");
}

/** Privileged adapters use this to prove an ALLOW decision belongs to the exact actor, action, and server-loaded resource. */
export function assertAuthorizedDecisionFor(
  decision: AuthorizationDecision,
  actor: TrustedActorContext,
  request: AuthorizationRequest
): asserts decision is TrustedAuthorizationDecision {
  assertTrustedActorContext(actor);
  assertTrustedResourceContext(request.resource);
  assertTrustedAuthorizationDecision(decision);
  const provenance = trustedDecisions.get(decision);
  if (
    decision.effect !== "ALLOW" ||
    provenance?.actor !== actor ||
    provenance.action !== request.action ||
    provenance.resource !== request.resource
  ) {
    throw new Error("AuthorizationDecision is not an ALLOW for the exact actor, action, and resource");
  }
}

export class AuthorizationService {
  decide(actor: TrustedActorContext, request: AuthorizationRequest, projection?: TrustedProjectionProfile): TrustedAuthorizationDecision {
    assertTrustedActorContext(actor);
    assertTrustedResourceContext(request.resource);
    const finish = (decision: AuthorizationDecision): TrustedAuthorizationDecision => {
      trustedDecisions.set(decision, Object.freeze({ actor, action: request.action, resource: request.resource }));
      return decision as TrustedAuthorizationDecision;
    };
    if (request.resource.explicitDeny) return finish(deny("AUTHZ_EXPLICIT_DENY", []));
    const vendorDeny = vendorHardDeny(actor, request.action, request.resource);
    if (vendorDeny !== null) return finish(deny(vendorDeny, ["AUDIT_DENIAL"]));
    const authorityAllows = actor.actingAuthorities.some((authority) => authority.allowedActions.includes(request.action));
    if (!actor.permissions.includes(request.action) && !authorityAllows) return finish(deny("AUTHZ_PERMISSION_MISSING", []));
    const approvalDeny = officialApprovalDeny(actor, request.action, request.resource);
    if (approvalDeny !== null) return finish(deny(approvalDeny, ["AUDIT_DENIAL"]));
    if (isSystemAdminSensitiveSourceDenied(actor, request.resource)) return finish(deny("AUTHZ_SYSTEM_ADMIN_SOURCE_DENIED", []));
    if (!request.resource.workflowAllows) return finish(deny("AUTHZ_WORKFLOW_STATE_DENIED", []));
    if (!request.resource.securityAllows) return finish(deny("AUTHZ_SECURITY_LEVEL_DENIED", ["AUDIT_DENIAL"]));
    const scope = resolveScope(actor, request.action, request.resource);
    if (scope === null) return finish(deny("AUTHZ_SCOPE_DENIED", ["AUDIT_DENIAL"]));
    const projectionDeny = validateProjection(actor, request, projection);
    if (projectionDeny !== null) return finish(deny(projectionDeny, ["AUDIT_DENIAL"]));
    const obligations: AuthorizationObligation[] = request.resource.securityLevel === undefined ? [] : ["REAUTHORIZE_ON_DELIVERY", "AUDIT_SENSITIVE_READ"];
    const participantEvidence = request.action === "approval.step.approve" && request.resource.approvalParticipantEvidenceId !== undefined ? [request.resource.approvalParticipantEvidenceId] : [];
    const releaseEvidence = request.resource.externalReleaseApprovalEvidenceId === undefined ? [] : [request.resource.externalReleaseApprovalEvidenceId];
    return finish(Object.freeze({ effect: "ALLOW", reason: "AUTHZ_ALLOWED" as StableCode, scopeEvidence: frozenValues([...scope, ...participantEvidence, ...releaseEvidence]), projectionProfileId: projection?.profileId, obligations: frozenValues(obligations) }));
  }
}

export function applyFieldProjection<RecordType extends Record<string, unknown>, Key extends keyof RecordType>(record: RecordType, profile: TrustedProjectionProfile & { fields: readonly Key[] }): Pick<RecordType, Key> {
  assertTrustedProjectionProfile(profile);
  return deepCloneFreeze(Object.fromEntries(profile.fields.map((field) => [field, record[field]]))) as Pick<RecordType, Key>;
}

function vendorHardDeny(actor: ActorContext, action: StableCode, resource: ServerResourceContextRecord): string | null {
  if (actor.actorKind !== "VENDOR") return null;
  if (action === "approval.step.approve") return "AUTHZ_VENDOR_APPROVAL_DENIED";
  if (action === "technical_document.repository.search") return "AUTHZ_VENDOR_REPOSITORY_SEARCH_DENIED";
  const forbidden = ["technical_document.content.preview", "technical_document.content.download", "technical_document.copy.render", "technical_document.copy.print"].includes(action);
  if (forbidden && (resource.securityLevel === "SEC_L3_CONFIDENTIAL" || resource.securityLevel === "SEC_L4_CORE_SECRET")) return "AUTHZ_VENDOR_CONTROLLED_SOURCE_DENIED";
  if ((action === "technical_document.content.preview" || action === "technical_document.content.download") &&
      (resource.securityLevel === "SEC_L1_PUBLIC_GENERAL" || resource.securityLevel === "SEC_L2_INTERNAL") &&
      resource.externalReleaseApprovalEvidenceId === undefined) return "AUTHZ_VENDOR_EXTERNAL_RELEASE_APPROVAL_REQUIRED";
  return null;
}
function officialApprovalDeny(actor: ActorContext, action: StableCode, resource: ServerResourceContextRecord): string | null {
  if (action !== "approval.step.approve") return null;
  if (resource.approvalParticipantUserId === undefined || resource.approvalParticipantEvidenceId === undefined || resource.approvalParticipantUserId !== actor.effectiveActorId) return "AUTHZ_APPROVAL_PARTICIPANT_MISMATCH";
  const direct = actor.positions.includes("POSITION_LAB_DIRECTOR" as StableCode) || actor.positions.includes("POSITION_REPRESENTATIVE" as StableCode);
  const acting = actor.selectedActingAuthorityId !== undefined && actor.actingAuthorities.some((authority) => authority.assignmentId === actor.selectedActingAuthorityId && authority.effectiveActorId === actor.effectiveActorId && authority.allowedActions.includes(action) && (authority.roleId === "ROLE_LAB_DIRECTOR" || authority.roleId === "ROLE_REPRESENTATIVE"));
  return direct || acting ? null : "AUTHZ_OFFICIAL_APPROVER_REQUIRED";
}
function isSystemAdminSensitiveSourceDenied(actor: ActorContext, resource: ServerResourceContextRecord): boolean {
  if (!actor.roles.includes("ADMIN_SYSTEM" as StableCode)) return false;
  if (resource.securityLevel === "SEC_L3_CONFIDENTIAL") return !actor.securityEntitlements.includes("ENTITLEMENT_L3_SOURCE_READ" as StableCode);
  if (resource.securityLevel === "SEC_L4_CORE_SECRET") return !actor.securityEntitlements.includes("ENTITLEMENT_L4_SOURCE_READ" as StableCode);
  return false;
}
function resolveScope(actor: ActorContext, action: StableCode, resource: ServerResourceContextRecord): readonly Uuid[] | null {
  const matching = actor.scopeGrants.filter((grant) => grant.actions.includes(action) && (
    (grant.scopeKind === "SELF" && grant.targetId === actor.effectiveActorId && resource.ownerUserId === actor.effectiveActorId) ||
    (grant.scopeKind === "PROJECT" && grant.targetId === resource.projectId) || (grant.scopeKind === "CONTRACT" && grant.targetId === resource.contractId) ||
    (grant.scopeKind === "DOCUMENT_VERSION" && grant.targetId === resource.documentVersionId) ||
    (grant.scopeKind === "ORGANIZATION" && grant.targetId === resource.owningOrganizationId) || (grant.scopeKind === "DEPARTMENT" && grant.targetId === resource.departmentId)
  ));
  if (actor.actorKind !== "VENDOR") return matching.length === 0 ? null : frozenValues(matching.flatMap((grant) => [grant.grantId, grant.evidenceId]));
  const membershipIds = actor.vendorMemberships.filter((membership) => membership.vendorId === resource.vendorId).map((membership) => membership.vendorUserId);
  if (membershipIds.length === 0) return null;
  const vendorMatching = matching.filter((grant) => grant.vendorUserId !== undefined && membershipIds.includes(grant.vendorUserId));
  if (resource.documentVersionId !== undefined) {
    const documents = vendorMatching.filter((grant) => grant.scopeKind === "DOCUMENT_VERSION");
    const parents = actor.scopeGrants.filter((grant) => grant.vendorUserId !== undefined && membershipIds.includes(grant.vendorUserId) && grant.actions.includes(action) && ((grant.scopeKind === "PROJECT" && grant.targetId === resource.projectId) || (grant.scopeKind === "CONTRACT" && grant.targetId === resource.contractId)));
    const evidence = documents.flatMap((document) => { const parent = parents.find((grant) => grant.vendorUserId === document.vendorUserId); return parent === undefined ? [] : [document.grantId, document.evidenceId, parent.grantId, parent.evidenceId]; });
    return evidence.length === 0 ? null : frozenValues(evidence);
  }
  const parentMatching = vendorMatching.filter((grant) => grant.scopeKind === "PROJECT" || grant.scopeKind === "CONTRACT");
  return parentMatching.length === 0 ? null : frozenValues(parentMatching.flatMap((grant) => [grant.grantId, grant.evidenceId]));
}
function validateProjection(actor: ActorContext, request: AuthorizationRequest, projection?: TrustedProjectionProfile): string | null {
  const mandatory = actor.actorKind === "VENDOR" && /\.read$/.test(request.action);
  if (mandatory && (projection === undefined || request.projectionProfileId === undefined || request.projectionProfileVersion === undefined)) return "AUTHZ_VENDOR_PROJECTION_REQUIRED";
  if (projection === undefined) return request.projectionProfileId === undefined ? null : "AUTHZ_PROJECTION_PROFILE_UNTRUSTED";
  try { assertTrustedProjectionProfile(projection); } catch { return "AUTHZ_PROJECTION_PROFILE_UNTRUSTED"; }
  return projection.profileId === request.projectionProfileId && projection.version === request.projectionProfileVersion && projection.actorKind === actor.actorKind && projection.resourceType === request.resource.resourceType && projection.action === request.action ? null : "AUTHZ_PROJECTION_PROFILE_UNTRUSTED";
}
function isEffective(item: { validFrom: UtcInstant; validUntil?: UtcInstant; status?: string }, now: UtcInstant): boolean { return item.validFrom <= now && (item.validUntil === undefined || item.validUntil > now) && item.status !== "REVOKED"; }
function assertActiveIdentity(identity: IdentitySnapshot, now: UtcInstant): void { if (identity.accountStatus !== "ACTIVE" || identity.accountValidFrom > now || (identity.accountValidUntil !== undefined && identity.accountValidUntil <= now)) throw new IdentityVerificationError("server identity is disabled or expired"); }
function cloneMembership(item: VendorMembership): VendorMembership { return Object.freeze({ ...item }); }
function cloneGrant(item: TypedScopeGrant): TypedScopeGrant { return Object.freeze({ ...item, actions: frozenValues(item.actions) }); }
function cloneAuthority(item: ActingAuthority): ActingAuthority { return Object.freeze({ ...item, allowedActions: frozenValues(item.allowedActions) }); }
function frozenValues<Value>(values: readonly Value[]): readonly Value[] { return Object.freeze([...values]); }
function deepCloneFreeze<Value>(value: Value): Value { if (Array.isArray(value)) return Object.freeze(value.map(deepCloneFreeze)) as Value; if (value !== null && typeof value === "object") return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepCloneFreeze(item)]))) as Value; return value; }
function deny(reason: string, obligations: readonly AuthorizationObligation[]): AuthorizationDecision { return Object.freeze({ effect: "DENY", reason: reason as StableCode, scopeEvidence: Object.freeze([]), obligations: frozenValues(obligations) }); }

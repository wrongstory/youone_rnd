import type { CorrelationId, IdempotencyKey, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import { nextVersion } from "@youone/shared-kernel/public";
import { QualityDomainError } from "./requirement-test.js";

export const NCR_MACHINE_ID = "SM-NCR-V1" as const;
export const CAR_MACHINE_ID = "SM-CAR-V1" as const;

export type NcrState = "DRAFT" | "ISSUED" | "CONTAINMENT" | "ROOT_CAUSE_REQUIRED" | "ACTION_PLAN_REVIEW" | "IMPLEMENTING" | "VERIFICATION" | "CLOSED" | "REOPENED" | "CANCELLED";
export type CarState = "PROPOSED" | "ACCEPTED" | "IN_PROGRESS" | "VERIFICATION_REQUIRED" | "EFFECTIVE" | "INEFFECTIVE" | "CLOSED" | "CANCELLED";
export type NcrSeverity = "MINOR" | "MAJOR" | "CRITICAL";
export type ResponsibilityStatus = "PRELIMINARY" | "DISPUTED" | "FINAL";
export type ResponsibilityPartyKind = "INTERNAL" | "VENDOR" | "SHARED" | "UNDETERMINED";

export const NCR_EVENT_IDS = {
  CREATED: "EVT-NCR-CREATE",
  ISSUED: "EVT-NCR-ISSUE",
  CONTAINED: "EVT-NCR-CONTAIN",
  ROOT_CAUSE_REQUESTED: "EVT-NCR-REQUEST-ROOT-CAUSE",
  PLAN_SUBMITTED: "EVT-NCR-SUBMIT-PLAN",
  PLAN_ACCEPTED: "EVT-NCR-ACCEPT-PLAN",
  READY_TO_VERIFY: "EVT-NCR-READY-VERIFY",
  CLOSED: "EVT-NCR-CLOSE",
  REOPENED: "EVT-NCR-REOPEN",
  RESPONSIBILITY_ASSESSED: "EVT-NCR-ASSESS-RESPONSIBILITY"
} as const;

export const CAR_EVENT_IDS = {
  PROPOSED: "EVT-CAR-PROPOSE",
  ACCEPTED: "EVT-CAR-ACCEPT",
  STARTED: "EVT-CAR-START",
  SUBMITTED_TO_VERIFY: "EVT-CAR-SUBMIT-VERIFY",
  VERIFIED_EFFECTIVE: "EVT-CAR-VERIFY-EFFECTIVE",
  VERIFIED_INEFFECTIVE: "EVT-CAR-VERIFY-INEFFECTIVE",
  CLOSED: "EVT-CAR-CLOSE",
  REWORKED: "EVT-CAR-REWORK"
} as const;

export type NcrTransitionEventId = Exclude<(typeof NCR_EVENT_IDS)[keyof typeof NCR_EVENT_IDS], "EVT-NCR-CREATE" | "EVT-NCR-ASSESS-RESPONSIBILITY">;
export type CarTransitionEventId = Exclude<(typeof CAR_EVENT_IDS)[keyof typeof CAR_EVENT_IDS], "EVT-CAR-PROPOSE">;

export const NCR_TRANSITION_MAP: Readonly<Record<NcrTransitionEventId, { readonly from: readonly NcrState[]; readonly to: NcrState }>> = Object.freeze({
  "EVT-NCR-ISSUE": { from: ["DRAFT"], to: "ISSUED" },
  "EVT-NCR-CONTAIN": { from: ["ISSUED"], to: "CONTAINMENT" },
  "EVT-NCR-REQUEST-ROOT-CAUSE": { from: ["CONTAINMENT"], to: "ROOT_CAUSE_REQUIRED" },
  "EVT-NCR-SUBMIT-PLAN": { from: ["ROOT_CAUSE_REQUIRED"], to: "ACTION_PLAN_REVIEW" },
  "EVT-NCR-ACCEPT-PLAN": { from: ["ACTION_PLAN_REVIEW"], to: "IMPLEMENTING" },
  "EVT-NCR-READY-VERIFY": { from: ["IMPLEMENTING"], to: "VERIFICATION" },
  "EVT-NCR-CLOSE": { from: ["VERIFICATION"], to: "CLOSED" },
  "EVT-NCR-REOPEN": { from: ["CLOSED"], to: "REOPENED" }
});

export const CAR_TRANSITION_MAP: Readonly<Record<CarTransitionEventId, { readonly from: readonly CarState[]; readonly to: CarState }>> = Object.freeze({
  "EVT-CAR-ACCEPT": { from: ["PROPOSED"], to: "ACCEPTED" },
  "EVT-CAR-START": { from: ["ACCEPTED"], to: "IN_PROGRESS" },
  "EVT-CAR-SUBMIT-VERIFY": { from: ["IN_PROGRESS"], to: "VERIFICATION_REQUIRED" },
  "EVT-CAR-VERIFY-EFFECTIVE": { from: ["VERIFICATION_REQUIRED"], to: "EFFECTIVE" },
  "EVT-CAR-VERIFY-INEFFECTIVE": { from: ["VERIFICATION_REQUIRED"], to: "INEFFECTIVE" },
  "EVT-CAR-CLOSE": { from: ["EFFECTIVE"], to: "CLOSED" },
  "EVT-CAR-REWORK": { from: ["INEFFECTIVE"], to: "IN_PROGRESS" }
});

export type NcrSourceLink =
  | { readonly kind: "REQUIREMENT_REVISION"; readonly requirementId: Uuid; readonly requirementRevisionId: Uuid }
  | { readonly kind: "INSPECTION_ATTEMPT"; readonly inspectionId: Uuid; readonly inspectionAttemptId: Uuid }
  | { readonly kind: "DELIVERABLE_VERSION"; readonly deliverableId: Uuid; readonly deliverableVersionId: Uuid }
  | { readonly kind: "CONTRACT_VERSION"; readonly contractId: Uuid; readonly contractVersionId: Uuid };

export interface QualityActorSnapshot {
  readonly actorKind: "INTERNAL" | "VENDOR" | "SYSTEM";
  readonly userId?: Uuid;
  readonly vendorId?: Uuid;
  readonly active: boolean;
  readonly authorities: readonly StableCode[];
  readonly contractScopeId?: Uuid;
  readonly contractScopeContractId?: Uuid;
  readonly ncrScopeId?: Uuid;
}

export interface QualityCommand {
  readonly actor: QualityActorSnapshot;
  readonly expectedVersion: Version;
  readonly at: UtcInstant;
  readonly eventId: Uuid;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
}

export interface ResponsibilityAssessmentSnapshot {
  readonly responsibilityAssessmentId: Uuid;
  readonly ncrId: Uuid;
  readonly sequenceNo: number;
  readonly status: ResponsibilityStatus;
  readonly partyKind: ResponsibilityPartyKind;
  readonly vendorId?: Uuid;
  readonly rationale: string;
  readonly evidenceIds: readonly Uuid[];
  readonly assessedByUserId: Uuid;
  readonly assessedAt: UtcInstant;
}

export interface NcrReopenSnapshot {
  /** The command event UUID is reused as the immutable reopen-record UUID for one-to-one audit correlation. */
  readonly ncrReopenId: Uuid;
  readonly ncrId: Uuid;
  readonly reopenCount: number;
  readonly priorClosedAt: UtcInstant;
  readonly reason: string;
  readonly evidenceIds: readonly Uuid[];
  readonly reopenedByUserId: Uuid;
  readonly reopenedAt: UtcInstant;
}

export interface NcrSnapshot {
  readonly ncrId: Uuid;
  readonly ncrNo: string;
  readonly sourceLinks: readonly NcrSourceLink[];
  readonly contractId?: Uuid;
  readonly assignedVendorId?: Uuid;
  readonly severity: NcrSeverity;
  readonly scopeSummary: string;
  readonly observedResult: string;
  readonly requirementSummary: string;
  readonly state: NcrState;
  readonly containmentSummary?: string;
  readonly containmentEvidenceIds: readonly Uuid[];
  readonly currentResponsibilityStatus?: ResponsibilityStatus;
  readonly responsibilityAssessmentCount: number;
  readonly requiredCarCount: number;
  readonly reopenCount: number;
  readonly lastClosedAt?: UtcInstant;
  readonly lastReopenedAt?: UtcInstant;
  readonly version: Version;
  readonly createdByUserId: Uuid;
  readonly createdAt: UtcInstant;
  readonly updatedAt: UtcInstant;
}

export interface CarSnapshot {
  readonly carId: Uuid;
  readonly carNo: string;
  readonly ncrId: Uuid;
  readonly contractId?: Uuid;
  readonly required: boolean;
  readonly rootCause: string;
  readonly actionPlan: string;
  readonly actionOwnerUserId?: Uuid;
  readonly actionOwnerVendorId?: Uuid;
  readonly dueAt: UtcInstant;
  readonly state: CarState;
  readonly implementationEvidenceIds: readonly Uuid[];
  readonly verificationEvidenceIds: readonly Uuid[];
  readonly verifierUserId?: Uuid;
  readonly verificationSummary?: string;
  readonly effectivenessCycle: number;
  readonly version: Version;
  readonly createdAt: UtcInstant;
  readonly updatedAt: UtcInstant;
}

export interface CarVerificationSnapshot {
  readonly carVerificationId: Uuid;
  readonly carId: Uuid;
  readonly effectivenessCycle: number;
  readonly result: "EFFECTIVE" | "INEFFECTIVE";
  readonly verifierUserId: Uuid;
  readonly summary: string;
  readonly evidenceIds: readonly Uuid[];
  readonly verifiedAt: UtcInstant;
}

export interface RequiredCarFact {
  readonly carId: Uuid;
  readonly ncrId: Uuid;
  readonly required: boolean;
  readonly state: CarState;
  readonly version: Version;
}

export interface QualityDomainEvent {
  readonly eventId: Uuid;
  readonly eventType: StableCode;
  readonly machineId: typeof NCR_MACHINE_ID | typeof CAR_MACHINE_ID;
  readonly aggregateId: Uuid;
  readonly aggregateVersion: Version;
  readonly occurredAt: UtcInstant;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
}

export interface QualityAuditObligation {
  readonly eventType: StableCode;
  readonly actor: QualityActorSnapshot;
  readonly aggregateId: Uuid;
  readonly occurredAt: UtcInstant;
  readonly correlationId: CorrelationId;
  readonly reason?: string;
  readonly evidenceIds: readonly Uuid[];
}

export interface NcrMutation {
  readonly expectedVersion: Version;
  readonly snapshot: NcrSnapshot;
  readonly event: QualityDomainEvent;
  readonly audit: QualityAuditObligation;
  readonly immutableResponsibilityAssessment?: ResponsibilityAssessmentSnapshot;
  readonly immutableReopen?: NcrReopenSnapshot;
}
export interface CarMutation {
  readonly expectedVersion: Version;
  readonly snapshot: CarSnapshot;
  readonly event: QualityDomainEvent;
  readonly audit: QualityAuditObligation;
  readonly immutableVerification?: CarVerificationSnapshot;
}

function fail(code: string, message: string): never { throw new QualityDomainError(code as StableCode, message); }
function clone<T>(value: T): T { return structuredClone(value); }
function immutable<T>(value: T): T { return Object.freeze(clone(value)); }
function requireText(value: string, code: string): void { if (!value.trim()) fail(code, "A non-empty value is required."); }
function requireEvidence(evidenceIds: readonly Uuid[], code: string): void { if (evidenceIds.length === 0) fail(code, "At least one immutable evidence reference is required."); }
function hasAuthority(actor: QualityActorSnapshot, authority: string): boolean { return actor.active && actor.authorities.includes(authority as StableCode); }
function requireInternal(actor: QualityActorSnapshot, ...authorities: readonly string[]): Uuid {
  if (actor.actorKind !== "INTERNAL" || !actor.active || !actor.userId || !authorities.some((authority) => hasAuthority(actor, authority))) return fail("QUALITY_INTERNAL_AUTHORITY_REQUIRED", "Required active internal quality authority is missing.");
  return actor.userId;
}
function requireVendorScope(actor: QualityActorSnapshot, contractId: Uuid | undefined, assignedVendorId: Uuid | undefined): void {
  if (actor.actorKind !== "VENDOR" || !actor.active || !hasAuthority(actor, "ncr.action.perform") || !actor.vendorId || actor.vendorId !== assignedVendorId || !actor.contractScopeId || !actor.ncrScopeId || !contractId || actor.contractScopeContractId !== contractId) fail("QUALITY_VENDOR_SCOPE_REQUIRED", "Exact action permission, active Vendor membership, ContractScope and NCR scope are required.");
}
function uniqueLinks(links: readonly NcrSourceLink[]): void {
  if (links.length === 0) fail("NCR_SOURCE_LINK_REQUIRED", "At least one typed source link is required.");
  const keys = links.map((link) => link.kind === "REQUIREMENT_REVISION" ? `${link.kind}:${link.requirementRevisionId}` : link.kind === "INSPECTION_ATTEMPT" ? `${link.kind}:${link.inspectionAttemptId}` : link.kind === "DELIVERABLE_VERSION" ? `${link.kind}:${link.deliverableVersionId}` : `${link.kind}:${link.contractVersionId}`);
  if (new Set(keys).size !== keys.length) fail("NCR_SOURCE_LINK_DUPLICATE", "Typed source links must be unique.");
}

export class NonConformance {
  private constructor(private value: NcrSnapshot) {}

  public static create(input: Omit<NcrSnapshot, "state" | "containmentEvidenceIds" | "responsibilityAssessmentCount" | "requiredCarCount" | "reopenCount" | "version" | "createdAt" | "updatedAt">, command: Omit<QualityCommand, "expectedVersion">): NcrMutation {
    const creator = requireInternal(command.actor, "ncr.record.issue");
    if (creator !== input.createdByUserId) fail("NCR_CREATOR_MISMATCH", "The trusted creator must match createdByUserId.");
    requireText(input.ncrNo, "NCR_NO_REQUIRED"); requireText(input.scopeSummary, "NCR_SCOPE_REQUIRED"); requireText(input.observedResult, "NCR_OBSERVED_RESULT_REQUIRED"); requireText(input.requirementSummary, "NCR_REQUIREMENT_REQUIRED"); uniqueLinks(input.sourceLinks);
    const snapshot: NcrSnapshot = { ...clone(input), state: "DRAFT", containmentEvidenceIds: [], responsibilityAssessmentCount: 0, requiredCarCount: 0, reopenCount: 0, version: 1 as Version, createdAt: command.at, updatedAt: command.at };
    return NonConformance.mutation(snapshot, command, 0 as Version, NCR_EVENT_IDS.CREATED, []);
  }

  public static restore(snapshot: NcrSnapshot): NonConformance { uniqueLinks(snapshot.sourceLinks); return new NonConformance(clone(snapshot)); }
  public snapshot(): NcrSnapshot { return clone(this.value); }

  public issue(command: QualityCommand, evidenceIds: readonly Uuid[]): NcrMutation { this.guard(command, NCR_EVENT_IDS.ISSUED); requireInternal(command.actor, "ncr.record.issue"); requireEvidence(evidenceIds, "NCR_ISSUE_EVIDENCE_REQUIRED"); return this.transition(command, NCR_EVENT_IDS.ISSUED, evidenceIds); }

  public contain(command: QualityCommand, input: { readonly summary: string; readonly evidenceIds: readonly Uuid[] }): NcrMutation {
    this.guard(command, NCR_EVENT_IDS.CONTAINED); requireText(input.summary, "NCR_CONTAINMENT_REQUIRED"); requireEvidence(input.evidenceIds, "NCR_CONTAINMENT_EVIDENCE_REQUIRED");
    if (command.actor.actorKind === "VENDOR") requireVendorScope(command.actor, this.value.contractId, this.value.assignedVendorId);
    else requireInternal(command.actor, "ncr.action.perform");
    this.value = { ...this.value, containmentSummary: input.summary, containmentEvidenceIds: [...input.evidenceIds] };
    return this.transition(command, NCR_EVENT_IDS.CONTAINED, input.evidenceIds);
  }

  public requestRootCause(command: QualityCommand, reason: string): NcrMutation { this.guard(command, NCR_EVENT_IDS.ROOT_CAUSE_REQUESTED); requireInternal(command.actor, "ncr.action.perform"); requireText(reason, "NCR_ROOT_CAUSE_REQUEST_REASON_REQUIRED"); return this.transition(command, NCR_EVENT_IDS.ROOT_CAUSE_REQUESTED, [], reason); }

  public submitPlan(command: QualityCommand, facts: readonly RequiredCarFact[], evidenceIds: readonly Uuid[]): NcrMutation {
    this.guard(command, NCR_EVENT_IDS.PLAN_SUBMITTED); this.requireResponsibleParty(command.actor); requireEvidence(evidenceIds, "NCR_PLAN_EVIDENCE_REQUIRED"); this.assertCarSet(facts, ["PROPOSED", "ACCEPTED"]);
    const requiredCarCount = facts.filter((fact) => fact.required).length;
    if (requiredCarCount === 0) fail("NCR_REQUIRED_CAR_MISSING", "At least one required CAR is needed before plan review.");
    this.value = { ...this.value, requiredCarCount };
    return this.transition(command, NCR_EVENT_IDS.PLAN_SUBMITTED, evidenceIds);
  }

  public acceptPlan(command: QualityCommand, facts: readonly RequiredCarFact[], evidenceIds: readonly Uuid[]): NcrMutation {
    this.guard(command, NCR_EVENT_IDS.PLAN_ACCEPTED); requireInternal(command.actor, "ncr.plan.review"); requireEvidence(evidenceIds, "NCR_PLAN_ACCEPTANCE_EVIDENCE_REQUIRED"); this.assertCarSet(facts, ["ACCEPTED"]);
    if (facts.filter((fact) => fact.required).length !== this.value.requiredCarCount) fail("NCR_REQUIRED_CAR_SET_CHANGED", "The reviewed required CAR set must match the submitted plan.");
    return this.transition(command, NCR_EVENT_IDS.PLAN_ACCEPTED, evidenceIds);
  }

  public readyToVerify(command: QualityCommand, facts: readonly RequiredCarFact[], evidenceIds: readonly Uuid[]): NcrMutation {
    this.guard(command, NCR_EVENT_IDS.READY_TO_VERIFY); this.requireResponsibleParty(command.actor); requireEvidence(evidenceIds, "NCR_IMPLEMENTATION_EVIDENCE_REQUIRED"); this.assertCarSet(facts, ["VERIFICATION_REQUIRED", "EFFECTIVE", "CLOSED"]);
    if (facts.filter((fact) => fact.required).length !== this.value.requiredCarCount) fail("NCR_REQUIRED_CAR_SET_CHANGED", "Every reviewed required CAR must remain in the locked verification set.");
    return this.transition(command, NCR_EVENT_IDS.READY_TO_VERIFY, evidenceIds);
  }

  public close(command: QualityCommand, facts: readonly RequiredCarFact[], input: { readonly reason: string; readonly evidenceIds: readonly Uuid[] }): NcrMutation {
    this.guard(command, NCR_EVENT_IDS.CLOSED); requireInternal(command.actor, "ncr.record.close"); requireText(input.reason, "NCR_CLOSE_REASON_REQUIRED"); requireEvidence(input.evidenceIds, "NCR_CLOSE_EVIDENCE_REQUIRED"); this.assertCarSet(facts, ["EFFECTIVE", "CLOSED"]);
    const required = facts.filter((fact) => fact.required);
    if (required.length !== this.value.requiredCarCount || required.some((fact) => fact.state !== "EFFECTIVE" && fact.state !== "CLOSED")) fail("NCR_REQUIRED_CAR_NOT_EFFECTIVE", "Every reviewed required CAR must be effective or closed.");
    this.value = { ...this.value, lastClosedAt: command.at };
    return this.transition(command, NCR_EVENT_IDS.CLOSED, input.evidenceIds, input.reason);
  }

  public reopen(command: QualityCommand, input: { readonly reason: string; readonly evidenceIds: readonly Uuid[] }): NcrMutation {
    this.guard(command, NCR_EVENT_IDS.REOPENED); const reopenedByUserId = requireInternal(command.actor, "ncr.record.close"); requireText(input.reason, "NCR_REOPEN_REASON_REQUIRED"); requireEvidence(input.evidenceIds, "NCR_REOPEN_EVIDENCE_REQUIRED");
    const priorClosedAt = this.value.lastClosedAt;
    if (!priorClosedAt) fail("NCR_PRIOR_CLOSE_REQUIRED", "Reopen requires the exact prior close occurrence.");
    const immutableReopen: NcrReopenSnapshot = immutable({ ncrReopenId: command.eventId, ncrId: this.value.ncrId, reopenCount: this.value.reopenCount + 1, priorClosedAt, reason: input.reason, evidenceIds: [...input.evidenceIds], reopenedByUserId, reopenedAt: command.at });
    this.value = { ...this.value, reopenCount: this.value.reopenCount + 1, lastReopenedAt: command.at };
    const expectedVersion = this.value.version;
    this.value = { ...this.value, state: NCR_TRANSITION_MAP[NCR_EVENT_IDS.REOPENED].to, version: nextVersion(this.value.version), updatedAt: command.at };
    return NonConformance.mutation(this.value, command, expectedVersion, NCR_EVENT_IDS.REOPENED, input.evidenceIds, input.reason, undefined, immutableReopen);
  }

  public assessResponsibility(command: QualityCommand, input: Omit<ResponsibilityAssessmentSnapshot, "ncrId" | "sequenceNo" | "assessedByUserId" | "assessedAt">): NcrMutation {
    if (command.expectedVersion !== this.value.version) fail("NCR_STALE_VERSION", "Optimistic version mismatch.");
    const assessor = requireInternal(command.actor, input.status === "FINAL" ? "ncr.record.close" : "ncr.record.issue");
    requireText(input.rationale, "NCR_RESPONSIBILITY_RATIONALE_REQUIRED"); requireEvidence(input.evidenceIds, "NCR_RESPONSIBILITY_EVIDENCE_REQUIRED");
    const vendorMustBeNamed = input.partyKind === "VENDOR" || input.partyKind === "SHARED";
    if (vendorMustBeNamed !== (input.vendorId !== undefined)) fail("NCR_RESPONSIBILITY_VENDOR_INVALID", "Vendor or shared responsibility must identify exactly one Vendor; other assessments must not attach one.");
    if ((input.status === "DISPUTED" || input.status === "FINAL") && this.value.currentResponsibilityStatus === undefined) fail("NCR_RESPONSIBILITY_PRELIMINARY_REQUIRED", "Disputed or final responsibility requires a prior assessment.");
    const expectedVersion = this.value.version;
    const assessment: ResponsibilityAssessmentSnapshot = immutable({ ...clone(input), ncrId: this.value.ncrId, sequenceNo: this.value.responsibilityAssessmentCount + 1, assessedByUserId: assessor, assessedAt: command.at });
    this.value = { ...this.value, currentResponsibilityStatus: input.status, responsibilityAssessmentCount: assessment.sequenceNo, version: nextVersion(this.value.version), updatedAt: command.at };
    return NonConformance.mutation(this.value, command, expectedVersion, NCR_EVENT_IDS.RESPONSIBILITY_ASSESSED, input.evidenceIds, input.rationale, assessment);
  }

  private guard(command: QualityCommand, eventId: NcrTransitionEventId): void {
    if (command.expectedVersion !== this.value.version) fail("NCR_STALE_VERSION", "Optimistic version mismatch.");
    if (!command.actor.active) fail("NCR_ACTOR_INACTIVE", "Inactive actors cannot change an NCR.");
    const transition = NCR_TRANSITION_MAP[eventId];
    if (!transition.from.includes(this.value.state)) fail("NCR_TRANSITION_INVALID", `${eventId} is not allowed from ${this.value.state}.`);
  }
  private requireResponsibleParty(actor: QualityActorSnapshot): void { if (actor.actorKind === "VENDOR") requireVendorScope(actor, this.value.contractId, this.value.assignedVendorId); else requireInternal(actor, "ncr.action.perform"); }
  private assertCarSet(facts: readonly RequiredCarFact[], allowedStates: readonly CarState[]): void { if (facts.some((fact) => fact.ncrId !== this.value.ncrId)) fail("NCR_CAR_SUBJECT_MISMATCH", "Every CAR fact must belong to this NCR."); const ids = facts.map((fact) => fact.carId); if (new Set(ids).size !== ids.length) fail("NCR_CAR_DUPLICATE", "CAR facts must be unique."); if (facts.filter((fact) => fact.required).some((fact) => !allowedStates.includes(fact.state))) fail("NCR_REQUIRED_CAR_STATE_INVALID", "A required CAR is not in an allowed state."); }
  private transition(command: QualityCommand, eventId: NcrTransitionEventId, evidenceIds: readonly Uuid[], reason?: string): NcrMutation { const expectedVersion = this.value.version; this.value = { ...this.value, state: NCR_TRANSITION_MAP[eventId].to, version: nextVersion(this.value.version), updatedAt: command.at }; return NonConformance.mutation(this.value, command, expectedVersion, eventId, evidenceIds, reason); }
  private static mutation(snapshot: NcrSnapshot, command: Omit<QualityCommand, "expectedVersion">, expectedVersion: Version, eventType: string, evidenceIds: readonly Uuid[], reason?: string, assessment?: ResponsibilityAssessmentSnapshot, reopen?: NcrReopenSnapshot): NcrMutation { return { expectedVersion, snapshot: immutable(snapshot), event: { eventId: command.eventId, eventType: eventType as StableCode, machineId: NCR_MACHINE_ID, aggregateId: snapshot.ncrId, aggregateVersion: snapshot.version, occurredAt: command.at, correlationId: command.correlationId, idempotencyKey: command.idempotencyKey, payload: { state: snapshot.state, severity: snapshot.severity, requiredCarCount: snapshot.requiredCarCount, reopenCount: snapshot.reopenCount, contractStateChanged: false } }, audit: { eventType: eventType as StableCode, actor: clone(command.actor), aggregateId: snapshot.ncrId, occurredAt: command.at, correlationId: command.correlationId, ...(reason ? { reason } : {}), evidenceIds: [...evidenceIds] }, ...(assessment ? { immutableResponsibilityAssessment: assessment } : {}), ...(reopen ? { immutableReopen: reopen } : {}) }; }
}

export class CorrectiveAction {
  private constructor(private value: CarSnapshot) {}
  public static create(input: Omit<CarSnapshot, "state" | "implementationEvidenceIds" | "verificationEvidenceIds" | "verifierUserId" | "verificationSummary" | "effectivenessCycle" | "version" | "createdAt" | "updatedAt">, command: Omit<QualityCommand, "expectedVersion">): CarMutation {
    requireText(input.carNo, "CAR_NO_REQUIRED"); requireText(input.rootCause, "CAR_ROOT_CAUSE_REQUIRED"); requireText(input.actionPlan, "CAR_ACTION_PLAN_REQUIRED");
    if ((input.actionOwnerUserId === undefined) === (input.actionOwnerVendorId === undefined)) fail("CAR_ACTION_OWNER_INVALID", "CAR requires exactly one internal user or Vendor owner.");
    if (command.actor.actorKind === "VENDOR") requireVendorScope(command.actor, input.contractId, input.actionOwnerVendorId);
    else requireInternal(command.actor, "ncr.action.perform");
    const snapshot: CarSnapshot = { ...clone(input), state: "PROPOSED", implementationEvidenceIds: [], verificationEvidenceIds: [], effectivenessCycle: 1, version: 1 as Version, createdAt: command.at, updatedAt: command.at };
    return CorrectiveAction.mutation(snapshot, command, 0 as Version, CAR_EVENT_IDS.PROPOSED, []);
  }
  public static restore(snapshot: CarSnapshot): CorrectiveAction { return new CorrectiveAction(clone(snapshot)); }
  public snapshot(): CarSnapshot { return clone(this.value); }
  public accept(command: QualityCommand, evidenceIds: readonly Uuid[]): CarMutation { this.guard(command, CAR_EVENT_IDS.ACCEPTED); requireInternal(command.actor, "ncr.plan.review"); requireEvidence(evidenceIds, "CAR_ACCEPTANCE_EVIDENCE_REQUIRED"); return this.transition(command, CAR_EVENT_IDS.ACCEPTED, evidenceIds); }
  public start(command: QualityCommand): CarMutation { this.guard(command, CAR_EVENT_IDS.STARTED); this.requireActionOwner(command.actor); return this.transition(command, CAR_EVENT_IDS.STARTED, []); }
  public submitVerification(command: QualityCommand, evidenceIds: readonly Uuid[]): CarMutation { this.guard(command, CAR_EVENT_IDS.SUBMITTED_TO_VERIFY); this.requireActionOwner(command.actor); requireEvidence(evidenceIds, "CAR_IMPLEMENTATION_EVIDENCE_REQUIRED"); this.value = { ...this.value, implementationEvidenceIds: [...evidenceIds] }; return this.transition(command, CAR_EVENT_IDS.SUBMITTED_TO_VERIFY, evidenceIds); }
  public verify(command: QualityCommand, input: { readonly carVerificationId: Uuid; readonly effective: boolean; readonly summary: string; readonly evidenceIds: readonly Uuid[] }): CarMutation {
    const event = input.effective ? CAR_EVENT_IDS.VERIFIED_EFFECTIVE : CAR_EVENT_IDS.VERIFIED_INEFFECTIVE;
    this.guard(command, event); const verifier = requireInternal(command.actor, "ncr.effectiveness.verify");
    if (this.value.actionOwnerUserId === verifier) fail("CAR_SELF_VERIFICATION_FORBIDDEN", "The action performer cannot verify their own CAR.");
    requireText(input.summary, "CAR_VERIFICATION_SUMMARY_REQUIRED"); requireEvidence(input.evidenceIds, "CAR_VERIFICATION_EVIDENCE_REQUIRED");
    this.value = { ...this.value, verifierUserId: verifier, verificationSummary: input.summary, verificationEvidenceIds: [...input.evidenceIds] };
    const immutableVerification: CarVerificationSnapshot = immutable({ carVerificationId: input.carVerificationId, carId: this.value.carId, effectivenessCycle: this.value.effectivenessCycle, result: input.effective ? "EFFECTIVE" : "INEFFECTIVE", verifierUserId: verifier, summary: input.summary, evidenceIds: [...input.evidenceIds], verifiedAt: command.at });
    return this.transition(command, event, input.evidenceIds, input.summary, !input.effective, immutableVerification);
  }
  public close(command: QualityCommand, evidenceIds: readonly Uuid[]): CarMutation { this.guard(command, CAR_EVENT_IDS.CLOSED); requireInternal(command.actor, "ncr.record.close"); requireEvidence(evidenceIds, "CAR_CLOSE_EVIDENCE_REQUIRED"); return this.transition(command, CAR_EVENT_IDS.CLOSED, evidenceIds); }
  public rework(command: QualityCommand, input: { readonly reason: string; readonly evidenceIds: readonly Uuid[] }): CarMutation { this.guard(command, CAR_EVENT_IDS.REWORKED); this.requireActionOwner(command.actor); requireText(input.reason, "CAR_REWORK_REASON_REQUIRED"); requireEvidence(input.evidenceIds, "CAR_REWORK_EVIDENCE_REQUIRED"); this.value = { ...this.value, effectivenessCycle: this.value.effectivenessCycle + 1, verifierUserId: undefined, verificationSummary: undefined, verificationEvidenceIds: [] }; return this.transition(command, CAR_EVENT_IDS.REWORKED, input.evidenceIds, input.reason); }
  private guard(command: QualityCommand, eventId: CarTransitionEventId): void { if (command.expectedVersion !== this.value.version) fail("CAR_STALE_VERSION", "Optimistic version mismatch."); if (!command.actor.active) fail("CAR_ACTOR_INACTIVE", "Inactive actors cannot change a CAR."); const transition = CAR_TRANSITION_MAP[eventId]; if (!transition.from.includes(this.value.state)) fail("CAR_TRANSITION_INVALID", `${eventId} is not allowed from ${this.value.state}.`); }
  private requireActionOwner(actor: QualityActorSnapshot): void { if (actor.actorKind === "VENDOR") { requireVendorScope(actor, this.value.contractId, this.value.actionOwnerVendorId); return; } if (actor.actorKind !== "INTERNAL" || !actor.active || !hasAuthority(actor, "ncr.action.perform") || !actor.userId || actor.userId !== this.value.actionOwnerUserId) fail("CAR_ACTION_OWNER_REQUIRED", "Only the exact active action owner with ncr.action.perform may perform this transition."); }
  private transition(command: QualityCommand, eventId: CarTransitionEventId, evidenceIds: readonly Uuid[], reason?: string, ecrReviewRequired = false, verification?: CarVerificationSnapshot): CarMutation { const expectedVersion = this.value.version; this.value = { ...this.value, state: CAR_TRANSITION_MAP[eventId].to, version: nextVersion(this.value.version), updatedAt: command.at }; return CorrectiveAction.mutation(this.value, command, expectedVersion, eventId, evidenceIds, reason, ecrReviewRequired, verification); }
  private static mutation(snapshot: CarSnapshot, command: Omit<QualityCommand, "expectedVersion">, expectedVersion: Version, eventType: string, evidenceIds: readonly Uuid[], reason?: string, ecrReviewRequired = false, verification?: CarVerificationSnapshot): CarMutation { return { expectedVersion, snapshot: immutable(snapshot), event: { eventId: command.eventId, eventType: eventType as StableCode, machineId: CAR_MACHINE_ID, aggregateId: snapshot.carId, aggregateVersion: snapshot.version, occurredAt: command.at, correlationId: command.correlationId, idempotencyKey: command.idempotencyKey, payload: { state: snapshot.state, ncrId: snapshot.ncrId, required: snapshot.required, effectivenessCycle: snapshot.effectivenessCycle, ecrReviewRequired, contractStateChanged: false } }, audit: { eventType: eventType as StableCode, actor: clone(command.actor), aggregateId: snapshot.carId, occurredAt: command.at, correlationId: command.correlationId, ...(reason ? { reason } : {}), evidenceIds: [...evidenceIds] }, ...(verification ? { immutableVerification: verification } : {}) }; }
}

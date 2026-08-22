import type { StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import { NonConformance, type CarMutation, type CarSnapshot, type CarVerificationSnapshot, type NcrMutation, type NcrReopenSnapshot, type NcrSnapshot, type NcrSourceLink, type QualityActorSnapshot, type QualityAuditObligation, type QualityCommand, type QualityDomainEvent, type RequiredCarFact, type ResponsibilityAssessmentSnapshot } from "../domain/ncr-car.js";
import { QualityDomainError } from "../domain/requirement-test.js";

export const NCR_CAR_PERMISSION_IDS = {
  RECORD_ISSUE: "ncr.record.issue",
  ACTION_PERFORM: "ncr.action.perform",
  PLAN_REVIEW: "ncr.plan.review",
  EFFECTIVENESS_VERIFY: "ncr.effectiveness.verify",
  RECORD_CLOSE: "ncr.record.close"
} as const;

export interface NcrRepository {
  loadForUpdate(ncrId: Uuid): Promise<NcrSnapshot | null>;
  insert(snapshot: NcrSnapshot): Promise<void>;
  save(snapshot: NcrSnapshot, expectedVersion: Version): Promise<boolean>;
  insertImmutableResponsibilityAssessment(snapshot: ResponsibilityAssessmentSnapshot): Promise<void>;
  appendImmutableReopenEvent(snapshot: NcrReopenSnapshot): Promise<void>;
}
export interface CarRepository {
  loadForUpdate(carId: Uuid): Promise<CarSnapshot | null>;
  listFactsForNcrForUpdate(ncrId: Uuid): Promise<readonly RequiredCarFact[]>;
  assertNcrAllowsCar(input: { readonly ncrId: Uuid; readonly contractId?: Uuid; readonly actionOwnerVendorId?: Uuid }): Promise<void>;
  insertImmutableVerification(snapshot: CarVerificationSnapshot): Promise<void>;
  insert(snapshot: CarSnapshot): Promise<void>;
  save(snapshot: CarSnapshot, expectedVersion: Version): Promise<boolean>;
}
export interface NcrSourceLinkValidationPort { assertExactLinks(links: readonly NcrSourceLink[]): Promise<void> }
export interface NcrCarEvidencePort {
  appendTransition(input: { readonly aggregateId: Uuid; readonly machineId: StableCode; readonly fromVersion: Version; readonly toVersion: Version; readonly eventType: StableCode; readonly occurredAt: UtcInstant }): Promise<void>;
  appendAudit(obligation: QualityAuditObligation): Promise<void>;
  enqueue(event: QualityDomainEvent): Promise<void>;
}
export interface NcrCarTransactionContext { readonly ncrs: NcrRepository; readonly cars: CarRepository; readonly sourceLinks: NcrSourceLinkValidationPort; readonly evidence: NcrCarEvidencePort }
export interface NcrCarUnitOfWork { transact<T>(work: (context: NcrCarTransactionContext) => Promise<T>): Promise<T> }
export class NcrCarConcurrencyError extends Error { public readonly code = "QUALITY_STALE_VERSION" as StableCode; }

async function appendEvidence(context: NcrCarTransactionContext, mutation: NcrMutation | CarMutation): Promise<void> {
  await context.evidence.appendTransition({ aggregateId: mutation.event.aggregateId, machineId: mutation.event.machineId as StableCode, fromVersion: mutation.expectedVersion, toVersion: mutation.snapshot.version, eventType: mutation.event.eventType, occurredAt: mutation.event.occurredAt });
  await context.evidence.appendAudit(mutation.audit);
  await context.evidence.enqueue(mutation.event);
}
async function saveNcrMutation(context: NcrCarTransactionContext, mutation: NcrMutation): Promise<void> {
  if (mutation.snapshot.version !== mutation.expectedVersion + 1) throw new NcrCarConcurrencyError("NCR mutation must increment version exactly once.");
  if (!await context.ncrs.save(mutation.snapshot, mutation.expectedVersion)) throw new NcrCarConcurrencyError("NCR optimistic lock lost.");
  if (mutation.immutableResponsibilityAssessment) await context.ncrs.insertImmutableResponsibilityAssessment(mutation.immutableResponsibilityAssessment);
  if (mutation.immutableReopen) await context.ncrs.appendImmutableReopenEvent(mutation.immutableReopen);
  await appendEvidence(context, mutation);
}

export async function persistNcrMutation(unitOfWork: NcrCarUnitOfWork, mutation: NcrMutation): Promise<void> {
  const carFactEvents = new Set(["EVT-NCR-SUBMIT-PLAN", "EVT-NCR-ACCEPT-PLAN", "EVT-NCR-READY-VERIFY", "EVT-NCR-CLOSE"]);
  if (carFactEvents.has(mutation.event.eventType)) throw new QualityDomainError("NCR_CAR_FACT_UOW_REQUIRED" as StableCode, "This transition requires CAR facts loaded inside the canonical UoW.");
  await unitOfWork.transact(async (context) => {
    if (mutation.expectedVersion === 0) {
      if (mutation.snapshot.version !== 1 || mutation.event.eventType !== "EVT-NCR-CREATE") throw new NcrCarConcurrencyError("NCR creation must be version 0 to 1.");
      await context.sourceLinks.assertExactLinks(mutation.snapshot.sourceLinks);
      await context.ncrs.insert(mutation.snapshot);
      await appendEvidence(context, mutation);
      return;
    }
    await saveNcrMutation(context, mutation);
  });
}

export async function persistCarMutation(unitOfWork: NcrCarUnitOfWork, mutation: CarMutation): Promise<void> {
  await unitOfWork.transact(async (context) => {
    if (mutation.expectedVersion === 0) {
      if (mutation.snapshot.version !== 1 || mutation.event.eventType !== "EVT-CAR-PROPOSE") throw new NcrCarConcurrencyError("CAR creation must be version 0 to 1.");
      await context.cars.assertNcrAllowsCar({ ncrId: mutation.snapshot.ncrId, ...(mutation.snapshot.contractId ? { contractId: mutation.snapshot.contractId } : {}), ...(mutation.snapshot.actionOwnerVendorId ? { actionOwnerVendorId: mutation.snapshot.actionOwnerVendorId } : {}) });
      await context.cars.insert(mutation.snapshot);
    } else {
      if (mutation.snapshot.version !== mutation.expectedVersion + 1 || !await context.cars.save(mutation.snapshot, mutation.expectedVersion)) throw new NcrCarConcurrencyError("CAR optimistic lock lost or version was not direct-next.");
    }
    if (mutation.immutableVerification) await context.cars.insertImmutableVerification(mutation.immutableVerification);
    await appendEvidence(context, mutation);
  });
}

async function loadNcrAndCarFacts(context: NcrCarTransactionContext, ncrId: Uuid): Promise<{ readonly aggregate: NonConformance; readonly facts: readonly RequiredCarFact[] }> {
  const snapshot = await context.ncrs.loadForUpdate(ncrId);
  if (!snapshot) throw new QualityDomainError("NCR_NOT_FOUND" as StableCode, "NCR was not found.");
  const facts = await context.cars.listFactsForNcrForUpdate(ncrId);
  return { aggregate: NonConformance.restore(snapshot), facts };
}

export async function submitNcrPlan(unitOfWork: NcrCarUnitOfWork, input: { readonly ncrId: Uuid; readonly command: QualityCommand; readonly evidenceIds: readonly Uuid[] }): Promise<NcrSnapshot> {
  return unitOfWork.transact(async (context) => { const { aggregate, facts } = await loadNcrAndCarFacts(context, input.ncrId); const mutation = aggregate.submitPlan(input.command, facts, input.evidenceIds); await saveNcrMutation(context, mutation); return mutation.snapshot; });
}
export async function acceptNcrPlan(unitOfWork: NcrCarUnitOfWork, input: { readonly ncrId: Uuid; readonly command: QualityCommand; readonly evidenceIds: readonly Uuid[] }): Promise<NcrSnapshot> {
  return unitOfWork.transact(async (context) => { const { aggregate, facts } = await loadNcrAndCarFacts(context, input.ncrId); const mutation = aggregate.acceptPlan(input.command, facts, input.evidenceIds); await saveNcrMutation(context, mutation); return mutation.snapshot; });
}
export async function readyNcrVerification(unitOfWork: NcrCarUnitOfWork, input: { readonly ncrId: Uuid; readonly command: QualityCommand; readonly evidenceIds: readonly Uuid[] }): Promise<NcrSnapshot> {
  return unitOfWork.transact(async (context) => { const { aggregate, facts } = await loadNcrAndCarFacts(context, input.ncrId); const mutation = aggregate.readyToVerify(input.command, facts, input.evidenceIds); await saveNcrMutation(context, mutation); return mutation.snapshot; });
}
export async function closeNcr(unitOfWork: NcrCarUnitOfWork, input: { readonly ncrId: Uuid; readonly command: QualityCommand; readonly reason: string; readonly evidenceIds: readonly Uuid[] }): Promise<NcrSnapshot> {
  return unitOfWork.transact(async (context) => { const { aggregate, facts } = await loadNcrAndCarFacts(context, input.ncrId); const mutation = aggregate.close(input.command, facts, { reason: input.reason, evidenceIds: input.evidenceIds }); await saveNcrMutation(context, mutation); return mutation.snapshot; });
}

/** A plan-review holder's Senior review is append-only evidence; it never creates an official Approval action. */
export interface SeniorCarReviewSnapshot { readonly seniorCarReviewId: Uuid; readonly carId: Uuid; readonly carVersion: Version; readonly reviewerUserId: Uuid; readonly reviewOutcome: "COMMENTED" | "RECOMMEND_ACCEPT" | "RECOMMEND_REWORK"; readonly comment: string; readonly evidenceIds: readonly Uuid[]; readonly reviewedAt: UtcInstant }
export interface SeniorCarReviewPort { appendReview(snapshot: SeniorCarReviewSnapshot): Promise<void> }
export async function appendSeniorCarReviewEvidence(port: SeniorCarReviewPort, actor: QualityActorSnapshot, snapshot: SeniorCarReviewSnapshot): Promise<void> {
  if (actor.actorKind !== "INTERNAL" || !actor.active || actor.userId !== snapshot.reviewerUserId || !actor.authorities.includes("ncr.plan.review" as StableCode)) throw new QualityDomainError("NCR_PLAN_REVIEW_PERMISSION_REQUIRED" as StableCode, "An active internal plan-review holder must author Senior review evidence.");
  if (!snapshot.comment.trim() || snapshot.evidenceIds.length === 0) throw new QualityDomainError("NCR_PLAN_REVIEW_EVIDENCE_REQUIRED" as StableCode, "Senior review evidence requires a comment and immutable evidence.");
  await port.appendReview(Object.freeze(structuredClone(snapshot)));
}

export interface NcrInternalListItemView { readonly ncrId: string; readonly ncrNo: string; readonly severity: NcrSnapshot["severity"]; readonly state: NcrSnapshot["state"]; readonly scopeSummary: string; readonly requiredCarCount: number; readonly responsibilityStatus?: NcrSnapshot["currentResponsibilityStatus"]; readonly version: number }
export interface NcrVendorListItemView { readonly ncrId: string; readonly ncrNo: string; readonly severity: NcrSnapshot["severity"]; readonly state: NcrSnapshot["state"]; readonly contractId: string; readonly deliverableVersionId?: string; readonly dueAt?: string; readonly scopeSummary: string; readonly containmentSummary?: string; readonly version: number }
export interface NcrVendorDetailView extends NcrVendorListItemView { readonly sourceLinks: readonly { readonly kind: NcrSourceLink["kind"]; readonly externalReference: string }[]; readonly assignedCars: readonly { readonly carId: string; readonly carNo: string; readonly required: boolean; readonly rootCause: string; readonly actionPlan: string; readonly dueAt: string; readonly state: CarSnapshot["state"]; readonly implementationEvidenceRequired: boolean; readonly version: number }[] }
export interface NcrInternalDetailView { readonly ncr: NcrSnapshot; readonly responsibilityHistory: readonly ResponsibilityAssessmentSnapshot[]; readonly cars: readonly CarSnapshot[] }
export type NcrInternalListResult = { readonly availability: "AVAILABLE"; readonly items: readonly NcrInternalListItemView[] } | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type NcrVendorListResult = { readonly availability: "AVAILABLE"; readonly items: readonly NcrVendorListItemView[] } | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type NcrVendorDetailResult = { readonly availability: "AVAILABLE"; readonly detail: NcrVendorDetailView } | { readonly availability: "FORBIDDEN" | "NOT_FOUND"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type NcrInternalDetailResult = { readonly availability: "AVAILABLE"; readonly detail: NcrInternalDetailView } | { readonly availability: "FORBIDDEN" | "NOT_FOUND"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface NcrCarQueryPort { listMineExternal(): Promise<NcrVendorListResult>; getMineExternal(ncrId: string): Promise<NcrVendorDetailResult>; getInternalDetail(ncrId: string): Promise<NcrInternalDetailResult> }

import type { StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import type { RequirementRevisionMutation, RequirementRevisionSnapshot, RequirementSnapshot, TestPlanVersionSnapshot, TestResultSnapshot } from "../domain/requirement-test.js";
import type { InspectionAttemptSnapshot, InspectionChecklistVersionSnapshot, InspectionDisposition, InspectionMutation, InspectionSnapshot, InspectionState } from "../domain/inspection.js";

export interface InspectionAttemptStorePort {
  insertImmutable(snapshot: InspectionAttemptSnapshot): Promise<void>;
}

export interface InspectionAttemptReadPort {
  getExactSealedAttempt(inspectionAttemptId: Uuid): Promise<InspectionAttemptSnapshot | null>;
}

export interface RequirementStorePort {
  insert(snapshot: RequirementSnapshot): Promise<void>;
  save(snapshot: RequirementSnapshot, expectedVersion: Version): Promise<boolean>;
  insertImmutableRevision(snapshot: RequirementRevisionSnapshot): Promise<void>;
}

export interface TestEvidenceStorePort {
  insertImmutablePlanVersion(snapshot: TestPlanVersionSnapshot): Promise<void>;
  insertImmutableResult(snapshot: TestResultSnapshot): Promise<void>;
}

export interface InspectionStorePort extends InspectionAttemptStorePort {
  insert(snapshot: InspectionSnapshot): Promise<void>;
  save(snapshot: InspectionSnapshot, expectedVersion: Version): Promise<boolean>;
  insertImmutableChecklistVersion(snapshot: InspectionChecklistVersionSnapshot): Promise<void>;
}

export interface InspectionEvidencePort {
  appendTransition(input: { readonly aggregateId: Uuid; readonly machineId: StableCode; readonly fromVersion: Version; readonly toVersion: Version; readonly eventType: StableCode; readonly occurredAt: UtcInstant }): Promise<void>;
  appendAudit(audit: InspectionMutation["audit"]): Promise<void>;
  enqueue(event: InspectionMutation["event"]): Promise<void>;
}

export interface FinalizedInspectionOutcome {
  readonly inspectionId: Uuid;
  readonly inspectionAttemptId: Uuid;
  readonly attemptChecksum: InspectionAttemptSnapshot["checksum"];
  readonly contractId: Uuid;
  readonly contractMilestoneId: Uuid;
  readonly deliverableId: Uuid;
  readonly deliverableVersionId: Uuid;
  readonly disposition: InspectionDisposition;
  readonly achievementPercent: string;
  readonly policyId: StableCode;
  readonly policyVersion: number;
  readonly independentlyUsablePortions: InspectionAttemptSnapshot["independentlyUsablePortions"];
  readonly residualConditions: InspectionAttemptSnapshot["residualConditions"];
  readonly acceptanceDoesNotWaiveVendorResponsibility: true;
  readonly paymentDoesNotWaiveVendorResponsibility: true;
}

/** Cross-process port only. The Quality module never creates an AcceptancePaymentDecision or transfers funds. */
export interface AcceptancePaymentProcessPort {
  recordFinalizedInspection(outcome: FinalizedInspectionOutcome): Promise<void>;
}

export interface QualityTransactionContext {
  readonly requirements: RequirementStorePort;
  readonly tests: TestEvidenceStorePort;
  readonly inspections: InspectionStorePort;
  readonly inspectionAttempts: InspectionAttemptReadPort;
  readonly evidence: InspectionEvidencePort;
  readonly acceptancePayment: AcceptancePaymentProcessPort;
}

export interface QualityUnitOfWork {
  transact<T>(work: (context: QualityTransactionContext) => Promise<T>): Promise<T>;
}

export class QualityConcurrencyError extends Error {
  public readonly code = "QUALITY_STALE_VERSION" as StableCode;
}

export async function persistRequirementRevision(unitOfWork: QualityUnitOfWork, mutation: RequirementRevisionMutation): Promise<void> {
  await unitOfWork.transact(async (context) => {
    if (mutation.expectedVersion === 0) {
      if (mutation.snapshot.version !== 1 || mutation.immutableRevision.revisionNo !== 1) throw new QualityConcurrencyError("Requirement creation must be the canonical version 0 to 1 transition.");
      await context.requirements.insert(mutation.snapshot);
    } else {
      if (mutation.snapshot.version !== mutation.expectedVersion + 1 || mutation.immutableRevision.revisionNo !== mutation.snapshot.currentRevisionNo) throw new QualityConcurrencyError("Requirement revision must be direct-next.");
      const saved = await context.requirements.save(mutation.snapshot, mutation.expectedVersion);
      if (!saved) throw new QualityConcurrencyError("Requirement optimistic lock lost.");
    }
    await context.requirements.insertImmutableRevision(mutation.immutableRevision);
  });
}

export async function persistImmutableTestPlanVersion(unitOfWork: QualityUnitOfWork, snapshot: TestPlanVersionSnapshot): Promise<void> {
  await unitOfWork.transact(async (context) => context.tests.insertImmutablePlanVersion(snapshot));
}

export async function persistImmutableTestResult(unitOfWork: QualityUnitOfWork, snapshot: TestResultSnapshot): Promise<void> {
  await unitOfWork.transact(async (context) => context.tests.insertImmutableResult(snapshot));
}

export async function persistImmutableInspectionChecklist(unitOfWork: QualityUnitOfWork, snapshot: InspectionChecklistVersionSnapshot): Promise<void> {
  await unitOfWork.transact(async (context) => context.inspections.insertImmutableChecklistVersion(snapshot));
}

function finalizedOutcome(mutation: InspectionMutation, attempt: InspectionAttemptSnapshot): FinalizedInspectionOutcome {
  return {
    inspectionId: mutation.snapshot.inspectionId,
    inspectionAttemptId: attempt.inspectionAttemptId,
    attemptChecksum: attempt.checksum,
    contractId: attempt.contractId,
    contractMilestoneId: attempt.contractMilestoneId,
    deliverableId: attempt.deliverableId,
    deliverableVersionId: attempt.deliverableVersionId,
    disposition: attempt.disposition,
    achievementPercent: attempt.achievementPercent,
    policyId: attempt.policyId,
    policyVersion: attempt.policyVersion,
    independentlyUsablePortions: attempt.independentlyUsablePortions,
    residualConditions: attempt.residualConditions,
    acceptanceDoesNotWaiveVendorResponsibility: true,
    paymentDoesNotWaiveVendorResponsibility: true
  };
}

export async function persistInspectionMutation(unitOfWork: QualityUnitOfWork, mutation: InspectionMutation): Promise<void> {
  await unitOfWork.transact(async (context) => {
    if (mutation.expectedVersion === 0) {
      if (mutation.snapshot.version !== 1 || mutation.event.eventType !== "EVT-INSPECTION-REQUEST") throw new QualityConcurrencyError("Inspection creation must be the canonical version 0 to 1 transition.");
      await context.inspections.insert(mutation.snapshot);
    } else {
      if (mutation.snapshot.version !== mutation.expectedVersion + 1) throw new QualityConcurrencyError("Inspection transition must be direct-next.");
      const saved = await context.inspections.save(mutation.snapshot, mutation.expectedVersion);
      if (!saved) throw new QualityConcurrencyError("Inspection optimistic lock lost.");
    }
    if (mutation.immutableAttempt) await context.inspections.insertImmutable(mutation.immutableAttempt);
    await context.evidence.appendTransition({ aggregateId: mutation.snapshot.inspectionId, machineId: mutation.event.machineId as StableCode, fromVersion: mutation.expectedVersion, toVersion: mutation.snapshot.version, eventType: mutation.event.eventType, occurredAt: mutation.event.occurredAt });
    await context.evidence.appendAudit(mutation.audit);
    await context.evidence.enqueue(mutation.event);
    if (mutation.snapshot.state === "COMPLETED") {
      if (!mutation.snapshot.latestSealedAttemptId) throw new Error("INSPECTION_FINAL_ATTEMPT_REQUIRED");
      const exactAttempt = await context.inspectionAttempts.getExactSealedAttempt(mutation.snapshot.latestSealedAttemptId);
      if (!exactAttempt || exactAttempt.inspectionId !== mutation.snapshot.inspectionId || exactAttempt.inspectionAttemptId !== mutation.snapshot.latestSealedAttemptId || exactAttempt.attemptNo !== mutation.snapshot.latestAttemptNo || exactAttempt.disposition !== mutation.snapshot.finalDisposition) throw new Error("INSPECTION_FINAL_ATTEMPT_MISMATCH");
      await context.acceptancePayment.recordFinalizedInspection(finalizedOutcome(mutation, exactAttempt));
    }
  });
}

export interface VendorInspectionExternalListItem {
  readonly inspectionId: string;
  readonly inspectionNo: string;
  readonly inspectionTypeCode: string;
  readonly contractId: string;
  readonly contractMilestoneId: string;
  readonly deliverableId: string;
  readonly deliverableVersionId: string;
  readonly state: InspectionState;
  readonly latestExternalDisposition?: InspectionDisposition;
  readonly version: number;
}

export interface VendorCorrectionRequestExternal {
  readonly inspectionId: string;
  readonly inspectionAttemptId: string;
  readonly requestedAt: string;
  readonly reason: string;
  readonly dueAt?: string;
}

export interface VendorInspectionExternalDetail extends VendorInspectionExternalListItem {
  readonly correctionRequest?: VendorCorrectionRequestExternal;
  readonly attemptHistory: readonly {
    readonly inspectionAttemptId: string;
    readonly attemptNo: number;
    readonly disposition: InspectionDisposition;
    readonly achievementPercent: string;
    readonly sealedAt: string;
    readonly residualConditions: InspectionAttemptSnapshot["residualConditions"];
  }[];
}

export interface InternalInspectionDetail {
  readonly inspection: InspectionSnapshot;
  readonly checklist: InspectionChecklistVersionSnapshot;
  readonly attempts: readonly InspectionAttemptSnapshot[];
}

export type InspectionExternalListResult = { readonly availability: "AVAILABLE"; readonly items: readonly VendorInspectionExternalListItem[] } | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type InspectionExternalDetailResult = { readonly availability: "AVAILABLE"; readonly detail: VendorInspectionExternalDetail } | { readonly availability: "NOT_FOUND" | "FORBIDDEN"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type InspectionInternalDetailResult = { readonly availability: "AVAILABLE"; readonly detail: InternalInspectionDetail } | { readonly availability: "NOT_FOUND" | "FORBIDDEN"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };

export interface InspectionQueryPort {
  listMineExternal(): Promise<InspectionExternalListResult>;
  getMineExternal(inspectionId: string): Promise<InspectionExternalDetailResult>;
  getInternalDetail(inspectionId: string): Promise<InspectionInternalDetailResult>;
}

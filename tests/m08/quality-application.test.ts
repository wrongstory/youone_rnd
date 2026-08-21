import { describe, expect, it, vi } from "vitest";
import { persistInspectionMutation, persistRequirementRevision, type QualityTransactionContext, type VendorInspectionExternalListItem } from "../../packages/features/quality/src/application/contracts.js";
import { INITIAL_ACCEPTANCE_POLICY_V1, Inspection, createInspectionChecklistVersion, sealInspectionAttempt, type InspectionActorSnapshot } from "../../packages/features/quality/src/domain/inspection.js";
import { Requirement } from "../../packages/features/quality/src/domain/requirement-test.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const id = (n: number) => uuid(`83000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const inspector: InspectionActorSnapshot = { actorKind: "INTERNAL", userId: id(1), active: true, authorities: [stableCode("INSPECTOR"), stableCode("INSPECTION_DECIDER")] };
const command = (expected: number) => ({ actor: inspector, at: utcInstant("2026-08-22T08:00:00Z"), expectedVersion: version(expected), eventId: id(2), correlationId: correlationId("m08-app"), idempotencyKey: idempotencyKey(`m08-app-${expected}`) });

function context(saveInspection = vi.fn(async () => true), exactAttempt: Awaited<ReturnType<QualityTransactionContext["inspectionAttempts"]["getExactSealedAttempt"]>> = null) {
  return {
    requirements: { insert: vi.fn(async () => undefined), save: vi.fn(async () => true), insertImmutableRevision: vi.fn(async () => undefined) },
    tests: { insertImmutablePlanVersion: vi.fn(async () => undefined), insertImmutableResult: vi.fn(async () => undefined) },
    inspections: { insert: vi.fn(async () => undefined), save: saveInspection, insertImmutableChecklistVersion: vi.fn(async () => undefined), insertImmutable: vi.fn(async () => undefined) },
    inspectionAttempts: { getExactSealedAttempt: vi.fn(async () => exactAttempt) },
    evidence: { appendTransition: vi.fn(async () => undefined), appendAudit: vi.fn(async () => undefined), enqueue: vi.fn(async () => undefined) },
    acceptancePayment: { recordFinalizedInspection: vi.fn(async () => undefined) }
  } satisfies QualityTransactionContext;
}

function submittedInspection() {
  const inspectionId = id(10), checklistId = id(11), attemptId = id(12), contractId = id(13), milestoneId = id(14), deliverableId = id(15), deliverableVersionId = id(16);
  const checklist = createInspectionChecklistVersion({ inspectionChecklistVersionId: checklistId, inspectionId, versionNo: 1, policy: INITIAL_ACCEPTANCE_POLICY_V1, criteria: [{ inspectionCriterionId: id(17), inspectionChecklistVersionId: checklistId, sequenceNo: 1, criterionCode: stableCode("CRITERION.ALL"), title: "전체", weightPercent: "100", critical: true, requiredEvidence: [stableCode("EVIDENCE.TEST")], measurementRule: "시험", passRule: "전부 통과" }], checksum: sha256("a".repeat(64)), sealedAt: utcInstant("2026-08-22T07:00:00Z"), sealedByUserId: id(1) });
  const attempt = sealInspectionAttempt({ inspectionAttemptId: attemptId, inspectionId, attemptNo: 1, contractId, contractMilestoneId: milestoneId, deliverableId, deliverableVersionId, criterionResults: [{ inspectionCriterionResultId: id(18), inspectionAttemptId: attemptId, inspectionCriterionId: id(17), achievedPercent: "100", verdict: "PASS", observedValue: "통과", evidenceIds: [id(19)] }], inspectorUserId: id(1), checksum: sha256("b".repeat(64)), sealedAt: utcInstant("2026-08-22T08:00:00Z") }, checklist);
  const request = Inspection.request({ inspectionId, inspectionNo: "INSP-APP-1", inspectionTypeCode: stableCode("INSPECTION.DELIVERABLE"), contractId, contractMilestoneId: milestoneId, deliverableId, deliverableVersionId, assignedVendorId: id(20), inspectionChecklistVersionId: checklistId }, { ...command(0), actor: inspector });
  const aggregate = Inspection.restore({ ...request.snapshot, state: "IN_PROGRESS", scheduledAt: utcInstant("2026-08-22T07:30:00Z"), openAttemptId: attemptId, openAttemptNo: 1, version: version(3) });
  return { aggregate, attempt };
}

describe("Quality application transaction boundary", () => {
  it("persists a Requirement root and revision in one unit of work", async () => {
    const mutation = Requirement.create({ requirementId: id(21), requirementCode: "REQ-APP", title: "요구사항" }, { requirementRevisionId: id(22), criticality: "NORMAL", target: "완료", acceptanceRule: "체크리스트 통과", changeReason: "최초", createdByUserId: id(1), createdAt: utcInstant("2026-08-22T08:00:00Z") }, utcInstant("2026-08-22T08:00:00Z"));
    const ctx = context();
    await persistRequirementRevision({ transact: async (work) => work(ctx) }, mutation);
    expect(ctx.requirements.insert).toHaveBeenCalledOnce();
    expect(ctx.requirements.insertImmutableRevision).toHaveBeenCalledWith(expect.objectContaining({ revisionNo: 1 }));
  });

  it("stores the sealed attempt, state, audit and outbox atomically", async () => {
    const { aggregate, attempt } = submittedInspection();
    const mutation = aggregate.submitDecision(command(3), attempt);
    const ctx = context();
    await persistInspectionMutation({ transact: async (work) => work(ctx) }, mutation);
    expect(ctx.inspections.save).toHaveBeenCalledWith(expect.objectContaining({ state: "DECISION_PENDING" }), 3);
    expect(ctx.inspections.insertImmutable).toHaveBeenCalledWith(expect.objectContaining({ inspectionAttemptId: attempt.inspectionAttemptId, state: "SEALED" }));
    expect(ctx.evidence.appendAudit).toHaveBeenCalledOnce();
    expect(ctx.evidence.enqueue).toHaveBeenCalledOnce();
  });

  it("does not insert an attempt or evidence after an optimistic lock loss", async () => {
    const { aggregate, attempt } = submittedInspection();
    const mutation = aggregate.submitDecision(command(3), attempt);
    const ctx = context(vi.fn(async () => false));
    await expect(persistInspectionMutation({ transact: async (work) => work(ctx) }, mutation)).rejects.toThrow("optimistic lock");
    expect(ctx.inspections.insertImmutable).not.toHaveBeenCalled();
    expect(ctx.evidence.appendAudit).not.toHaveBeenCalled();
  });

  it("hands an exact sealed non-waiver basis to the payment process without creating a decision", async () => {
    const { aggregate, attempt } = submittedInspection();
    aggregate.submitDecision(command(3), attempt);
    const completed = aggregate.accept(command(4), attempt);
    const ctx = context(vi.fn(async () => true), attempt);
    await persistInspectionMutation({ transact: async (work) => work(ctx) }, completed);
    expect(ctx.acceptancePayment.recordFinalizedInspection).toHaveBeenCalledWith(expect.objectContaining({ inspectionAttemptId: attempt.inspectionAttemptId, attemptChecksum: attempt.checksum, achievementPercent: "100", acceptanceDoesNotWaiveVendorResponsibility: true, paymentDoesNotWaiveVendorResponsibility: true }));
    expect(ctx.acceptancePayment.recordFinalizedInspection.mock.calls[0]![0]).not.toHaveProperty("finalPaymentRate");
  });

  it("keeps finance and internal opinion out of Vendor external list DTO", () => {
    type Forbidden = Extract<keyof VendorInspectionExternalListItem, "contractAmount" | "plannedAmount" | "paymentRate" | "paymentStatus" | "internalOpinion" | "internalEvaluation">;
    const hasNoForbidden: Forbidden extends never ? true : false = true;
    const item: VendorInspectionExternalListItem = { inspectionId: id(10), inspectionNo: "INSP-APP-1", inspectionTypeCode: "INSPECTION.DELIVERABLE", contractId: id(13), contractMilestoneId: id(14), deliverableId: id(15), deliverableVersionId: id(16), state: "DECISION_PENDING", version: 4 };
    expect(hasNoForbidden).toBe(true);
    expect(item).not.toHaveProperty("paymentRate");
    expect(item).not.toHaveProperty("internalOpinion");
  });
});

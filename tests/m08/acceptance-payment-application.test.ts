import { describe, expect, it, vi } from "vitest";
import type { ApprovalActorSnapshot } from "../../packages/core/approval/src/public.js";
import type { FinalizedInspectionOutcome, InspectionAttemptSnapshot } from "../../packages/features/quality/src/public.js";
import {
  FinalizedInspectionAcceptancePaymentAdapter,
  calculateAcceptancePayment,
  proposeAcceptancePaymentAdjustment,
  submitAcceptancePaymentForApproval,
  type AcceptancePaymentDecisionSnapshot,
  type AcceptancePaymentPolicyVersionSnapshot,
  type AcceptancePaymentTransactionContext,
  type AcceptancePaymentUnitOfWork
} from "../../packages/processes/vendor-acceptance-payment/src/public.js";
import { correlationId, idempotencyKey, money, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const id = (n: number) => uuid(`83000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const attemptId = id(1), inspectionId = id(2), checklistId = id(3), contractId = id(4), milestoneId = id(5), deliverableId = id(6), deliverableVersionId = id(7), policyVersionId = id(8), decisionId = id(9), rootId = id(10), eventId = id(11), managerId = id(12), adjustmentId = id(13), evidenceId = id(14), approvalId = id(15);
const at = utcInstant("2026-08-22T08:00:00Z");
const system: ApprovalActorSnapshot & { actorType: "SYSTEM"; accountKind: "SYSTEM" } = { actorType: "SYSTEM", accountKind: "SYSTEM", positionIds: [], roleIds: [] };
const manager: ApprovalActorSnapshot = { actorType: "USER", accountKind: "INTERNAL", authenticatedUserId: managerId, effectiveUserId: managerId, positionIds: [], roleIds: [stableCode("ROLE_CONTRACT_MANAGER")] };

function attempt(): InspectionAttemptSnapshot {
  return { inspectionAttemptId: attemptId, inspectionId, attemptNo: 1, state: "SEALED", sealedAt: utcInstant("2026-08-22T07:00:00Z"), checksum: sha256("a".repeat(64)), inspectionChecklistVersionId: checklistId, policyId: stableCode("POL-ACCEPTANCE-PAYMENT-V1"), policyVersion: 1, contractId, contractMilestoneId: milestoneId, deliverableId, deliverableVersionId, disposition: "PARTIAL_ACCEPTANCE", achievementPercent: "75", criterionResults: [], evidenceIds: [evidenceId], criticalFailureCriterionIds: [], independentlyUsablePortions: [{ portionCode: stableCode("PORTION.CONTROLLER"), description: "제어기", deliverableVersionId, evidenceIds: [evidenceId] }], residualConditions: [], inspectorUserId: managerId };
}
function policy(): AcceptancePaymentPolicyVersionSnapshot {
  return { policyVersionId, policyId: stableCode("POL-ACCEPTANCE-PAYMENT-V1"), version: 1, checksum: sha256("b".repeat(64)), state: "PUBLISHED", effectiveFrom: utcInstant("2026-01-01T00:00:00Z"), basis: { kind: "INTERNAL_PRESET", referenceId: stableCode("BASELINE.ACCEPTANCE.V1"), version: 1 }, amountRoundingDecimalPlaces: 2, amountRoundingMode: "HALF_UP", rateRules: [{ ruleId: stableCode("RATE.PARTIAL"), minimumAchievementInclusive: "0", disposition: "PARTIAL_ACCEPTANCE", proposedRate: { kind: "ACHIEVEMENT_PERCENT" } }] };
}
function command(expected: number, actor: ApprovalActorSnapshot = manager) { return { actor, at, expectedVersion: version(expected), correlationId: correlationId(`m08-app-${expected}`), idempotencyKey: idempotencyKey(`m08-app-${expected}`), eventId }; }
function createInput() { return { acceptancePaymentDecisionId: decisionId, decisionRootId: rootId, revisionNo: 1, inspectionAttemptId: attemptId, policyVersionId, milestoneAmount: money("10000000", "KRW"), command: { actor: system, at, correlationId: correlationId("m08-create"), idempotencyKey: idempotencyKey("m08-create"), eventId } }; }

function setup(input: { save?: boolean; exactAttempt?: InspectionAttemptSnapshot | null; exactPolicy?: AcceptancePaymentPolicyVersionSnapshot | null } = {}) {
  let stored: AcceptancePaymentDecisionSnapshot | null = null;
  const calls: string[] = [];
  const context: AcceptancePaymentTransactionContext = {
    decisions: {
      insert: async (snapshot) => { calls.push("insert"); stored = snapshot; },
      loadExact: async () => stored,
      loadForUpdate: async () => stored,
      save: async (snapshot) => { calls.push("save"); if (input.save === false) return false; stored = snapshot; return true; },
      assertDirectNewerLineage: async () => { calls.push("lineage"); }
    },
    policies: { loadExact: async () => input.exactPolicy === undefined ? policy() : input.exactPolicy },
    inspectionAttempts: { getExactSealedAttempt: async () => input.exactAttempt === undefined ? attempt() : input.exactAttempt },
    authorization: { assertMayCreate: async () => { calls.push("authorize-create"); }, assertContractOwner: async () => { calls.push("authorize-owner"); }, assertMayRelease: async () => { calls.push("authorize-release"); } },
    hashes: { computeExactChecksum: async () => sha256("c".repeat(64)) },
    evidence: { appendTransition: async () => { calls.push("transition"); }, appendAudit: async () => { calls.push("audit"); }, enqueue: async () => { calls.push("outbox"); } }
  };
  const unit: AcceptancePaymentUnitOfWork = { transact: async (work) => { calls.push("begin"); const result = await work(context); calls.push("commit"); return result; } };
  return { unit, calls, get stored() { return stored; } };
}

describe("AcceptancePayment application transaction boundary", () => {
  it("creates from the exact sealed attempt and appends transition, audit and outbox in one UnitOfWork", async () => {
    const fixture = setup();
    const created = await calculateAcceptancePayment(fixture.unit, createInput());
    expect(created).toMatchObject({ state: "CALCULATED", calculatedProposedRate: "75", basis: { inspectionAttemptId: attemptId, independentlyUsablePortions: [{ portionCode: "PORTION.CONTROLLER", deliverableVersionId }] } });
    expect(fixture.calls).toEqual(["begin", "authorize-create", "insert", "transition", "audit", "outbox", "commit"]);
  });

  it("rejects a policy that is not the exact policy version used by the attempt", async () => {
    const fixture = setup({ exactPolicy: { ...policy(), version: 2 } });
    await expect(calculateAcceptancePayment(fixture.unit, createInput())).rejects.toMatchObject({ code: "ACCEPTANCE_PAYMENT_POLICY_VERSION_MISMATCH" });
    expect(fixture.calls).not.toContain("insert");
  });

  it("authorizes adjustment and submission server-side and fails closed on optimistic concurrency", async () => {
    const fixture = setup();
    await calculateAcceptancePayment(fixture.unit, createInput());
    const adjusted = await proposeAcceptancePaymentAdjustment(fixture.unit, { acceptancePaymentDecisionId: decisionId, adjustmentId, requestedRate: "80", reason: "추가 성능증빙", evidenceIds: [evidenceId], command: command(1) });
    expect(adjusted).toMatchObject({ calculatedProposedRate: "75", adjustedRequestedRate: "80", adjustment: { direction: "UPWARD" } });
    const pending = await submitAcceptancePaymentForApproval(fixture.unit, { acceptancePaymentDecisionId: decisionId, approvalInstanceId: approvalId, command: command(2) });
    expect(pending).toMatchObject({ state: "APPROVAL_PENDING", sealedSnapshotChecksum: sha256("c".repeat(64)), approvalInstanceId: approvalId });

    const lost = setup({ save: false });
    await calculateAcceptancePayment(lost.unit, createInput());
    await expect(proposeAcceptancePaymentAdjustment(lost.unit, { acceptancePaymentDecisionId: decisionId, adjustmentId, requestedRate: "70", reason: "하향", evidenceIds: [evidenceId], command: command(1) })).rejects.toMatchObject({ code: "ACCEPTANCE_PAYMENT_STALE_VERSION" });
  });

  it("revalidates the Quality finalization handoff and never treats it as a transfer", async () => {
    const fixture = setup();
    const resolve = vi.fn(async () => createInput());
    const adapter = new FinalizedInspectionAcceptancePaymentAdapter(fixture.unit, { resolve });
    const outcome: FinalizedInspectionOutcome = { inspectionId, inspectionAttemptId: attemptId, attemptChecksum: sha256("a".repeat(64)), contractId, contractMilestoneId: milestoneId, deliverableId, deliverableVersionId, disposition: "PARTIAL_ACCEPTANCE", achievementPercent: "75", policyId: stableCode("POL-ACCEPTANCE-PAYMENT-V1"), policyVersion: 1, independentlyUsablePortions: attempt().independentlyUsablePortions, residualConditions: [], acceptanceDoesNotWaiveVendorResponsibility: true, paymentDoesNotWaiveVendorResponsibility: true };
    await adapter.recordFinalizedInspection(outcome);
    expect(fixture.stored).toMatchObject({ state: "CALCULATED", responsibility: { externalTransferExecuted: false } });
    await expect(adapter.recordFinalizedInspection({ ...outcome, achievementPercent: "80" })).rejects.toMatchObject({ code: "ACCEPTANCE_PAYMENT_INSPECTION_OUTCOME_MISMATCH" });
  });
});

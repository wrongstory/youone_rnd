import { describe, expect, it } from "vitest";
import type { ApprovalActorSnapshot } from "../../packages/core/approval/src/public.js";
import {
  ACCEPTANCE_RESPONSIBILITY_INVARIANT,
  AcceptancePaymentDecision,
  type AcceptancePaymentDecisionSnapshot,
  type AcceptancePaymentPolicyVersionSnapshot,
  type AcceptancePaymentSystemCommand,
  type SealedInspectionAttemptBasis
} from "../../packages/processes/vendor-acceptance-payment/src/public.js";
import { correlationId, idempotencyKey, money, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const ids = Array.from({ length: 30 }, (_, index) => uuid(`81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`));
const [decisionId, rootId, attemptId, inspectionId, checklistId, contractId, milestoneId, deliverableId, deliverableVersionId, policyVersionId, eventId, managerId, approvalId, adjustmentId, evidenceId, portionId] = ids as [ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>];

const at = utcInstant("2026-08-22T06:00:00Z");
const system: ApprovalActorSnapshot & { actorType: "SYSTEM"; accountKind: "SYSTEM" } = { actorType: "SYSTEM", accountKind: "SYSTEM", positionIds: [], roleIds: [] };
const manager: ApprovalActorSnapshot = { actorType: "USER", accountKind: "INTERNAL", authenticatedUserId: managerId, effectiveUserId: managerId, positionIds: [], roleIds: [stableCode("ROLE_CONTRACT_MANAGER")] };
function command(expected: number, actor: ApprovalActorSnapshot = manager) { return { actor, at, expectedVersion: version(expected), correlationId: correlationId(`m08-${expected}`), idempotencyKey: idempotencyKey(`m08-${expected}`), eventId }; }
function systemCommand(expected: number): AcceptancePaymentSystemCommand { return { ...command(expected, system), actor: system }; }
function systemBase(): Omit<AcceptancePaymentSystemCommand, "expectedVersion"> { const { expectedVersion: _expectedVersion, ...base } = systemCommand(0); void _expectedVersion; return base; }

function policy(): AcceptancePaymentPolicyVersionSnapshot {
  return {
    policyVersionId,
    policyId: stableCode("POL-ACCEPTANCE-PAYMENT-V1"),
    version: 1,
    checksum: sha256("a".repeat(64)),
    state: "PUBLISHED",
    effectiveFrom: utcInstant("2026-01-01T00:00:00Z"),
    basis: { kind: "INTERNAL_PRESET", referenceId: stableCode("BASELINE.ACCEPTANCE.V1"), version: 1 },
    rateRules: [
      { ruleId: stableCode("RATE.ACCEPTED"), minimumAchievementInclusive: "100", disposition: "ACCEPTED", proposedRate: { kind: "FIXED", value: "100" } },
      { ruleId: stableCode("RATE.CONDITIONAL"), minimumAchievementInclusive: "90", maximumAchievementExclusive: "100", disposition: "CONDITIONAL_ACCEPTANCE", proposedRate: { kind: "ACHIEVEMENT_PERCENT" } },
      { ruleId: stableCode("RATE.PARTIAL"), minimumAchievementInclusive: "60", maximumAchievementExclusive: "90", disposition: "PARTIAL_ACCEPTANCE", proposedRate: { kind: "ACHIEVEMENT_PERCENT" } },
      { ruleId: stableCode("RATE.REJECTED"), minimumAchievementInclusive: "0", maximumAchievementExclusive: "60", disposition: "REJECTED", proposedRate: { kind: "ZERO" } }
    ]
  };
}

function basis(input: Partial<SealedInspectionAttemptBasis> = {}): SealedInspectionAttemptBasis {
  return {
    inspectionAttemptId: attemptId,
    inspectionId,
    attemptNo: 1,
    checksum: sha256("b".repeat(64)),
    sealedAt: utcInstant("2026-08-22T05:00:00Z"),
    inspectionChecklistVersionId: checklistId,
    contractId,
    contractMilestoneId: milestoneId,
    deliverableId,
    deliverableVersionId,
    disposition: "CONDITIONAL_ACCEPTANCE",
    achievementPercent: "95",
    evidenceIds: [evidenceId],
    criticalFailureCriterionIds: [],
    independentlyUsablePortions: [],
    residualConditions: [{ conditionCode: stableCode("COND.REMAINING.TEST"), description: "잔여 성능시험", evidenceIds: [evidenceId] }],
    ...input
  };
}

function calculated(input: Partial<SealedInspectionAttemptBasis> = {}): AcceptancePaymentDecisionSnapshot {
  return AcceptancePaymentDecision.calculate({ acceptancePaymentDecisionId: decisionId, decisionRootId: rootId, revisionNo: 1, basis: basis(input), policy: policy(), milestoneAmount: money("10000000", "KRW") }, systemBase()).snapshot;
}

function approved(input: Partial<SealedInspectionAttemptBasis> = {}, requestedRate?: string): AcceptancePaymentDecisionSnapshot {
  let snapshot = calculated(input);
  if (requestedRate !== undefined) snapshot = AcceptancePaymentDecision.restore(snapshot).proposeAdjustment(command(1), { adjustmentId, requestedRate, reason: "증빙에 따른 조정", evidenceIds: [evidenceId] }).snapshot;
  const pending = AcceptancePaymentDecision.restore(snapshot).submitForApproval(command(snapshot.version), { approvalInstanceId: approvalId, checksum: sha256("c".repeat(64)) }).snapshot;
  return AcceptancePaymentDecision.restore(pending).applyApprovedOutcome(systemCommand(pending.version), {
    approvalInstanceId: approvalId,
    approvalVersion: version(4),
    subjectDecisionId: decisionId,
    subjectVersion: pending.approvalSubjectVersion!,
    subjectChecksum: pending.sealedSnapshotChecksum!,
    outcome: "APPROVED",
    finalApprovedRate: requestedRate ?? pending.calculatedProposedRate,
    approvedAt: at
  }).snapshot;
}

describe("SM-ACCEPTANCE-PAYMENT-V1", () => {
  it("calculates from versioned policy data and preserves the exact sealed attempt", () => {
    const snapshot = calculated();
    expect(snapshot).toMatchObject({ state: "CALCULATED", achievementPercent: "95", calculatedProposedRate: "95", basis: { inspectionAttemptId: attemptId, checksum: sha256("b".repeat(64)) } });
    expect(snapshot.responsibility).toEqual(ACCEPTANCE_RESPONSIBILITY_INVARIANT);
  });

  it("preserves calculated, requested adjustment, and final approved rates separately", () => {
    const snapshot = approved({}, "97.5");
    expect(snapshot).toMatchObject({ state: "APPROVED", calculatedProposedRate: "95", adjustedRequestedRate: "97.5", finalApprovedRate: "97.5", adjustment: { direction: "UPWARD", reason: "증빙에 따른 조정" } });
    expect(snapshot.state).not.toBe("ELIGIBLE_FOR_EXTERNAL_PAYMENT");
  });

  it("prevents Approval from creating an evidence-free final-rate adjustment", () => {
    const current = calculated();
    const pending = AcceptancePaymentDecision.restore(current).submitForApproval(command(current.version), { approvalInstanceId: approvalId, checksum: sha256("c".repeat(64)) }).snapshot;
    expect(() => AcceptancePaymentDecision.restore(pending).applyApprovedOutcome(systemCommand(pending.version), {
      approvalInstanceId: approvalId,
      approvalVersion: version(4),
      subjectDecisionId: decisionId,
      subjectVersion: pending.approvalSubjectVersion!,
      subjectChecksum: pending.sealedSnapshotChecksum!,
      outcome: "APPROVED",
      finalApprovedRate: "97",
      approvedAt: at
    })).toThrowError(expect.objectContaining({ code: "ACCEPTANCE_PAYMENT_APPROVED_RATE_MISMATCH" }));
  });

  it("requires reason, evidence and a 0-100 rate for every adjustment", () => {
    const aggregate = AcceptancePaymentDecision.restore(calculated());
    expect(() => aggregate.proposeAdjustment(command(1), { adjustmentId, requestedRate: "101", reason: "상향", evidenceIds: [evidenceId] })).toThrowError(expect.objectContaining({ code: "ACCEPTANCE_PAYMENT_ADJUSTMENT_RATE_INVALID" }));
    expect(() => aggregate.proposeAdjustment(command(1), { adjustmentId, requestedRate: "90", reason: "", evidenceIds: [evidenceId] })).toThrowError(expect.objectContaining({ code: "ACCEPTANCE_PAYMENT_ADJUSTMENT_REASON_REQUIRED" }));
    expect(() => aggregate.proposeAdjustment(command(1), { adjustmentId, requestedRate: "90", reason: "하향", evidenceIds: [] })).toThrowError(expect.objectContaining({ code: "ACCEPTANCE_PAYMENT_ADJUSTMENT_EVIDENCE_REQUIRED" }));
  });

  it("holds conditional acceptance with exact residual condition, due date and held amount", () => {
    const initial = approved();
    const held = AcceptancePaymentDecision.restore(initial).holdForConditions(systemCommand(initial.version), {
      residualConditions: [{ residualConditionId: ids[17]!, sourceConditionCode: stableCode("COND.REMAINING.TEST"), description: "잔여 성능시험", dueDate: "2026-09-10", evidenceIds: [evidenceId], state: "OPEN" }],
      independentlyUsablePortions: [],
      heldAmount: money("500000", "KRW"),
      unpaidRemainder: money("500000", "KRW")
    }).snapshot;
    expect(held).toMatchObject({ state: "HELD_FOR_CONDITIONS", heldAmount: { amount: "500000" }, unpaidRemainder: { amount: "500000" } });
    expect(() => AcceptancePaymentDecision.restore(held).markEligibleForExternalPayment(command(held.version))).toThrowError(expect.objectContaining({ code: "ACCEPTANCE_PAYMENT_RESIDUAL_CONDITIONS_OPEN" }));
    const satisfied = AcceptancePaymentDecision.restore(held).satisfyResidualCondition(command(held.version), { residualConditionId: ids[17]!, evidenceIds: [ids[18]!] }).snapshot;
    expect(satisfied.residualConditions[0]).toMatchObject({ state: "SATISFIED", satisfiedByUserId: managerId, satisfactionEvidenceIds: [ids[18]!] });
    expect(AcceptancePaymentDecision.restore(satisfied).markEligibleForExternalPayment(command(satisfied.version)).snapshot.state).toBe("ELIGIBLE_FOR_EXTERNAL_PAYMENT");
    expect(() => AcceptancePaymentDecision.restore(initial).holdForConditions(systemCommand(initial.version), {
      residualConditions: [{ residualConditionId: ids[17]!, sourceConditionCode: stableCode("COND.REMAINING.TEST"), description: "잔여 성능시험", dueDate: "2026-09-10", evidenceIds: [evidenceId], state: "OPEN" }],
      independentlyUsablePortions: [],
      heldAmount: money("500000", "KRW"),
      unpaidRemainder: money("400000", "KRW")
    })).toThrowError(expect.objectContaining({ code: "ACCEPTANCE_PAYMENT_HOLD_REMAINDER_MISMATCH" }));
  });

  it("releases only independently usable partial portions while preserving unpaid remainder", () => {
    const partial = approved({ disposition: "PARTIAL_ACCEPTANCE", achievementPercent: "75", residualConditions: [], independentlyUsablePortions: [{ portionCode: stableCode("PORTION.CONTROLLER"), description: "제어기 독립 인도분", deliverableVersionId, evidenceIds: [evidenceId] }] });
    const held = AcceptancePaymentDecision.restore(partial).holdForConditions(systemCommand(partial.version), {
      residualConditions: [],
      independentlyUsablePortions: [{ usablePortionId: portionId, sourcePortionCode: stableCode("PORTION.CONTROLLER"), sourceDeliverableVersionId: deliverableVersionId, description: "제어기 독립 인도분", evidenceIds: [evidenceId], releaseEligible: true }],
      heldAmount: money("2500000", "KRW"),
      unpaidRemainder: money("2500000", "KRW")
    }).snapshot;
    const eligible = AcceptancePaymentDecision.restore(held).markEligibleForExternalPayment(command(held.version)).snapshot;
    expect(eligible).toMatchObject({ state: "ELIGIBLE_FOR_EXTERNAL_PAYMENT", unpaidRemainder: { amount: "2500000" }, responsibility: { externalTransferExecuted: false } });
  });

  it("never makes a rejected attempt eligible and rejects stale transitions", () => {
    const rejected = approved({ disposition: "REJECTED", achievementPercent: "40", residualConditions: [] });
    expect(() => AcceptancePaymentDecision.restore(rejected).markEligibleForExternalPayment(command(rejected.version))).toThrowError(expect.objectContaining({ code: "ACCEPTANCE_PAYMENT_REJECTED_NOT_ELIGIBLE" }));
    expect(() => AcceptancePaymentDecision.restore(calculated()).submitForApproval(command(0), { approvalInstanceId: approvalId, checksum: sha256("d".repeat(64)) })).toThrowError(expect.objectContaining({ code: "ACCEPTANCE_PAYMENT_STALE_VERSION" }));
  });
});

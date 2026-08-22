import { describe, expect, it } from "vitest";
import { INITIAL_ACCEPTANCE_POLICY_V1, Inspection, createInspectionChecklistVersion, deriveRepeatedCriticalFailureCount, sealInspectionAttempt, type InspectionActorSnapshot, type InspectionAttemptSnapshot, type InspectionChecklistVersionSnapshot, type InspectionCriterionResultSnapshot } from "../../packages/features/quality/src/domain/inspection.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const id = (n: number) => uuid(`82000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const inspectionId = id(1), contractId = id(2), milestoneId = id(3), deliverableId = id(4), deliverableVersionId = id(5), vendorId = id(6), checklistId = id(7), inspectorId = id(8);
const actor = (authorities: string[] = ["INSPECTOR", "INSPECTION_DECIDER"]): InspectionActorSnapshot => ({ actorKind: "INTERNAL", userId: inspectorId, active: true, authorities: authorities.map(stableCode) });
const command = (expected: number, authorities?: string[], reason?: string) => ({ actor: actor(authorities), at: utcInstant("2026-08-22T06:00:00Z"), expectedVersion: version(expected), eventId: id(30), correlationId: correlationId("m08-inspection"), idempotencyKey: idempotencyKey(`m08-inspection-${expected}`), ...(reason ? { reason } : {}) });

function checklist(weights: readonly [string, string] = ["50", "50"]): InspectionChecklistVersionSnapshot {
  return createInspectionChecklistVersion({ inspectionChecklistVersionId: checklistId, inspectionId, versionNo: 1, policy: INITIAL_ACCEPTANCE_POLICY_V1, criteria: [
    { inspectionCriterionId: id(9), inspectionChecklistVersionId: checklistId, sequenceNo: 1, criterionCode: stableCode("CRITERION.PRESSURE"), title: "압력", requirementRevisionId: id(11), weightPercent: weights[0], critical: true, requiredEvidence: [stableCode("EVIDENCE.MEASUREMENT")], measurementRule: "교정계측기 3회", passRule: "9.5~10.5 bar" },
    { inspectionCriterionId: id(10), inspectionChecklistVersionId: checklistId, sequenceNo: 2, criterionCode: stableCode("CRITERION.APPEARANCE"), title: "외관", weightPercent: weights[1], critical: false, requiredEvidence: [stableCode("EVIDENCE.PHOTO")], measurementRule: "육안", passRule: "결함 없음" }
  ], checksum: sha256("d".repeat(64)), sealedAt: utcInstant("2026-08-22T05:00:00Z"), sealedByUserId: inspectorId });
}

function result(attemptId: ReturnType<typeof id>, criterion: 9 | 10, achievedPercent: string, verdict: InspectionCriterionResultSnapshot["verdict"]): InspectionCriterionResultSnapshot {
  return { inspectionCriterionResultId: criterion === 9 ? id(13) : id(14), inspectionAttemptId: attemptId, inspectionCriterionId: id(criterion), ...(criterion === 9 ? { requirementRevisionId: id(11) } : {}), achievedPercent, verdict, observedValue: criterion === 9 ? "10.1 bar" : "양호", evidenceIds: [criterion === 9 ? id(15) : id(16)] };
}

function seal(attemptNo: number, achieved: readonly [string, string], verdicts: readonly [InspectionCriterionResultSnapshot["verdict"], InspectionCriterionResultSnapshot["verdict"]], options: Partial<Parameters<typeof sealInspectionAttempt>[0]> = {}): InspectionAttemptSnapshot {
  const attemptId = id(20 + attemptNo);
  return sealInspectionAttempt({ inspectionAttemptId: attemptId, inspectionId, attemptNo, contractId, contractMilestoneId: milestoneId, deliverableId, deliverableVersionId, criterionResults: [result(attemptId, 9, achieved[0], verdicts[0]), result(attemptId, 10, achieved[1], verdicts[1])], inspectorUserId: inspectorId, checksum: sha256(String(attemptNo).repeat(64)), sealedAt: utcInstant("2026-08-22T07:00:00Z"), ...options }, checklist());
}

function requested() {
  return Inspection.request({ inspectionId, inspectionNo: "INSP-2026-001", inspectionTypeCode: stableCode("INSPECTION.DELIVERABLE"), contractId, contractMilestoneId: milestoneId, deliverableId, deliverableVersionId, assignedVendorId: vendorId, inspectionChecklistVersionId: checklistId }, { ...command(0), actor: actor([]) });
}

describe("weighted immutable checklist and attempt", () => {
  it("requires normalized criterion weights totaling exactly 100", () => {
    const exact = checklist();
    expect(exact.policy.policyId).toBe("POL-ACCEPTANCE-PAYMENT-V1");
    expect(exact.criteria[0]).toMatchObject({ critical: true });
    expect(() => checklist(["40", "50"])).toThrowError(expect.objectContaining({ code: "INSPECTION_CRITERION_WEIGHT_TOTAL_INVALID" }));
  });

  it("calculates accepted, conditional, partial, and rejected bands from policy data", () => {
    expect(seal(1, ["100", "100"], ["PASS", "PASS"]).disposition).toBe("ACCEPTED");
    expect(seal(1, ["100", "90"], ["PASS", "PARTIAL"], { residualConditions: [{ conditionCode: stableCode("CONDITION.FINISH"), description: "외관 보완", evidenceIds: [id(16)] }] })).toMatchObject({ disposition: "CONDITIONAL_ACCEPTANCE", achievementPercent: "95" });
    expect(seal(1, ["100", "60"], ["PASS", "PARTIAL"], { independentlyUsablePortions: [{ portionCode: stableCode("PORTION.PUMP"), description: "펌프 본체", deliverableVersionId, evidenceIds: [id(15)] }] })).toMatchObject({ disposition: "PARTIAL_ACCEPTANCE", achievementPercent: "80" });
    expect(seal(1, ["40", "40"], ["FAIL", "FAIL"]).disposition).toBe("REJECTED");
  });

  it("never accepts a failed critical item by score alone", () => {
    const correction = seal(1, ["100", "100"], ["FAIL", "PASS"]);
    expect(correction).toMatchObject({ disposition: "CORRECTION_REQUESTED", criticalFailureCriterionIds: [id(9)] });
    const partial = seal(1, ["100", "100"], ["FAIL", "PASS"], { independentlyUsablePortions: [{ portionCode: stableCode("PORTION.NONCRITICAL"), description: "독립 사용 가능 부분", deliverableVersionId, evidenceIds: [id(16)] }] });
    expect(partial.disposition).toBe("PARTIAL_ACCEPTANCE");
  });

  it("derives repeated critical failures without mutating prior attempts or terminating a contract", () => {
    const first = seal(1, ["100", "100"], ["FAIL", "PASS"]);
    const second = seal(2, ["100", "100"], ["FAIL", "PASS"]);
    expect(deriveRepeatedCriticalFailureCount([first, second], id(9))).toBe(2);
    expect(first).toMatchObject({ attemptNo: 1, state: "SEALED" });
    expect(first).not.toHaveProperty("contractTerminationState");
  });
});

describe("SM-INSPECTION-V1", () => {
  it("binds an immutable numbered attempt to every exact Contract subject", () => {
    const aggregate = Inspection.restore(requested().snapshot);
    aggregate.schedule(command(1, ["INSPECTOR"]), utcInstant("2026-08-23T01:00:00Z"));
    aggregate.start(command(2, ["INSPECTOR"]), id(21));
    const submitted = aggregate.submitDecision(command(3, ["INSPECTOR"]), seal(1, ["100", "100"], ["PASS", "PASS"]));
    expect(submitted).toMatchObject({ snapshot: { state: "DECISION_PENDING", latestAttemptNo: 1 }, immutableAttempt: { state: "SEALED", contractMilestoneId: milestoneId } });
    const accepted = aggregate.accept(command(4, ["INSPECTION_DECIDER"]), submitted.immutableAttempt!);
    expect(accepted.snapshot).toMatchObject({ state: "COMPLETED", finalDisposition: "ACCEPTED" });
  });

  it("forbids Vendor self-acceptance even with exact active scope", () => {
    const attempt = seal(1, ["100", "100"], ["PASS", "PASS"]);
    const aggregate = Inspection.restore({ ...requested().snapshot, state: "DECISION_PENDING", latestSealedAttemptId: attempt.inspectionAttemptId, latestAttemptNo: 1, version: version(4) });
    const vendor: InspectionActorSnapshot = { actorKind: "VENDOR", userId: id(31), vendorId, active: true, authorities: [], contractScopeId: id(32), contractScopeContractId: contractId };
    expect(() => aggregate.accept({ ...command(4), actor: vendor }, attempt)).toThrowError(expect.objectContaining({ code: "INSPECTION_INTERNAL_DECIDER_REQUIRED" }));
  });

  it("opens reinspection as the direct next attempt without overwriting attempt 1", () => {
    const failed = seal(1, ["100", "100"], ["FAIL", "PASS"]);
    const aggregate = Inspection.restore({ ...requested().snapshot, state: "DECISION_PENDING", latestSealedAttemptId: failed.inspectionAttemptId, latestAttemptNo: 1, version: version(4) });
    aggregate.requestCorrection(command(4, ["INSPECTION_DECIDER"], "중요항목 보완"), failed);
    aggregate.submitCorrection(command(5, [], "수정본 제출"), id(33));
    const next = aggregate.startReinspection(command(6, ["INSPECTOR"]), id(22));
    expect(next.snapshot).toMatchObject({ state: "IN_PROGRESS", openAttemptNo: 2, latestSealedAttemptId: failed.inspectionAttemptId });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { ApprovalActorSnapshot, ApprovalOutcomeInput, ApprovalPolicyVersion, ResolvedStep } from "../../packages/core/approval/src/public.js";
import {
  ACCEPTANCE_PAYMENT_APPROVAL_OBLIGATIONS,
  AcceptancePaymentDecisionApprovalSubjectAdapter,
  selectAcceptancePaymentApprovalPolicy,
  validateAcceptancePaymentApprovalPolicy,
  type AcceptancePaymentApprovalPolicyEntry,
  type AcceptancePaymentApprovalRecord
} from "../../packages/processes/vendor-acceptance-payment/src/public.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const id = (n: number) => uuid(`82000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const decisionOneId = id(1), decisionTwoId = id(2), rootId = id(3), attemptId = id(4), approvalId = id(5);
const sealedAt = utcInstant("2026-08-22T06:00:00Z"), outcomeAt = utcInstant("2026-08-22T07:00:00Z");
const checksumOne = sha256("1".repeat(64)), checksumTwo = sha256("2".repeat(64)), attemptChecksum = sha256("3".repeat(64));

function record(input: Partial<AcceptancePaymentApprovalRecord> = {}): AcceptancePaymentApprovalRecord {
  return { acceptancePaymentDecisionId: decisionOneId, decisionRootId: rootId, revisionNo: 1, approvalState: "APPROVAL_PENDING", subjectVersion: version(2), sealedSnapshotChecksum: checksumOne, sealedAt, inspectionAttemptId: attemptId, inspectionAttemptChecksum: attemptChecksum, achievementPercent: "95", calculatedProposedRate: "95", ...input };
}
function actor(user = 10, positions: readonly string[] = [], roles: readonly string[] = []): ApprovalActorSnapshot {
  const userId = id(user);
  return { actorType: "USER", accountKind: "INTERNAL", authenticatedUserId: userId, effectiveUserId: userId, positionIds: positions.map(stableCode), roleIds: roles.map(stableCode) };
}
function provenance(outcome: ApprovalOutcomeInput["outcome"]): ApprovalOutcomeInput["provenance"] {
  const terminalActor = actor(11, ["POSITION_LAB_DIRECTOR"]);
  const kinds = { COMPLETED: "APPROVE", REJECTED: "REJECT", RECALLED: "RECALL", CANCELLED: "CANCEL" } as const;
  return { terminalAction: { actionId: id(12), kind: kinds[outcome], at: outcomeAt, actor: terminalActor }, actor: terminalActor, occurredAt: outcomeAt, correlationId: correlationId(`m08-${outcome}`), idempotencyKey: idempotencyKey(`m08-${outcome}`) };
}

describe("AcceptancePaymentDecision typed Approval subject", () => {
  it("binds the exact decision version, checksum and sealed time", async () => {
    const exact = record();
    const adapter = new AcceptancePaymentDecisionApprovalSubjectAdapter({ loadExact: async () => exact, loadPrevious: async () => null }, { applyVerifiedOutcome: async () => undefined });
    const subject = await adapter.sealExactVersion({ kind: "ACCEPTANCE_PAYMENT_DECISION", acceptancePaymentDecisionId: decisionOneId });
    expect(subject).toEqual({ subject: { kind: "ACCEPTANCE_PAYMENT_DECISION", acceptancePaymentDecisionId: decisionOneId }, subjectVersion: version(2), checksum: checksumOne, sealedAt });
    await expect(adapter.assertExactVersion({ ...subject, checksum: checksumTwo })).rejects.toMatchObject({ code: "ACCEPTANCE_PAYMENT_APPROVAL_SUBJECT_MISMATCH" });
  });

  it("requires direct newer same-root lineage after rejection or recall", async () => {
    const previous = record({ approvalState: "REJECTED" });
    const current = record({ acceptancePaymentDecisionId: decisionTwoId, revisionNo: 2, previousDecisionId: decisionOneId, subjectVersion: version(4), sealedSnapshotChecksum: checksumTwo });
    const adapter = new AcceptancePaymentDecisionApprovalSubjectAdapter({ loadExact: async (value) => value === decisionOneId ? previous : current, loadPrevious: async () => previous }, { applyVerifiedOutcome: async () => undefined });
    await expect(adapter.assertResubmissionLineage({ previous: { subject: { kind: "ACCEPTANCE_PAYMENT_DECISION", acceptancePaymentDecisionId: decisionOneId }, subjectVersion: version(2), checksum: checksumOne, sealedAt }, current: { subject: { kind: "ACCEPTANCE_PAYMENT_DECISION", acceptancePaymentDecisionId: decisionTwoId }, subjectVersion: version(4), checksum: checksumTwo, sealedAt } })).resolves.toBeUndefined();
    const wrong = new AcceptancePaymentDecisionApprovalSubjectAdapter({ loadExact: async (value) => value === decisionOneId ? previous : { ...current, decisionRootId: id(99) }, loadPrevious: async () => previous }, { applyVerifiedOutcome: async () => undefined });
    await expect(wrong.assertResubmissionLineage({ previous: { subject: { kind: "ACCEPTANCE_PAYMENT_DECISION", acceptancePaymentDecisionId: decisionOneId }, subjectVersion: version(2), checksum: checksumOne, sealedAt }, current: { subject: { kind: "ACCEPTANCE_PAYMENT_DECISION", acceptancePaymentDecisionId: decisionTwoId }, subjectVersion: version(4), checksum: checksumTwo, sealedAt } })).rejects.toMatchObject({ code: "ACCEPTANCE_PAYMENT_RESUBMISSION_LINEAGE_INVALID" });
  });

  it("passes terminal provenance and non-transfer/non-waiver obligations to the verified outcome port", async () => {
    const applyVerifiedOutcome = vi.fn(async () => undefined);
    const exact = record();
    const adapter = new AcceptancePaymentDecisionApprovalSubjectAdapter({ loadExact: async () => exact, loadPrevious: async () => null }, { applyVerifiedOutcome });
    await adapter.applyApprovalOutcome({ snapshot: { subject: { kind: "ACCEPTANCE_PAYMENT_DECISION", acceptancePaymentDecisionId: decisionOneId }, subjectVersion: version(2), checksum: checksumOne, sealedAt }, approvalInstanceId: approvalId, approvalVersion: version(5), outcome: "COMPLETED", provenance: provenance("COMPLETED") });
    expect(applyVerifiedOutcome).toHaveBeenCalledWith(expect.objectContaining({ decision: "APPROVED", exactDecision: exact, obligations: ACCEPTANCE_PAYMENT_APPROVAL_OBLIGATIONS }));
    expect(ACCEPTANCE_PAYMENT_APPROVAL_OBLIGATIONS).toMatchObject({ approvalCompletionDoesNotMarkPaymentEligible: true, approvalCompletionDoesNotExecuteTransfer: true, acceptanceAndPaymentDoNotWaiveVendorResponsibility: true });
  });
});

function policyEntry(input: { suffix: number; representativeMode: "NONE" | "ANY_ONE" | "ALL"; minInclusive?: string; maxExclusive?: string; coversUpwardAdjustment: boolean }): AcceptancePaymentApprovalPolicyEntry {
  const directorRule = { ruleId: id(100 + input.suffix), sequenceNo: 1, role: "APPROVAL" as const, completionMode: "SEQUENTIAL" as const, required: true, allowedPositionIds: [stableCode("POSITION_LAB_DIRECTOR")], allowedRoleIds: [] };
  const representativeRule = { ruleId: id(200 + input.suffix), sequenceNo: 2, role: "APPROVAL" as const, completionMode: input.representativeMode === "ALL" ? "ALL" as const : "ANY_ONE" as const, required: true, allowedPositionIds: [stableCode("POSITION_REPRESENTATIVE")], allowedRoleIds: [] };
  const rules = input.representativeMode === "NONE" ? [directorRule] : [directorRule, representativeRule];
  const directorStep: ResolvedStep = { stepId: id(300 + input.suffix), ruleId: directorRule.ruleId, sequenceNo: 1, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true, participants: [{ participantId: id(400 + input.suffix), userId: id(500 + input.suffix), positionId: stableCode("POSITION_LAB_DIRECTOR"), roleIds: [], order: 1 }] };
  const representativeStep: ResolvedStep = { stepId: id(600 + input.suffix), ruleId: representativeRule.ruleId, sequenceNo: 2, role: "APPROVAL", completionMode: input.representativeMode === "ALL" ? "ALL" : "ANY_ONE", required: true, participants: [{ participantId: id(700 + input.suffix), userId: id(800 + input.suffix), positionId: stableCode("POSITION_REPRESENTATIVE"), roleIds: [], order: 1 }] };
  const policy: ApprovalPolicyVersion = { policyVersionId: id(900 + input.suffix), policyId: stableCode(`POL-ACCEPTANCE-APPROVAL-${input.suffix}`), version: 1, checksum: sha256(String(input.suffix).repeat(64)), state: "PUBLISHED", effectiveFrom: utcInstant("2026-01-01T00:00:00Z"), selection: { subjectKinds: ["ACCEPTANCE_PAYMENT_DECISION"], documentTypeIds: [], securityLevels: [], amountBand: { currency: "KRW", ...(input.minInclusive ? { minInclusive: input.minInclusive } : {}), ...(input.maxExclusive ? { maxExclusive: input.maxExclusive } : {}) }, strengthenedRisk: "ANY" }, recallAllowed: true, steps: rules };
  return { policy, line: input.representativeMode === "NONE" ? [directorStep] : [directorStep, representativeStep], representativeMode: input.representativeMode, coversUpwardAdjustment: input.coversUpwardAdjustment, selectionPriority: input.suffix, basis: { kind: "INTERNAL_PRESET", referenceId: stableCode(`ACCEPTANCE.APPROVAL.${input.suffix}`), version: 1 } };
}

describe("data-owned acceptance payment Approval policy", () => {
  const owner = actor(20, [], ["ROLE_CONTRACT_MANAGER"]);
  it("selects amount bands without hardcoding a monetary threshold", () => {
    const catalog = [policyEntry({ suffix: 1, representativeMode: "NONE", maxExclusive: "50000000", coversUpwardAdjustment: false }), policyEntry({ suffix: 2, representativeMode: "ANY_ONE", minInclusive: "50000000", coversUpwardAdjustment: true })];
    const selected = selectAcceptancePaymentApprovalPolicy(catalog, { at: outcomeAt, submitter: owner, selection: { amount: { currency: "KRW", value: "60000000" }, strengthenedRisk: false }, upwardAdjustment: true });
    expect(selected.representativeMode).toBe("ANY_ONE");
  });

  it("rejects Senior official approval and requires an upward-capable policy", () => {
    const invalid = policyEntry({ suffix: 3, representativeMode: "NONE", maxExclusive: "50000000", coversUpwardAdjustment: false });
    const seniorRule = { ...invalid.policy.steps[0]!, allowedPositionIds: [stableCode("POSITION_SENIOR_RESEARCHER")] };
    expect(() => validateAcceptancePaymentApprovalPolicy({ ...invalid, policy: { ...invalid.policy, steps: [seniorRule] } })).toThrowError(expect.objectContaining({ code: "ACCEPTANCE_PAYMENT_APPROVAL_POLICY_INVALID" }));
    expect(() => selectAcceptancePaymentApprovalPolicy([invalid], { at: outcomeAt, submitter: owner, selection: { amount: { currency: "KRW", value: "1000" }, strengthenedRisk: false }, upwardAdjustment: true })).toThrowError(expect.objectContaining({ code: "ACCEPTANCE_PAYMENT_APPROVAL_POLICY_NOT_FOUND" }));
  });
});

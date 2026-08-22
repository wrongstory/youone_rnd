import { describe, expect, it, vi } from "vitest";
import type { ApprovalActorSnapshot, ApprovalOutcomeInput, ApprovalPolicyVersion, ResolvedStep } from "../../packages/core/approval/src/public.js";
import {
  PurchaseRequestApprovalSubjectAdapter,
  assertApprovedPurchaseRequestEvidenceAppend,
  assertTrustedApprovedPurchaseOutcome,
  assertTrustedNegativePurchaseOutcome,
  selectPurchaseApprovalPolicy,
  type CompletedPurchaseApprovalSnapshot,
  type PurchaseApprovalAmountFactsSnapshot,
  type PurchaseApprovalPolicyEntry,
  type PurchaseApprovalPolicySnapshot,
  type PurchaseApprovalPresetVersion,
  type PurchaseApprovalTierId,
  type PurchaseRequestApprovalRecord
} from "../../packages/features/purchase/src/approval/contracts.js";
import { correlationId, idempotencyKey, money, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const id = (n: number) => uuid(`8c000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const checksum = (digit: string) => sha256(digit.repeat(64));
const requestVersionId = id(1);
const requestId = id(2);
const approvalInstanceId = id(3);
const sealedAt = utcInstant("2026-08-22T10:00:00Z");
const completedAt = utcInstant("2026-08-22T11:00:00Z");

const preset: PurchaseApprovalPresetVersion = {
  presetVersionId: id(10),
  presetId: stableCode("POL-PURCHASE-AMOUNT-PRESET"),
  version: 1,
  checksum: checksum("1"),
  state: "PUBLISHED",
  effectiveFrom: utcInstant("2026-01-01T00:00:00Z"),
  classification: "INTERNAL_RECOMMENDED_PRESET_NOT_STATUTORY",
  currency: "KRW",
  firstThresholdInclusive: "1000000",
  secondThresholdInclusive: "10000000",
  strengthenedLegalCheckThresholdInclusive: "50000000"
};

function amountFacts(amount: string, cumulative = amount, legal = false,
  legalTrigger: "AMOUNT_THRESHOLD" | "VERSIONED_RISK_RULE" = "AMOUNT_THRESHOLD"): PurchaseApprovalAmountFactsSnapshot {
  const selected = BigInt(amount) > BigInt(cumulative) ? amount : cumulative;
  return {
    vatInclusiveTotalBurden: money(amount, "KRW"),
    antiSplitCumulativeExposure: money(cumulative, "KRW"),
    policySelectionAmount: money(selected, "KRW"),
    antiSplitPolicyVersionId: id(11),
    antiSplitPolicyChecksum: checksum("2"),
    aggregationKeyHash: checksum("3"),
    aggregationWindowFrom: utcInstant("2026-08-01T00:00:00Z"),
    aggregationWindowTo: utcInstant("2026-09-01T00:00:00Z"),
    aggregationEvidenceIds: [id(12)],
    strengthenedLegalCheckRequired: legal,
    strengthenedLegalCheckCompleted: legal,
    ...(legal ? { strengthenedLegalCheckTrigger: legalTrigger } : {}),
    ...(legal ? { legalChecklistPolicyVersionId: id(13), legalChecklistPolicyChecksum: checksum("4") } : {}),
    legalChecklistEvidenceIds: legal ? [id(14)] : [],
    factsChecksum: checksum("5")
  };
}

function policyEntry(tierId: PurchaseApprovalTierId): PurchaseApprovalPolicyEntry {
  const tierIndex = tierId === "PURCHASE_UNDER_FIRST_THRESHOLD" ? 0 : tierId === "PURCHASE_FIRST_TO_SECOND_THRESHOLD" ? 1 : 2;
  const directorRule = {
    ruleId: id(20), sequenceNo: 1, role: "APPROVAL" as const, completionMode: "SEQUENTIAL" as const, required: true,
    allowedPositionIds: [stableCode("POSITION_LAB_DIRECTOR")], allowedRoleIds: []
  };
  const representativeRule = {
    ruleId: id(21), sequenceNo: 2, role: "APPROVAL" as const, completionMode: "ANY_ONE" as const, required: true,
    allowedPositionIds: [stableCode("POSITION_REPRESENTATIVE")], allowedRoleIds: []
  };
  const higher = tierId !== "PURCHASE_UNDER_FIRST_THRESHOLD";
  const band = tierId === "PURCHASE_UNDER_FIRST_THRESHOLD"
    ? { currency: "KRW", maxExclusive: preset.firstThresholdInclusive }
    : tierId === "PURCHASE_FIRST_TO_SECOND_THRESHOLD"
      ? { currency: "KRW", minInclusive: preset.firstThresholdInclusive, maxExclusive: preset.secondThresholdInclusive }
      : { currency: "KRW", minInclusive: preset.secondThresholdInclusive };
  const policy: ApprovalPolicyVersion = {
    policyVersionId: id(22 + tierIndex),
    policyId: stableCode(`POL-${tierId}`),
    version: 1,
    checksum: checksum(String(6 + tierIndex)),
    state: "PUBLISHED",
    effectiveFrom: preset.effectiveFrom,
    selection: { subjectKinds: ["PURCHASE_REQUEST_VERSION"], documentTypeIds: [], securityLevels: [], amountBand: band, strengthenedRisk: "ANY" },
    recallAllowed: true,
    steps: higher ? [directorRule, representativeRule] : [directorRule]
  };
  const directorStep: ResolvedStep = {
    stepId: id(30), ruleId: directorRule.ruleId, sequenceNo: 1, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true,
    participants: [{ participantId: id(31), userId: id(32), positionId: stableCode("POSITION_LAB_DIRECTOR"), roleIds: [], order: 1 }]
  };
  const representativeStep: ResolvedStep = {
    stepId: id(33), ruleId: representativeRule.ruleId, sequenceNo: 2, role: "APPROVAL", completionMode: "ANY_ONE", required: true,
    participants: [
      { participantId: id(34), userId: id(35), positionId: stableCode("POSITION_REPRESENTATIVE"), roleIds: [], order: 1 },
      { participantId: id(36), userId: id(37), positionId: stableCode("POSITION_REPRESENTATIVE"), roleIds: [], order: 2 }
    ]
  };
  return { tierId, policy, line: higher ? [directorStep, representativeStep] : [directorStep] };
}

const entries = [
  policyEntry("PURCHASE_UNDER_FIRST_THRESHOLD"),
  policyEntry("PURCHASE_FIRST_TO_SECOND_THRESHOLD"),
  policyEntry("PURCHASE_SECOND_THRESHOLD_AND_ABOVE")
];

function selection(facts = amountFacts("900000")) {
  return selectPurchaseApprovalPolicy({ preset, entries, amountFacts: facts, at: sealedAt });
}

function actor(position: "POSITION_LAB_DIRECTOR" | "POSITION_REPRESENTATIVE" = "POSITION_LAB_DIRECTOR"): ApprovalActorSnapshot {
  return {
    actorType: "USER",
    accountKind: "INTERNAL",
    authenticatedUserId: id(position === "POSITION_LAB_DIRECTOR" ? 40 : 41),
    effectiveUserId: id(position === "POSITION_LAB_DIRECTOR" ? 40 : 41),
    positionIds: [stableCode(position)],
    roleIds: []
  };
}

function policySnapshot(facts = amountFacts("900000")): PurchaseApprovalPolicySnapshot {
  return selection(facts).snapshot;
}

function record(input: Partial<PurchaseRequestApprovalRecord> = {}): PurchaseRequestApprovalRecord {
  const evidence = { evidenceId: id(50), kind: "QUOTATION" as const, file: { attachmentId: id(51), rowVersion: version(1), checksum: checksum("8") } };
  return {
    purchaseRequestVersionId: requestVersionId,
    purchaseRequestId: requestId,
    revisionNo: 1,
    subjectVersion: version(1),
    sealedSnapshotChecksum: checksum("9"),
    sealedAt,
    approvalState: "APPROVAL_PENDING",
    sealedVatInclusiveTotalBurden: money("900000", "KRW"),
    policySnapshot: policySnapshot(),
    quotationRefs: [evidence],
    evidenceRefs: [],
    ...input
  };
}

function outcomeInput(position: "POSITION_LAB_DIRECTOR" | "POSITION_REPRESENTATIVE" = "POSITION_LAB_DIRECTOR",
  outcome: ApprovalOutcomeInput["outcome"] = "COMPLETED"): ApprovalOutcomeInput {
  const terminalActor = actor(position);
  const kinds = { COMPLETED: "APPROVE", REJECTED: "REJECT", RECALLED: "RECALL", CANCELLED: "CANCEL" } as const;
  return {
    snapshot: { subject: { kind: "PURCHASE_REQUEST_VERSION", purchaseRequestVersionId: requestVersionId }, subjectVersion: version(1), checksum: checksum("9"), sealedAt },
    approvalInstanceId,
    approvalVersion: version(3),
    outcome,
    provenance: {
      terminalAction: { actionId: id(60), kind: kinds[outcome], at: completedAt, actor: terminalActor },
      actor: terminalActor,
      occurredAt: completedAt,
      correlationId: correlationId(`purchase-${outcome}`),
      idempotencyKey: idempotencyKey(`purchase-${outcome}`)
    }
  };
}

function completed(input: ApprovalOutcomeInput, snapshot: PurchaseApprovalPolicySnapshot): CompletedPurchaseApprovalSnapshot {
  const representative = snapshot.tierId !== "PURCHASE_UNDER_FIRST_THRESHOLD";
  return {
    approvalInstanceId: input.approvalInstanceId,
    approvalVersion: input.approvalVersion,
    approvalPolicyVersionId: snapshot.approvalPolicyVersionId,
    approvalPolicyChecksum: snapshot.approvalPolicyChecksum,
    approvalStepId: id(61),
    approvalParticipantId: id(62),
    approvalStepRole: "APPROVAL",
    approvalStepCompletionMode: representative ? "ANY_ONE" : "SEQUENTIAL",
    subject: { kind: "PURCHASE_REQUEST_VERSION", purchaseRequestVersionId: requestVersionId },
    subjectVersion: input.snapshot.subjectVersion,
    subjectChecksum: input.snapshot.checksum,
    subjectSealedAt: input.snapshot.sealedAt,
    completedAt: input.provenance.occurredAt,
    officialApproverUserId: input.provenance.actor.effectiveUserId!,
    officialApproverPositionId: stableCode(representative ? "POSITION_REPRESENTATIVE" : "POSITION_LAB_DIRECTOR")
  };
}

describe("M11 versioned Purchase Approval matrix", () => {
  it("selects the Lab Director-only tier below the first internal threshold", () => {
    const selected = selection(amountFacts("999999"));
    expect(selected.snapshot).toMatchObject({ tierId: "PURCHASE_UNDER_FIRST_THRESHOLD", presetVersion: 1 });
    expect(selected.line).toHaveLength(1);
    expect(selected.line[0]).toMatchObject({ completionMode: "SEQUENTIAL", participants: [{ positionId: "POSITION_LAB_DIRECTOR" }] });
  });

  it("uses Lab Director then Representative ANY_ONE at and above the first threshold", () => {
    const middle = selection(amountFacts("1000000"));
    const high = selection(amountFacts("10000000"));
    expect(middle.snapshot.tierId).toBe("PURCHASE_FIRST_TO_SECOND_THRESHOLD");
    expect(high.snapshot.tierId).toBe("PURCHASE_SECOND_THRESHOLD_AND_ABOVE");
    for (const selected of [middle, high]) expect(selected.line[1]).toMatchObject({ completionMode: "ANY_ONE", participants: expect.arrayContaining([expect.objectContaining({ positionId: "POSITION_REPRESENTATIVE" })]) });
  });

  it("uses VAT-inclusive or anti-split cumulative exposure and requires versioned legal-check evidence at the strengthened threshold", () => {
    const split = selection(amountFacts("900000", "1100000"));
    expect(split.snapshot.tierId).toBe("PURCHASE_FIRST_TO_SECOND_THRESHOLD");
    expect(split.selectionInput.amount?.value).toBe("1100000");
    expect(() => selection(amountFacts("50000000"))).toThrowError(expect.objectContaining({ code: "PURCHASE_APPROVAL_LEGAL_CHECK_INVALID" }));
    expect(selection(amountFacts("50000000", "50000000", true)).snapshot.amountFacts.legalChecklistEvidenceIds).toHaveLength(1);
    expect(selection(amountFacts("50000000", "50000000", true)).snapshot.presetId).toBe("POL-PURCHASE-AMOUNT-PRESET");
    expect(selection(amountFacts("900000", "900000", true, "VERSIONED_RISK_RULE")).snapshot.amountFacts.strengthenedLegalCheckRequired).toBe(true);
  });

  it("rejects Senior official authority and a non-ANY_ONE Representative policy", () => {
    const invalid = policyEntry("PURCHASE_FIRST_TO_SECOND_THRESHOLD");
    const seniorRule = { ...invalid.policy.steps[1]!, allowedPositionIds: [stableCode("POSITION_SENIOR_RESEARCHER")] };
    const seniorStep = { ...invalid.line[1]!, participants: [{ ...invalid.line[1]!.participants[0]!, positionId: stableCode("POSITION_SENIOR_RESEARCHER") }] };
    expect(() => selectPurchaseApprovalPolicy({ preset, entries: [entries[0]!, { ...invalid, policy: { ...invalid.policy, steps: [invalid.policy.steps[0]!, seniorRule] }, line: [invalid.line[0]!, seniorStep] }, entries[2]!], amountFacts: amountFacts("1000000"), at: sealedAt }))
      .toThrowError(expect.objectContaining({ code: expect.stringMatching(/SENIOR|OFFICIAL/) }));
    const sequential = { ...invalid, policy: { ...invalid.policy, steps: [invalid.policy.steps[0]!, { ...invalid.policy.steps[1]!, completionMode: "SEQUENTIAL" as const }] }, line: [invalid.line[0]!, { ...invalid.line[1]!, completionMode: "SEQUENTIAL" as const }] };
    expect(() => selectPurchaseApprovalPolicy({ preset, entries: [entries[0]!, sequential, entries[2]!], amountFacts: amountFacts("1000000"), at: sealedAt }))
      .toThrowError(expect.objectContaining({ code: "PURCHASE_APPROVAL_REPRESENTATIVE_STEP_INVALID" }));
  });

  it("rejects an incomplete or overlapping three-band policy matrix", () => {
    expect(() => selectPurchaseApprovalPolicy({ preset, entries: entries.slice(0, 2), amountFacts: amountFacts("900000"), at: sealedAt }))
      .toThrowError(expect.objectContaining({ code: "PURCHASE_APPROVAL_POLICY_MATRIX_INVALID" }));
    const high = entries[2]!;
    const overlapping = { ...high, policy: { ...high.policy, selection: { ...high.policy.selection,
      amountBand: { currency: "KRW", minInclusive: preset.firstThresholdInclusive } } } };
    expect(() => selectPurchaseApprovalPolicy({ preset, entries: [entries[0]!, entries[1]!, overlapping], amountFacts: amountFacts("10000000"), at: sealedAt }))
      .toThrowError(expect.objectContaining({ code: "PURCHASE_APPROVAL_POLICY_BAND_INVALID" }));
  });
});

describe("M11 exact PurchaseRequestVersion outcome", () => {
  it("mints a frozen trusted approved outcome and is the only Resolution-authorizing port call", async () => {
    const exact = record();
    const applyApprovedOutcome = vi.fn(async (value: unknown) => assertTrustedApprovedPurchaseOutcome(value));
    const retainNegativeOutcome = vi.fn(async () => undefined);
    const adapter = new PurchaseRequestApprovalSubjectAdapter(
      { loadExact: async () => exact, loadPrevious: async () => null },
      { applyApprovedOutcome, retainNegativeOutcome },
      { resolve: async (input) => completed(input, exact.policySnapshot) }
    );
    const approvalInput = outcomeInput();

    await adapter.applyApprovalOutcome(approvalInput);

    const trusted = applyApprovedOutcome.mock.calls[0]![0];
    expect(trusted).toMatchObject({ decision: "APPROVED", resolutionEffect: { kind: "CREATE_RESOLUTION_FROM_APPROVED_REQUEST_VERSION", allowed: true } });
    expect(() => assertTrustedApprovedPurchaseOutcome(trusted)).not.toThrow();
    expect(Object.isFrozen(trusted)).toBe(true);
    expect(retainNegativeOutcome).not.toHaveBeenCalled();
    expect(() => assertTrustedApprovedPurchaseOutcome({ decision: "APPROVED" })).toThrowError(expect.objectContaining({ code: "PURCHASE_APPROVED_OUTCOME_NOT_TRUSTED" }));
  });

  it("retains reject/recall without exposing it to the Resolution port", async () => {
    const exact = record();
    const applyApprovedOutcome = vi.fn(async () => undefined);
    const retainNegativeOutcome = vi.fn(async (value: unknown) => assertTrustedNegativePurchaseOutcome(value));
    const adapter = new PurchaseRequestApprovalSubjectAdapter(
      { loadExact: async () => exact, loadPrevious: async () => null },
      { applyApprovedOutcome, retainNegativeOutcome },
      { resolve: async (input) => completed(input, exact.policySnapshot) }
    );

    await adapter.applyApprovalOutcome(outcomeInput("POSITION_LAB_DIRECTOR", "REJECTED"));

    expect(retainNegativeOutcome).toHaveBeenCalledWith(expect.objectContaining({ decision: "REJECTED", resolutionEffect: { kind: "RETAIN_NEGATIVE_APPROVAL_EVIDENCE", allowed: false } }));
    expect(applyApprovedOutcome).not.toHaveBeenCalled();
  });

  it("requires a direct strictly newer changed version after rejection or recall", async () => {
    const previous = record({ approvalState: "REJECTED" });
    const currentId = id(70);
    const current = record({ purchaseRequestVersionId: currentId, previousPurchaseRequestVersionId: requestVersionId, revisionNo: 2,
      subjectVersion: version(2), sealedSnapshotChecksum: checksum("a"), sealedAt: utcInstant("2026-08-22T10:01:00Z") });
    const adapter = new PurchaseRequestApprovalSubjectAdapter(
      { loadExact: async (value) => value === requestVersionId ? previous : current, loadPrevious: async () => previous },
      { applyApprovedOutcome: async () => undefined, retainNegativeOutcome: async () => undefined },
      { resolve: async (input) => completed(input, current.policySnapshot) }
    );
    const previousSnapshot = { subject: { kind: "PURCHASE_REQUEST_VERSION" as const, purchaseRequestVersionId: requestVersionId }, subjectVersion: version(1), checksum: checksum("9"), sealedAt };
    const currentSnapshot = { subject: { kind: "PURCHASE_REQUEST_VERSION" as const, purchaseRequestVersionId: currentId }, subjectVersion: version(2), checksum: checksum("a"), sealedAt: current.sealedAt };
    await expect(adapter.assertResubmissionLineage({ previous: previousSnapshot, current: currentSnapshot })).resolves.toBeUndefined();
    await expect(adapter.assertResubmissionLineage({ previous: previousSnapshot, current: { ...currentSnapshot, checksum: previousSnapshot.checksum } }))
      .rejects.toMatchObject({ code: "PURCHASE_APPROVAL_SUBJECT_MISMATCH" });
  });

  it("keeps approved identity immutable while allowing only exact evidence-prefix append", () => {
    const previous = record({ approvalState: "APPROVED" });
    const appended = { evidenceId: id(80), kind: "OTHER" as const, file: { attachmentId: id(81), rowVersion: version(1), checksum: checksum("b") } };
    expect(() => assertApprovedPurchaseRequestEvidenceAppend(previous, { ...structuredClone(previous), evidenceRefs: [...previous.evidenceRefs, appended] })).not.toThrow();
    expect(() => assertApprovedPurchaseRequestEvidenceAppend(previous, { ...structuredClone(previous), quotationRefs: [] }))
      .toThrowError(expect.objectContaining({ code: "PURCHASE_APPROVED_REQUEST_MUTATED" }));
    expect(() => assertApprovedPurchaseRequestEvidenceAppend(previous, { ...structuredClone(previous), policySnapshot: { ...previous.policySnapshot, approvalPolicyVersion: 2 } }))
      .toThrowError(expect.objectContaining({ code: "PURCHASE_APPROVED_REQUEST_MUTATED" }));
  });
});

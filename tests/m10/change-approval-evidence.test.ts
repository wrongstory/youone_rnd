import { describe, expect, it, vi } from "vitest";
import type { ApprovalActorSnapshot, ApprovalOutcomeInput, ApprovalPolicyVersion, ResolvedStep } from "../../packages/core/approval/src/public.js";
import {
  CHANGE_APPROVAL_OBLIGATIONS,
  ChangeOrderApprovalSubjectAdapter,
  ChangeRequestApprovalSubjectAdapter,
  assertChangeOrderEvidenceAppend,
  assertChangeRequestApprovedIdentity,
  projectChangeForVendor,
  selectChangeApprovalPolicy,
  validateChangeApprovalPolicy,
  type ChangeApprovalAuthorityPolicy,
  type ChangeApprovalPolicyEntry,
  type ChangeOrderApprovalRecord,
  type ChangeRequestApprovalRecord
} from "../../packages/features/change/src/approval/contracts.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const id = (n: number) => uuid(`8a000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const sealedAt = utcInstant("2026-08-22T06:00:00Z");
const completedAt = utcInstant("2026-08-22T07:00:00Z");
const requestId = id(1), nextRequestId = id(2), requestRootId = id(3);
const orderId = id(4), orderRootId = id(6), approvalId = id(7);
const checksumOne = sha256("1".repeat(64)), checksumTwo = sha256("2".repeat(64));

function actor(position = "POSITION_LAB_DIRECTOR"): ApprovalActorSnapshot {
  const user = id(10);
  return { actorType: "USER", accountKind: "INTERNAL", authenticatedUserId: user, effectiveUserId: user,
    positionIds: [stableCode(position)], roleIds: [] };
}

function provenance(outcome: ApprovalOutcomeInput["outcome"]): ApprovalOutcomeInput["provenance"] {
  const terminalActor = actor();
  const kinds = { COMPLETED: "APPROVE", REJECTED: "REJECT", RECALLED: "RECALL", CANCELLED: "CANCEL" } as const;
  return { terminalAction: { actionId: id(11), kind: kinds[outcome], at: completedAt, actor: terminalActor }, actor: terminalActor,
    occurredAt: completedAt, correlationId: correlationId(`m10-${outcome}`), idempotencyKey: idempotencyKey(`m10-${outcome}`) };
}

const completedResolver = { resolve: async (input: ApprovalOutcomeInput) => ({
  approvalInstanceId: input.approvalInstanceId, approvalVersion: input.approvalVersion, approvalPolicyVersionId: id(12),
  approvalPolicyChecksum: checksumTwo, approvalStepId: id(13), approvalParticipantId: id(14), approvalStepRole: "APPROVAL" as const,
  authorityPolicyEvidenceId: id(15), subjectVersion: input.snapshot.subjectVersion,
  subject: input.snapshot.subject,
  subjectChecksum: input.snapshot.checksum, subjectSealedAt: input.snapshot.sealedAt, completedAt: input.provenance.occurredAt,
  officialApproverUserId: input.provenance.actor.effectiveUserId!, officialApproverPositionId: stableCode("POSITION_LAB_DIRECTOR")
}) };

function requestRecord(input: Partial<ChangeRequestApprovalRecord> = {}): ChangeRequestApprovalRecord {
  return { changeRequestVersionId: requestId, changeRequestId: requestRootId, revisionNo: 1, approvalState: "APPROVAL_PENDING",
    subjectVersion: version(1), sealedSnapshotChecksum: checksumOne, sealedAt, impactAnalysisEvidenceIds: [id(20)],
    privateFileRefs: [{ attachmentId: id(21), rowVersion: version(1), checksum: checksumOne }], ...input };
}

function orderRecord(input: Partial<ChangeOrderApprovalRecord> = {}): ChangeOrderApprovalRecord {
  return { changeOrderVersionId: orderId, changeOrderId: orderRootId, revisionNo: 1, sourceChangeRequestVersionId: requestId,
    releaseMode: "STANDARD", approvalState: "APPROVAL_PENDING", subjectVersion: version(1), sealedSnapshotChecksum: checksumOne,
    sealedAt, implementationEvidenceIds: [], verificationEvidenceIds: [], privateFileRefs: [], ...input };
}

describe("ECR/ECO exact typed Approval subjects", () => {
  it("binds ECR version/checksum/sealedAt and delivers trusted terminal Approval provenance", async () => {
    const exact = requestRecord();
    const applyVerifiedOutcome = vi.fn(async () => undefined);
    const adapter = new ChangeRequestApprovalSubjectAdapter({ loadExact: async () => exact, loadPrevious: async () => null }, { applyVerifiedOutcome }, completedResolver);
    const snapshot = await adapter.sealExactVersion({ kind: "CHANGE_REQUEST_VERSION", changeRequestVersionId: requestId });
    expect(snapshot).toEqual({ subject: { kind: "CHANGE_REQUEST_VERSION", changeRequestVersionId: requestId }, subjectVersion: version(1), checksum: checksumOne, sealedAt });
    await expect(adapter.assertExactVersion({ ...snapshot, checksum: checksumTwo })).rejects.toMatchObject({ code: "CHANGE_APPROVAL_SUBJECT_MISMATCH" });
    await adapter.applyApprovalOutcome({ snapshot, approvalInstanceId: approvalId, approvalVersion: version(3), outcome: "COMPLETED", provenance: provenance("COMPLETED") });
    expect(applyVerifiedOutcome).toHaveBeenCalledWith(expect.objectContaining({ decision: "APPROVED", exactVersion: exact, obligations: CHANGE_APPROVAL_OBLIGATIONS }));
  });

  it("requires direct strictly newer same-root ECR lineage after reject/recall", async () => {
    const previous = requestRecord({ approvalState: "REJECTED" });
    const current = requestRecord({ changeRequestVersionId: nextRequestId, revisionNo: 2, previousChangeRequestVersionId: requestId,
      subjectVersion: version(2), sealedSnapshotChecksum: checksumTwo });
    const snapshots = {
      previous: { subject: { kind: "CHANGE_REQUEST_VERSION" as const, changeRequestVersionId: requestId }, subjectVersion: version(1), checksum: checksumOne, sealedAt },
      current: { subject: { kind: "CHANGE_REQUEST_VERSION" as const, changeRequestVersionId: nextRequestId }, subjectVersion: version(2), checksum: checksumTwo, sealedAt }
    };
    const adapter = new ChangeRequestApprovalSubjectAdapter({ loadExact: async (value) => value === requestId ? previous : current,
      loadPrevious: async () => previous }, { applyVerifiedOutcome: async () => undefined }, completedResolver);
    await expect(adapter.assertResubmissionLineage(snapshots)).resolves.toBeUndefined();
    const wrongRoot = new ChangeRequestApprovalSubjectAdapter({ loadExact: async (value) => value === requestId ? previous : { ...current, changeRequestId: id(99) },
      loadPrevious: async () => previous }, { applyVerifiedOutcome: async () => undefined }, completedResolver);
    await expect(wrongRoot.assertResubmissionLineage(snapshots)).rejects.toMatchObject({ code: "CHANGE_REQUEST_RESUBMISSION_INVALID" });
    const reused = new ChangeRequestApprovalSubjectAdapter({ loadExact: async (value) => value === requestId ? previous : { ...current, subjectVersion: version(1) },
      loadPrevious: async () => previous }, { applyVerifiedOutcome: async () => undefined }, completedResolver);
    await expect(reused.assertResubmissionLineage({ ...snapshots, current: { ...snapshots.current, subjectVersion: version(1) } })).rejects.toMatchObject({ code: "CHANGE_REQUEST_RESUBMISSION_INVALID" });
  });

  it("requires exact ECR source or complete emergency retrospective evidence for ECO release", async () => {
    const noSource = orderRecord({ sourceChangeRequestVersionId: undefined });
    const invalid = new ChangeOrderApprovalSubjectAdapter({ loadExact: async () => noSource, loadPrevious: async () => null }, { applyVerifiedOutcome: async () => undefined }, completedResolver);
    await expect(invalid.sealExactVersion({ kind: "CHANGE_ORDER_VERSION", changeOrderVersionId: orderId })).rejects.toMatchObject({ code: "CHANGE_ORDER_SOURCE_ECR_REQUIRED" });
    const emergency = orderRecord({ sourceChangeRequestVersionId: undefined, releaseMode: "EMERGENCY_RETROSPECTIVE", emergencyEvidence: {
      emergencyExceptionId: id(30), policyVersionId: id(35), authorityCode: stableCode("EMERGENCY.CHANGE.RELEASE"),
      reason: "Immediate safety containment", riskAssessment: "Delay creates greater safety risk",
      temporaryAuthorityAssignmentId: id(34), temporaryAuthorityUserId: id(36), authorizedByUserId: id(31),
      authorizedByPositionId: stableCode("POSITION_LAB_DIRECTOR"), validFrom: utcInstant("2026-08-22T05:00:00Z"),
      validUntil: completedAt, retrospectiveApprovalDueAt: utcInstant("2026-08-23T07:00:00Z"), evidenceIds: [id(32)],
      privateFileRefs: [{ attachmentId: id(33), rowVersion: version(1), checksum: checksumTwo }], recordedAt: sealedAt
    } });
    const applyVerifiedOutcome = vi.fn(async () => undefined);
    const adapter = new ChangeOrderApprovalSubjectAdapter({ loadExact: async () => emergency, loadPrevious: async () => null }, { applyVerifiedOutcome }, completedResolver);
    const snapshot = await adapter.sealExactVersion({ kind: "CHANGE_ORDER_VERSION", changeOrderVersionId: orderId });
    await adapter.applyApprovalOutcome({ snapshot, approvalInstanceId: approvalId, approvalVersion: version(4), outcome: "COMPLETED", provenance: provenance("COMPLETED") });
    expect(applyVerifiedOutcome).toHaveBeenCalledWith(expect.objectContaining({ decision: "RETROSPECTIVE_APPROVAL_RECORDED",
      businessEffect: { kind: "APPEND_EMERGENCY_RETROSPECTIVE_APPROVAL", releaseTransitionAllowed: false }, retrospectiveEvidence: emergency.emergencyEvidence,
      completedApproval: expect.objectContaining({ approvalInstanceId: approvalId, subjectChecksum: checksumOne, officialApproverPositionId: stableCode("POSITION_LAB_DIRECTOR") }) }));
  });

  it("requires direct strictly newer same-root ECO lineage after recall", async () => {
    const previous = orderRecord({ approvalState: "RECALLED" });
    const current = orderRecord({ changeOrderVersionId: id(5), revisionNo: 2, previousChangeOrderVersionId: orderId,
      subjectVersion: version(2), sealedSnapshotChecksum: checksumTwo });
    const adapter = new ChangeOrderApprovalSubjectAdapter({ loadExact: async (value) => value === orderId ? previous : current,
      loadPrevious: async () => previous }, { applyVerifiedOutcome: async () => undefined }, completedResolver);
    await expect(adapter.assertResubmissionLineage({
      previous: { subject: { kind: "CHANGE_ORDER_VERSION", changeOrderVersionId: orderId }, subjectVersion: version(1), checksum: checksumOne, sealedAt },
      current: { subject: { kind: "CHANGE_ORDER_VERSION", changeOrderVersionId: id(5) }, subjectVersion: version(2), checksum: checksumTwo, sealedAt }
    })).resolves.toBeUndefined();
  });

  it("preserves approved ECO identity and permits only append-only operational evidence", () => {
    const before = orderRecord({ approvalState: "RELEASED", implementationEvidenceIds: [id(40)], privateFileRefs: [{ attachmentId: id(41), rowVersion: version(1), checksum: checksumOne }] });
    const after = { ...before, implementationEvidenceIds: [...before.implementationEvidenceIds, id(42)], verificationEvidenceIds: [id(43)],
      privateFileRefs: [...before.privateFileRefs, { attachmentId: id(44), rowVersion: version(1), checksum: checksumTwo }] };
    expect(() => assertChangeOrderEvidenceAppend(before, after)).not.toThrow();
    expect(() => assertChangeOrderEvidenceAppend(before, { ...after, sealedSnapshotChecksum: checksumTwo })).toThrowError(expect.objectContaining({ code: "CHANGE_ORDER_APPROVED_IDENTITY_OR_EVIDENCE_MUTATED" }));
    expect(() => assertChangeOrderEvidenceAppend(before, { ...after, implementationEvidenceIds: [] })).toThrowError(expect.objectContaining({ code: "CHANGE_ORDER_APPROVED_IDENTITY_OR_EVIDENCE_MUTATED" }));
  });

  it("never rewrites an approved ECR sealed identity or impact evidence manifest", () => {
    const approved = requestRecord({ approvalState: "APPROVED" });
    expect(() => assertChangeRequestApprovedIdentity(approved, structuredClone(approved))).not.toThrow();
    expect(() => assertChangeRequestApprovedIdentity(approved, { ...approved, impactAnalysisEvidenceIds: [id(99)] }))
      .toThrowError(expect.objectContaining({ code: "CHANGE_REQUEST_APPROVED_SUBJECT_MUTATED" }));
  });

  it("rejects forged terminal provenance", async () => {
    const exact = orderRecord();
    const adapter = new ChangeOrderApprovalSubjectAdapter({ loadExact: async () => exact, loadPrevious: async () => null }, { applyVerifiedOutcome: async () => undefined }, completedResolver);
    const snapshot = await adapter.sealExactVersion({ kind: "CHANGE_ORDER_VERSION", changeOrderVersionId: orderId });
    const bad = provenance("COMPLETED");
    await expect(adapter.applyApprovalOutcome({ snapshot, approvalInstanceId: approvalId, approvalVersion: version(3), outcome: "COMPLETED",
      provenance: { ...bad, occurredAt: utcInstant("2026-08-22T07:00:01Z") } })).rejects.toMatchObject({ code: "CHANGE_APPROVAL_PROVENANCE_INVALID" });
  });

  it("rejects a REVIEW/Senior action disguised as completed official approval", async () => {
    const exact = requestRecord();
    const senior = actor("POSITION_SENIOR_RESEARCHER");
    const resolver = { resolve: async (input: ApprovalOutcomeInput) => ({ ...(await completedResolver.resolve(input)),
      approvalStepRole: "APPROVAL" as const, officialApproverUserId: senior.effectiveUserId!, officialApproverPositionId: stableCode("POSITION_SENIOR_RESEARCHER") }) };
    const adapter = new ChangeRequestApprovalSubjectAdapter({ loadExact: async () => exact, loadPrevious: async () => null },
      { applyVerifiedOutcome: async () => undefined }, resolver);
    const snapshot = await adapter.sealExactVersion({ kind: "CHANGE_REQUEST_VERSION", changeRequestVersionId: requestId });
    const p = provenance("COMPLETED");
    await expect(adapter.applyApprovalOutcome({ snapshot, approvalInstanceId: approvalId, approvalVersion: version(3), outcome: "COMPLETED",
      provenance: { ...p, actor: senior, terminalAction: { ...p.terminalAction, actor: senior } } })).rejects.toMatchObject({ code: "CHANGE_OFFICIAL_APPROVAL_SNAPSHOT_INVALID" });
  });
});

function policyEntry(kind: "CHANGE_REQUEST_VERSION" | "CHANGE_ORDER_VERSION", seniorRole: "REVIEW" | "APPROVAL" = "REVIEW"): ChangeApprovalPolicyEntry {
  const seniorRule = { ruleId: id(100), sequenceNo: 1, role: seniorRole, completionMode: "SEQUENTIAL" as const, required: false,
    allowedPositionIds: [stableCode("POSITION_SENIOR_RESEARCHER")], allowedRoleIds: [] };
  const directorRule = { ruleId: id(101), sequenceNo: 2, role: "APPROVAL" as const, completionMode: "SEQUENTIAL" as const, required: true,
    allowedPositionIds: [stableCode("POSITION_LAB_DIRECTOR")], allowedRoleIds: [] };
  const seniorStep: ResolvedStep = { stepId: id(102), ruleId: seniorRule.ruleId, sequenceNo: 1, role: seniorRole, completionMode: "SEQUENTIAL", required: false,
    participants: [{ participantId: id(103), userId: id(104), positionId: stableCode("POSITION_SENIOR_RESEARCHER"), roleIds: [], order: 1 }] };
  const directorStep: ResolvedStep = { stepId: id(105), ruleId: directorRule.ruleId, sequenceNo: 2, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true,
    participants: [{ participantId: id(106), userId: id(107), positionId: stableCode("POSITION_LAB_DIRECTOR"), roleIds: [], order: 1 }] };
  const policy: ApprovalPolicyVersion = { policyVersionId: id(108), policyId: stableCode(`POL-${kind}`), version: 7, checksum: checksumOne,
    state: "PUBLISHED", effectiveFrom: utcInstant("2026-01-01T00:00:00Z"), selection: { subjectKinds: [kind], documentTypeIds: [],
      securityLevels: [], amountBand: { currency: "KRW", minInclusive: "10000000" }, strengthenedRisk: "ANY" }, recallAllowed: true,
    steps: [seniorRule, directorRule] };
  return { policy, line: [seniorStep, directorStep], selectionPriority: 10,
    basis: { kind: "INTERNAL_PRESET", referenceId: stableCode("CHANGE.APPROVAL.BASELINE"), version: 7 } };
}

describe("versioned change Approval policy and Vendor projection", () => {
  const authority: ChangeApprovalAuthorityPolicy = { isOfficialChangeApprover: (position) => position === "POSITION_LAB_DIRECTOR" || position === "POSITION_REPRESENTATIVE" };
  it("allows Senior REVIEW evidence but never Senior official approval", () => {
    expect(() => validateChangeApprovalPolicy(policyEntry("CHANGE_REQUEST_VERSION"), authority)).not.toThrow();
    expect(() => validateChangeApprovalPolicy(policyEntry("CHANGE_REQUEST_VERSION", "APPROVAL"), authority)).toThrowError(expect.objectContaining({ code: "CHANGE_APPROVAL_OFFICIAL_AUTHORITY_INVALID" }));
  });

  it("selects effective amount/risk policy data without a hard-coded threshold", () => {
    const selected = selectChangeApprovalPolicy([policyEntry("CHANGE_ORDER_VERSION")], { subjectKind: "CHANGE_ORDER_VERSION", at: completedAt,
      selection: { amount: { currency: "KRW", value: "25000000" }, strengthenedRisk: false } }, authority);
    expect(selected.basis).toEqual({ kind: "INTERNAL_PRESET", referenceId: stableCode("CHANGE.APPROVAL.BASELINE"), version: 7 });
  });

  it("projects no Approval line, internal deliberation or private-file reference to Vendor", () => {
    const projection = projectChangeForVendor(orderRecord());
    expect(projection).toEqual({ changeKind: "ECO", recordId: orderId, revisionNo: 1, publicState: "PENDING", vendorResponsibilityPreserved: true });
    expect(projection).not.toHaveProperty("privateFileRefs");
    expect(projection).not.toHaveProperty("approvalInstanceId");
    expect(projection).not.toHaveProperty("impactAnalysisEvidenceIds");
  });
});

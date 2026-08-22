import { describe, expect, it, vi } from "vitest";
import type { ApprovalActorSnapshot, ApprovalOutcomeInput } from "../../packages/core/approval/src/public.js";
import {
  ChangeOrderApprovalSubjectAdapter,
  ChangeRequestApprovalSubjectAdapter,
  assertTrustedChangeApprovalOutcome,
  type ChangeOrderApprovalRecord,
  type ChangeRequestApprovalRecord,
  type CompletedChangeApprovalSnapshot
} from "../../packages/features/change/src/approval/contracts.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const id = (n: number) => uuid(`8b000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const sealedAt = utcInstant("2026-08-22T08:00:00Z");
const completedAt = utcInstant("2026-08-22T09:00:00Z");
const checksum = sha256("a".repeat(64));
const requestVersionId = id(1);
const orderVersionId = id(2);
const approvalInstanceId = id(3);

function actor(): ApprovalActorSnapshot {
  return {
    actorType: "USER",
    accountKind: "INTERNAL",
    authenticatedUserId: id(4),
    effectiveUserId: id(4),
    positionIds: [stableCode("POSITION_LAB_DIRECTOR")],
    roleIds: []
  };
}

function input(subject: ApprovalOutcomeInput["snapshot"]["subject"]): ApprovalOutcomeInput {
  const actionActor = actor();
  return {
    snapshot: { subject, subjectVersion: version(1), checksum, sealedAt },
    approvalInstanceId,
    approvalVersion: version(3),
    outcome: "COMPLETED",
    provenance: {
      terminalAction: { actionId: id(5), kind: "APPROVE", at: completedAt, actor: actionActor },
      actor: actionActor,
      occurredAt: completedAt,
      correlationId: correlationId("m10-trusted-outcome"),
      idempotencyKey: idempotencyKey("m10-trusted-outcome")
    }
  };
}

function completed(
  approvalInput: ApprovalOutcomeInput,
  subject: CompletedChangeApprovalSnapshot["subject"] = approvalInput.snapshot.subject as CompletedChangeApprovalSnapshot["subject"]
): CompletedChangeApprovalSnapshot {
  return {
    approvalInstanceId: approvalInput.approvalInstanceId,
    approvalVersion: approvalInput.approvalVersion,
    approvalPolicyVersionId: id(6),
    approvalPolicyChecksum: checksum,
    approvalStepId: id(7),
    approvalParticipantId: id(8),
    approvalStepRole: "APPROVAL",
    authorityPolicyEvidenceId: id(9),
    subject,
    subjectVersion: approvalInput.snapshot.subjectVersion,
    subjectChecksum: approvalInput.snapshot.checksum,
    subjectSealedAt: approvalInput.snapshot.sealedAt,
    completedAt: approvalInput.provenance.occurredAt,
    officialApproverUserId: approvalInput.provenance.actor.effectiveUserId!,
    officialApproverPositionId: stableCode("POSITION_LAB_DIRECTOR")
  };
}

function requestRecord(): ChangeRequestApprovalRecord {
  return {
    changeRequestVersionId: requestVersionId,
    changeRequestId: id(10),
    revisionNo: 1,
    approvalState: "APPROVAL_PENDING",
    subjectVersion: version(1),
    sealedSnapshotChecksum: checksum,
    sealedAt,
    impactAnalysisEvidenceIds: [id(11)],
    privateFileRefs: []
  };
}

function orderRecord(releaseMode: ChangeOrderApprovalRecord["releaseMode"]): ChangeOrderApprovalRecord {
  return {
    changeOrderVersionId: orderVersionId,
    changeOrderId: id(12),
    revisionNo: 1,
    ...(releaseMode === "STANDARD" ? { sourceChangeRequestVersionId: requestVersionId } : {}),
    releaseMode,
    ...(releaseMode === "EMERGENCY_RETROSPECTIVE" ? {
      emergencyEvidence: {
        emergencyExceptionId: id(13),
        policyVersionId: id(14),
        authorityCode: stableCode("EMERGENCY.CHANGE.RELEASE"),
        reason: "Immediate safety containment",
        riskAssessment: "Delay presents the greater risk",
        temporaryAuthorityAssignmentId: id(15),
        temporaryAuthorityUserId: id(16),
        authorizedByUserId: id(17),
        authorizedByPositionId: stableCode("POSITION_LAB_DIRECTOR"),
        validFrom: utcInstant("2026-08-22T07:00:00Z"),
        validUntil: utcInstant("2026-08-22T10:00:00Z"),
        retrospectiveApprovalDueAt: utcInstant("2026-08-23T09:00:00Z"),
        evidenceIds: [id(18)],
        privateFileRefs: [{ attachmentId: id(19), rowVersion: version(1), checksum }],
        recordedAt: sealedAt
      }
    } : {}),
    approvalState: "APPROVAL_PENDING",
    subjectVersion: version(1),
    sealedSnapshotChecksum: checksum,
    sealedAt,
    implementationEvidenceIds: [],
    verificationEvidenceIds: [],
    privateFileRefs: []
  };
}

describe("M10 trusted Approval outcome contract", () => {
  it("maps a standard ECO completion to the only release-capable effect", async () => {
    const exact = orderRecord("STANDARD");
    const applyVerifiedOutcome = vi.fn(async (outcome: unknown) => assertTrustedChangeApprovalOutcome(outcome));
    const adapter = new ChangeOrderApprovalSubjectAdapter(
      { loadExact: async () => exact, loadPrevious: async () => null },
      { applyVerifiedOutcome },
      { resolve: async (approvalInput) => completed(approvalInput) }
    );
    const approvalInput = input({ kind: "CHANGE_ORDER_VERSION", changeOrderVersionId: orderVersionId });

    await adapter.applyApprovalOutcome(approvalInput);

    expect(applyVerifiedOutcome).toHaveBeenCalledWith(expect.objectContaining({
      decision: "RELEASED",
      businessEffect: { kind: "RELEASE_STANDARD_CHANGE_ORDER", releaseTransitionAllowed: true }
    }));
  });

  it("maps emergency completion only to append-only retrospective evidence and never to release", async () => {
    const exact = orderRecord("EMERGENCY_RETROSPECTIVE");
    const applyVerifiedOutcome = vi.fn(async (outcome: unknown) => assertTrustedChangeApprovalOutcome(outcome));
    const adapter = new ChangeOrderApprovalSubjectAdapter(
      { loadExact: async () => exact, loadPrevious: async () => null },
      { applyVerifiedOutcome },
      { resolve: async (approvalInput) => completed(approvalInput) }
    );
    const approvalInput = input({ kind: "CHANGE_ORDER_VERSION", changeOrderVersionId: orderVersionId });

    await adapter.applyApprovalOutcome(approvalInput);

    const outcome = applyVerifiedOutcome.mock.calls[0]![0] as Record<string, unknown>;
    expect(outcome).toMatchObject({
      decision: "RETROSPECTIVE_APPROVAL_RECORDED",
      businessEffect: { kind: "APPEND_EMERGENCY_RETROSPECTIVE_APPROVAL", releaseTransitionAllowed: false },
      obligations: { emergencyRetrospectiveApprovalNeverReleasesAgain: true }
    });
    expect(outcome).not.toMatchObject({ decision: "RELEASED" });
  });

  it("rejects a terminal Approval snapshot resolved for another typed subject ID", async () => {
    const exact = requestRecord();
    const adapter = new ChangeRequestApprovalSubjectAdapter(
      { loadExact: async () => exact, loadPrevious: async () => null },
      { applyVerifiedOutcome: async () => undefined },
      { resolve: async (approvalInput) => completed(approvalInput, { kind: "CHANGE_REQUEST_VERSION", changeRequestVersionId: id(99) }) }
    );

    await expect(adapter.applyApprovalOutcome(input({ kind: "CHANGE_REQUEST_VERSION", changeRequestVersionId: requestVersionId })))
      .rejects.toMatchObject({ code: "CHANGE_OFFICIAL_APPROVAL_SNAPSHOT_INVALID" });
  });

  it("rejects structural lookalikes while accepting and freezing adapter-minted outcomes", async () => {
    expect(() => assertTrustedChangeApprovalOutcome({ decision: "APPROVED" }))
      .toThrowError(expect.objectContaining({ code: "CHANGE_APPROVAL_OUTCOME_NOT_TRUSTED" }));

    let captured: unknown;
    const adapter = new ChangeRequestApprovalSubjectAdapter(
      { loadExact: async () => requestRecord(), loadPrevious: async () => null },
      { applyVerifiedOutcome: async (outcome) => { captured = outcome; assertTrustedChangeApprovalOutcome(outcome); } },
      { resolve: async (approvalInput) => completed(approvalInput) }
    );
    await adapter.applyApprovalOutcome(input({ kind: "CHANGE_REQUEST_VERSION", changeRequestVersionId: requestVersionId }));

    expect(() => assertTrustedChangeApprovalOutcome(captured)).not.toThrow();
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen((captured as { exactVersion: object }).exactVersion)).toBe(true);
  });
});

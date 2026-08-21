import { describe, expect, it, vi } from "vitest";
import {
  ApprovalInstance,
  commitApprovalMutation,
  validateResearchProjectDesignationPolicy,
  type ApprovalActorSnapshot,
  type ApprovalMutation,
  type ApprovalPolicyVersion,
  type ApprovalSubject,
  type ApprovalSubjectPortRegistry,
  type ApprovalSubjectSnapshot,
  type ApprovalTransactionContext,
  type ApprovalUnitOfWork,
  type ResolvedStep,
  type TypedApprovalSubjectPort
} from "../../packages/core/approval/src/public.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const at = utcInstant("2026-08-22T09:00:00Z");
const directorId = uuid("61000000-0000-4000-8000-000000000001");
const ruleId = uuid("61000000-0000-4000-8000-000000000002");
const stepId = uuid("61000000-0000-4000-8000-000000000003");
const participantId = uuid("61000000-0000-4000-8000-000000000004");

function designationPolicy(): ApprovalPolicyVersion {
  return {
    policyVersionId: uuid("62000000-0000-4000-8000-000000000001"),
    policyId: stableCode("POL-APPROVAL-MATRIX-V1"),
    version: 1,
    checksum: sha256("a".repeat(64)),
    state: "PUBLISHED",
    effectiveFrom: at,
    selection: { subjectKinds: ["RESEARCH_PROJECT_APPLICATION"], documentTypeIds: [], securityLevels: [], strengthenedRisk: "ANY" },
    recallAllowed: true,
    steps: [{ ruleId, sequenceNo: 1, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true, allowedPositionIds: [stableCode("POSITION_LAB_DIRECTOR")], allowedRoleIds: [] }]
  };
}

function directorLine(): readonly ResolvedStep[] {
  return [{
    stepId, ruleId, sequenceNo: 1, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true,
    participants: [{ participantId, userId: directorId, positionId: stableCode("POSITION_LAB_DIRECTOR"), roleIds: [], order: 1 }]
  }];
}

describe("M06 formal-research approval policy contract", () => {
  it("accepts one required sequential Lab Director consent step", () => {
    expect(() => validateResearchProjectDesignationPolicy(designationPolicy(), directorLine())).not.toThrow();
  });

  it("rejects a generic multi-subject policy even when its resolved line contains only the Director", () => {
    const policy = designationPolicy();
    const generic = { ...policy, selection: { ...policy.selection, subjectKinds: ["RESEARCH_PROJECT_APPLICATION" as const, "DOCUMENT_VERSION" as const] } };
    expect(() => validateResearchProjectDesignationPolicy(generic, directorLine())).toThrow(/dedicated subject policy/i);
    const submitterId = uuid("62000000-0000-4000-8000-000000000003");
    const instance = ApprovalInstance.create({ approvalInstanceId: uuid("62000000-0000-4000-8000-000000000004"), submitterUserId: submitterId });
    expect(() => instance.submit({
      actor: { actorType: "USER", accountKind: "INTERNAL", authenticatedUserId: submitterId, effectiveUserId: submitterId, positionIds: [], roleIds: [] },
      at, expectedVersion: version(0), actionId: uuid("62000000-0000-4000-8000-000000000005"), eventId: uuid("62000000-0000-4000-8000-000000000006"),
      correlationId: correlationId("m06:generic-policy"), idempotencyKey: idempotencyKey("m06:generic-policy:1")
    }, { subject: { kind: "RESEARCH_PROJECT_APPLICATION", researchProjectApplicationVersionId: uuid("62000000-0000-4000-8000-000000000007") }, subjectVersion: version(1), checksum: sha256("c".repeat(64)), sealedAt: at }, generic, directorLine(), { strengthenedRisk: false })).toThrow(/dedicated subject policy/i);
  });

  it.each(["POSITION_SENIOR_RESEARCHER", "POSITION_REPRESENTATIVE"])("rejects an extra %s policy candidate", (position) => {
    const policy = designationPolicy();
    const step = policy.steps[0]!;
    expect(() => validateResearchProjectDesignationPolicy({ ...policy, steps: [{ ...step, allowedPositionIds: [...step.allowedPositionIds, stableCode(position)] }] }, directorLine())).toThrow(/only the Lab Director/i);
  });

  it("rejects a non-sequential consent mode", () => {
    const policy = designationPolicy();
    expect(() => validateResearchProjectDesignationPolicy({ ...policy, steps: [{ ...policy.steps[0]!, completionMode: "ANY_ONE" }] }, directorLine())).toThrow(/SEQUENTIAL/i);
  });

  it("rejects an additional Senior review step", () => {
    const policy = designationPolicy();
    expect(() => validateResearchProjectDesignationPolicy({ ...policy, steps: [...policy.steps, { ...policy.steps[0]!, ruleId: uuid("62000000-0000-4000-8000-000000000002"), sequenceNo: 2, role: "REVIEW", allowedPositionIds: [stableCode("POSITION_SENIOR_RESEARCHER")] }] }, directorLine())).toThrow(/exactly one policy step/i);
  });
});

type DesignationSubject = Extract<ApprovalSubject, { kind: "RESEARCH_PROJECT_APPLICATION" }>;

describe("M06 terminal outcome provenance contract", () => {
  it("passes terminal reason, actor authority evidence, time, correlation, and idempotency inside the Approval UoW", async () => {
    const applicationVersionId = uuid("63000000-0000-4000-8000-000000000001");
    const subject: ApprovalSubjectSnapshot = { subject: { kind: "RESEARCH_PROJECT_APPLICATION", researchProjectApplicationVersionId: applicationVersionId }, subjectVersion: version(2), checksum: sha256("b".repeat(64)), sealedAt: at };
    const authorityEvidenceId = uuid("63000000-0000-4000-8000-000000000002");
    const delegateId = uuid("63000000-0000-4000-8000-000000000003");
    const actor: ApprovalActorSnapshot = {
      actorType: "USER", accountKind: "INTERNAL", authenticatedUserId: delegateId, effectiveUserId: directorId,
      positionIds: [], roleIds: [], actingAuthority: {
        assignmentId: uuid("63000000-0000-4000-8000-000000000004"), evidenceId: authorityEvidenceId,
        grantorUserId: directorId, delegateUserId: delegateId, representedPositionId: stableCode("POSITION_LAB_DIRECTOR"),
        allowedActionIds: [stableCode("approval.step.reject")], validFrom: utcInstant("2026-08-22T08:00:00Z"), validTo: utcInstant("2026-08-22T10:00:00Z"), reason: "director absence"
      }
    };
    const approvalInstanceId = uuid("63000000-0000-4000-8000-000000000005");
    const actionId = uuid("63000000-0000-4000-8000-000000000006");
    const eventId = uuid("63000000-0000-4000-8000-000000000007");
    const reasonCode = stableCode("RP_RETURN_FOR_REVISION");
    const requestCorrelationId = correlationId("m06:designation:reject");
    const requestIdempotencyKey = idempotencyKey("m06:designation:reject:1");
    const mutation: ApprovalMutation = {
      expectedVersion: version(2),
      instance: {
        approvalInstanceId, generation: 1, submitterUserId: uuid("63000000-0000-4000-8000-000000000008"), state: "REJECTED", version: version(3),
        submission: { submittedAt: at, submittedBy: actor, subject, policy: designationPolicy(), policySelectionInput: { strengthenedRisk: false }, line: directorLine() },
        steps: [], actions: []
      },
      appendedAction: { actionId, kind: "REJECT", at, actor, stepId, participantId, reasonCode },
      events: [{ eventId, eventType: stableCode("EVT-APPROVAL-REJECTED"), aggregateId: approvalInstanceId, aggregateVersion: version(3), occurredAt: at, correlationId: requestCorrelationId, idempotencyKey: requestIdempotencyKey, payload: {} }],
      audit: { eventType: stableCode("EVT-APPROVAL-REJECTED"), actor, aggregateId: approvalInstanceId, actionId, occurredAt: at, correlationId: requestCorrelationId, metadata: {} }
    };
    const outcome = vi.fn<TypedApprovalSubjectPort<DesignationSubject>["applyApprovalOutcome"]>();
    const authorityCheck = vi.fn(async () => undefined);
    const port: TypedApprovalSubjectPort<DesignationSubject> = {
      kind: "RESEARCH_PROJECT_APPLICATION", sealExactVersion: async () => subject, assertExactVersion: async () => undefined,
      assertResubmissionLineage: async () => undefined, applyApprovalOutcome: outcome
    };
    const context: ApprovalTransactionContext = {
      approvals: { loadForUpdate: async () => null, insert: async () => undefined, save: async () => true },
      evidence: { appendAction: async () => undefined, appendAudit: async () => undefined, enqueue: async () => undefined },
      subjects: { get: () => port } as ApprovalSubjectPortRegistry,
      actingAuthorities: { assertActive: authorityCheck }
    };
    const uow: ApprovalUnitOfWork = { transact: async (work) => work(context) };

    await commitApprovalMutation(uow, mutation);

    expect(authorityCheck).toHaveBeenCalledWith(expect.objectContaining({ evidenceId: authorityEvidenceId, action: "approval.step.reject", at }));
    expect(outcome).toHaveBeenCalledWith(expect.objectContaining({
      snapshot: subject, approvalInstanceId, approvalVersion: version(3), outcome: "REJECTED",
      provenance: expect.objectContaining({ terminalReasonCode: reasonCode, actor, actingAuthorityEvidenceId: authorityEvidenceId, occurredAt: at, correlationId: requestCorrelationId, idempotencyKey: requestIdempotencyKey })
    }));
  });
});

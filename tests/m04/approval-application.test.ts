import { describe, expect, it, vi } from "vitest";
import { ApprovalSubjectLineageError, approvalPermissionForAction, commitApprovalMutation, type ApprovalMutation, type ApprovalSubjectPortRegistry, type ApprovalSubjectSnapshot, type ApprovalTransactionContext, type ApprovalUnitOfWork, type TypedApprovalSubjectPort } from "../../packages/core/approval/src/public.js";
import { correlationId, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const at = utcInstant("2026-08-22T00:00:00Z");
const previousId = uuid("11000000-0000-4000-8000-000000000001");
const currentId = uuid("11000000-0000-4000-8000-000000000002");
const previous: ApprovalSubjectSnapshot = { subject: { kind: "DOCUMENT_VERSION", documentVersionId: previousId }, subjectVersion: version(1), checksum: sha256("a".repeat(64)), sealedAt: at };
const current: ApprovalSubjectSnapshot = { subject: { kind: "DOCUMENT_VERSION", documentVersionId: currentId }, subjectVersion: version(2), checksum: sha256("b".repeat(64)), sealedAt: at };
const actor = { actorType: "USER" as const, accountKind: "INTERNAL" as const, authenticatedUserId: uuid("12000000-0000-4000-8000-000000000001"), effectiveUserId: uuid("12000000-0000-4000-8000-000000000001"), positionIds: [stableCode("POSITION_LAB_DIRECTOR")], roleIds: [] };

function mutation(prior: ApprovalSubjectSnapshot, next: ApprovalSubjectSnapshot): ApprovalMutation {
  const approvalInstanceId = uuid("13000000-0000-4000-8000-000000000001");
  const actionId = uuid("14000000-0000-4000-8000-000000000001");
  return { expectedVersion: version(0), instance: { approvalInstanceId, generation: 2, previousInstanceId: uuid("13000000-0000-4000-8000-000000000000"), submitterUserId: actor.effectiveUserId, state: "SUBMITTED", version: version(1), resubmissionOfSubject: prior, submission: { submittedAt: at, submittedBy: actor, subject: next, policySelectionInput: { strengthenedRisk: false }, policy: { policyVersionId: uuid("15000000-0000-4000-8000-000000000001"), policyId: stableCode("POL-APPROVAL-MATRIX-V1"), version: 1, checksum: sha256("c".repeat(64)), state: "PUBLISHED", effectiveFrom: at, selection: { subjectKinds: [next.subject.kind], documentTypeIds: [], securityLevels: [], strengthenedRisk: "ANY" }, recallAllowed: true, steps: [] }, line: [] }, steps: [], actions: [] }, appendedAction: { actionId, kind: "SUBMIT", at, actor }, events: [], audit: { eventType: stableCode("EVT-APPROVAL-SUBMITTED"), actor, aggregateId: approvalInstanceId, actionId, occurredAt: at, correlationId: correlationId("m04:lineage"), metadata: {} } };
}

function unitOfWork(records: Map<string, { root: string; version: number; checksum: string }>, lineage = vi.fn()): ApprovalUnitOfWork {
  const adapter: TypedApprovalSubjectPort = {
    kind: "DOCUMENT_VERSION", sealExactVersion: async () => current, assertExactVersion: async () => undefined, applyApprovalOutcome: async () => undefined,
    assertResubmissionLineage: async ({ previous: p, current: c }) => {
      lineage();
      if (p.subject.kind !== "DOCUMENT_VERSION" || c.subject.kind !== "DOCUMENT_VERSION") throw new ApprovalSubjectLineageError("kind");
      const oldRecord = records.get(p.subject.documentVersionId); const newRecord = records.get(c.subject.documentVersionId);
      if (!oldRecord || !newRecord || oldRecord.root !== newRecord.root || newRecord.version <= oldRecord.version || oldRecord.checksum !== p.checksum || newRecord.checksum !== c.checksum) throw new ApprovalSubjectLineageError("adapter lineage mismatch");
    }
  };
  const context: ApprovalTransactionContext = { approvals: { loadForUpdate: async () => null, insert: async () => undefined, save: async () => true }, evidence: { appendAction: async () => undefined, appendAudit: async () => undefined, enqueue: async () => undefined }, subjects: { get: () => adapter } as ApprovalSubjectPortRegistry, actingAuthorities: { assertActive: async () => undefined } };
  return { transact: async (work) => work(context) };
}

describe("M04 resubmission subject lineage UoW", () => {
  const validRecords = () => new Map([[previousId as string, { root: "DOC-1", version: 1, checksum: previous.checksum as string }], [currentId as string, { root: "DOC-1", version: 2, checksum: current.checksum as string }]]);
  it("accepts only the same root with a newer immutable exact version", async () => { const called = vi.fn(); await commitApprovalMutation(unitOfWork(validRecords(), called), mutation(previous, current)); expect(called).toHaveBeenCalledOnce(); });
  it("rejects another kind before calling the adapter", async () => { const other: ApprovalSubjectSnapshot = { ...current, subject: { kind: "PURCHASE_REQUEST", purchaseRequestVersionId: currentId } }; await expect(commitApprovalMutation(unitOfWork(validRecords()), mutation(previous, other))).rejects.toBeInstanceOf(ApprovalSubjectLineageError); });
  it("rejects a non-new version", async () => { await expect(commitApprovalMutation(unitOfWork(validRecords()), mutation(previous, { ...current, subjectVersion: version(1) }))).rejects.toBeInstanceOf(ApprovalSubjectLineageError); });
  it("rejects another subject root", async () => { const records = validRecords(); records.set(currentId, { ...records.get(currentId)!, root: "DOC-2" }); await expect(commitApprovalMutation(unitOfWork(records), mutation(previous, current))).rejects.toBeInstanceOf(ApprovalSubjectLineageError); });
  it("rejects a tampered checksum", async () => { await expect(commitApprovalMutation(unitOfWork(validRecords()), mutation(previous, { ...current, checksum: sha256("d".repeat(64)) }))).rejects.toBeInstanceOf(ApprovalSubjectLineageError); });
  it("maps reference receipt to the canonical stable permission", () => { expect(approvalPermissionForAction("REFERENCE_RECEIPT")).toBe("approval.step.reference"); });
});

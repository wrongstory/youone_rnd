import { describe, expect, it } from "vitest";
import {
  ECR_TRANSITION_MAP,
  ECO_TRANSITION_MAP,
  EngineeringChangeOrder,
  EngineeringChangeRequest,
  type ChangeActorSnapshot,
  type ChangeCommand,
  type EcrImpactAnalysisSnapshot,
  type OfficialChangeApprovalEvidence
} from "../../packages/features/change/src/domain/ecr-eco.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const ids = Array.from({ length: 40 }, (_, index) => uuid(`a1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`));
const [ecrId, ecoId, projectId, contractId, ownerId, reviewerId, approverId, implementerId, verifierId, evidenceId, targetId, documentId, beforeId, afterId, approvalId] = ids;
let sequence = 0;
const internal = (userId: typeof ownerId, ...authorities: string[]): ChangeActorSnapshot => ({ actorKind: "INTERNAL", userId, active: true, positionIds: [], authorities: authorities.map(stableCode) });
function command(actor: ChangeActorSnapshot, expectedVersion: number, at?: string): ChangeCommand {
  sequence += 1;
  return { actor, expectedVersion: version(expectedVersion), at: utcInstant(at ?? `2026-08-22T01:${String(sequence % 60).padStart(2, "0")}:00Z`), eventId: uuid(`b1000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`), correlationId: correlationId(`m10-${sequence}`), idempotencyKey: idempotencyKey(`m10-${sequence}`) };
}
function createCommand(actor: ChangeActorSnapshot, at?: string) { const { expectedVersion: _expected, ...rest } = command(actor, 0, at); void _expected; return rest; }
const noImpact = (analysis: string) => ({ effect: "NO_IMPACT" as const, analysis, evidenceIds: [] });
function impacts(): EcrImpactAnalysisSnapshot { return { impactAnalysisId: ids[31]!, changeRequestVersionId: ids[37]!, cost: noImpact("원가 영향 없음"), schedule: noImpact("일정 영향 없음"), quality: noImpact("품질 영향 없음"), safety: noImpact("안전 영향 없음"), security: noImpact("보안 영향 없음"), regulatory: noImpact("규제 영향 없음"), checksum: sha256("1".repeat(64)), completedByUserId: ownerId!, completedAt: utcInstant("2026-08-22T01:03:00Z") }; }
function approval(subjectVersionId: typeof ecrId, subjectVersion: number, checksum: ReturnType<typeof sha256>, sealedAt: ReturnType<typeof utcInstant>, completedAt = "2026-08-22T01:06:00Z"): OfficialChangeApprovalEvidence { return { approvalInstanceId: approvalId!, approvalVersion: version(1), subjectVersionId, subjectVersion: version(subjectVersion), subjectChecksum: checksum, subjectSealedAt: sealedAt, completedAt: utcInstant(completedAt), officialApproverUserId: approverId!, officialApproverPositionId: stableCode("POSITION_LAB_DIRECTOR") }; }
function approvedEcr() {
  const created = EngineeringChangeRequest.create({ ecrId: ecrId!, ecrNo: "ECR-001", title: "설계 변경", priority: "HIGH", projectId: projectId!, contractId: contractId!, linkedNcrIds: [ids[30]!], rationale: "요구조건 변경", requestedChange: "도면 개정", originatorUserId: ownerId! }, createCommand(internal(ownerId!, "change.request.create")));
  const aggregate = EngineeringChangeRequest.restore(created.snapshot);
  aggregate.startAnalysis(command(internal(ownerId!, "change.request.manage"), 1));
  aggregate.submitReview(command(internal(ownerId!, "change.impact.analyze"), 2), impacts());
  aggregate.review(command(internal(reviewerId!, "change.request.review"), 3), { comment: "기술검토 완료", evidenceIds: [evidenceId!] });
  const exact = aggregate.snapshot();
  aggregate.approve(command(internal(approverId!, "change.request.approve"), 4), approval(exact.sealedSubjectVersionId!, 3, exact.sealedSubjectChecksum!, exact.sealedSubjectAt!));
  return aggregate.snapshot();
}
function draftEco(contractChange = false) {
  const ecr = approvedEcr();
  return EngineeringChangeOrder.create({ ecoId: ecoId!, ecoNo: "ECO-001", title: "도면 개정 실행", priority: "HIGH", projectId: projectId!, contractId: contractId!, linkedNcrIds: [ids[30]!], origin: { kind: "APPROVED_ECR", ecrId: ecr.ecrId, ecrVersion: ecr.version, ecrState: "APPROVED", sealedSubjectVersionId: ecr.sealedSubjectVersionId!, sealedSubjectVersion: ecr.sealedSubjectVersion!, sealedSubjectChecksum: ecr.sealedSubjectChecksum!, sealedSubjectAt: ecr.sealedSubjectAt!, officialApproval: ecr.officialApproval! }, targets: contractChange ? [{ kind: "CONTRACT_VERSION", targetId: targetId!, contractId: contractId!, beforeRevisionId: beforeId!, afterRevisionId: afterId! }] : [{ kind: "DOCUMENT_VERSION", targetId: targetId!, documentId: documentId!, beforeRevisionId: beforeId!, afterRevisionId: afterId! }], contractChangeEffect: { changesScope: contractChange, changesAmount: false, changesDeadline: false, changesAcceptanceCriteria: false }, verificationRequirements: { retestRequired: true, reinspectionRequired: true, basis: "위험기반 재시험·재검사" } }, createCommand(internal(ownerId!, "change.order.manage")));
}
function releasedEco() {
  const created = draftEco(); const eco = EngineeringChangeOrder.restore(created.snapshot);
  eco.submit(command(internal(ownerId!, "change.order.manage"), 1), { changeOrderVersionId: ids[38]!, checksum: sha256("2".repeat(64)) });
  const sealed = eco.snapshot();
  eco.release(command(internal(approverId!, "change.request.approve"), 2), approval(sealed.sealedDefinitionVersionId!, 2, sealed.sealedDefinitionChecksum!, sealed.sealedDefinitionAt!));
  eco.start(command(internal(implementerId!, "change.order.implement"), 3));
  return eco;
}

describe("SM-ECR-V1 / SM-ECO-V1", () => {
  it("publishes only canonical constrained transitions", () => {
    expect(ECR_TRANSITION_MAP["EVT-ECR-REVIEWED"]).toEqual({ from: ["REVIEW_PENDING"], to: "APPROVAL_PENDING" });
    expect(ECO_TRANSITION_MAP["EVT-ECO-SUSPEND"]).toEqual({ from: ["RELEASED", "IMPLEMENTING"], to: "SUSPENDED" });
    expect(ECO_TRANSITION_MAP).not.toHaveProperty("EVT-ECO-IMPLEMENT-TARGET");
  });

  it("requires all six completed impact assessments and keeps Senior review-only", () => {
    const created = EngineeringChangeRequest.create({ ecrId: ecrId!, ecrNo: "ECR-002", title: "변경", priority: "NORMAL", projectId: projectId!, linkedNcrIds: [], rationale: "근거", requestedChange: "변경", originatorUserId: ownerId! }, createCommand(internal(ownerId!, "change.request.create")));
    const ecr = EngineeringChangeRequest.restore(created.snapshot); ecr.startAnalysis(command(internal(ownerId!, "change.request.manage"), 1));
    expect(() => ecr.submitReview(command(internal(ownerId!, "change.impact.analyze"), 2), { ...impacts(), safety: { effect: "AFFECTED", analysis: "위험 증가", evidenceIds: [] } })).toThrowError(expect.objectContaining({ code: "ECR_SAFETY_IMPACT_EVIDENCE_REQUIRED" }));
    ecr.submitReview(command(internal(ownerId!, "change.impact.analyze"), 2), impacts()); ecr.review(command(internal(reviewerId!, "change.request.review"), 3), { comment: "검토", evidenceIds: [evidenceId!] });
    const sealed = ecr.snapshot();
    expect(() => ecr.approve(command({ ...internal(approverId!, "change.request.approve"), positionIds: [stableCode("POSITION_SENIOR_RESEARCHER")] }, 4), approval(sealed.sealedSubjectVersionId!, 3, sealed.sealedSubjectChecksum!, sealed.sealedSubjectAt!))).toThrowError(expect.objectContaining({ code: "CHANGE_OFFICIAL_APPROVER_INVALID" }));
  });

  it("requires exact typed before/after revisions and creates no physical BOM target", () => {
    const ecr = approvedEcr();
    expect(() => EngineeringChangeOrder.create({ ecoId: ecoId!, ecoNo: "ECO-X", title: "bad", priority: "NORMAL", projectId: projectId!, linkedNcrIds: [], origin: { kind: "APPROVED_ECR", ecrId: ecr.ecrId, ecrVersion: ecr.version, ecrState: "APPROVED", sealedSubjectVersionId: ecr.sealedSubjectVersionId!, sealedSubjectVersion: ecr.sealedSubjectVersion!, sealedSubjectChecksum: ecr.sealedSubjectChecksum!, sealedSubjectAt: ecr.sealedSubjectAt!, officialApproval: ecr.officialApproval! }, targets: [{ kind: "DOCUMENT_VERSION", targetId: targetId!, documentId: documentId!, beforeRevisionId: beforeId!, afterRevisionId: beforeId! }], contractChangeEffect: { changesScope: false, changesAmount: false, changesDeadline: false, changesAcceptanceCriteria: false }, verificationRequirements: { retestRequired: false, reinspectionRequired: false, basis: "영향 없음" } }, createCommand(internal(ownerId!, "change.order.manage")))).toThrowError(expect.objectContaining({ code: "ECO_NEW_REVISION_REQUIRED" }));
  });

  it("retains each implementation and forbids implementer self-verification", () => {
    const eco = releasedEco();
    const implemented = eco.recordImplementation(command(internal(implementerId!, "change.order.implement"), 4), { ecoImplementationId: ids[32]!, targetId: targetId!, beforeRevisionId: beforeId!, createdAfterRevisionId: afterId!, evidenceIds: [evidenceId!] });
    expect(implemented.immutableImplementation).toMatchObject({ beforeRevisionId: beforeId, createdAfterRevisionId: afterId, originalOverwritten: false });
    expect(() => eco.recordImplementation(command(internal(implementerId!, "change.order.implement"), 5), { ecoImplementationId: ids[33]!, targetId: targetId!, beforeRevisionId: beforeId!, createdAfterRevisionId: afterId!, evidenceIds: [evidenceId!] })).toThrowError(expect.objectContaining({ code: "ECO_TARGET_ALREADY_IMPLEMENTED" }));
    eco.submitVerification(command(internal(implementerId!, "change.order.implement"), 5), [evidenceId!]);
    const verification = { ecoVerificationId: ids[34]!, appliedScope: { serialNumbers: ["SN-001"], lotNumbers: [], equipmentIds: [] }, verifiedTargetIds: [targetId!], evidenceIds: [evidenceId!], retestEvidenceIds: [ids[35]!], reinspectionEvidenceIds: [ids[36]!], summary: "적합" };
    expect(() => eco.verify(command(internal(implementerId!, "change.order.verify"), 6), { verification })).toThrowError(expect.objectContaining({ code: "ECO_SELF_VERIFICATION_FORBIDDEN" }));
    expect(eco.verify(command(internal(verifierId!, "change.order.verify"), 6), { verification }).snapshot.state).toBe("EFFECTIVE");
  });

  it("cannot make a contract-affecting ECO effective without an executed signed exact change snapshot", () => {
    const created = draftEco(true); const eco = EngineeringChangeOrder.restore(created.snapshot); eco.submit(command(internal(ownerId!, "change.order.manage"), 1), { changeOrderVersionId: ids[38]!, checksum: sha256("3".repeat(64)) }); const sealed = eco.snapshot(); eco.release(command(internal(approverId!, "change.request.approve"), 2), approval(sealed.sealedDefinitionVersionId!, 2, sealed.sealedDefinitionChecksum!, sealed.sealedDefinitionAt!)); eco.start(command(internal(implementerId!, "change.order.implement"), 3)); eco.recordImplementation(command(internal(implementerId!, "change.order.implement"), 4), { ecoImplementationId: ids[32]!, targetId: targetId!, beforeRevisionId: beforeId!, createdAfterRevisionId: afterId!, evidenceIds: [evidenceId!] }); eco.submitVerification(command(internal(implementerId!, "change.order.implement"), 5), [evidenceId!]);
    const verification = { ecoVerificationId: ids[34]!, appliedScope: { serialNumbers: [], lotNumbers: ["LOT-1"], equipmentIds: [] }, verifiedTargetIds: [targetId!], evidenceIds: [evidenceId!], retestEvidenceIds: [ids[35]!], reinspectionEvidenceIds: [ids[36]!], summary: "적합" };
    expect(() => eco.verify(command(internal(verifierId!, "change.order.verify"), 6), { verification })).toThrowError(expect.objectContaining({ code: "ECO_SIGNED_CHANGE_CONTRACT_REQUIRED" }));
  });
});

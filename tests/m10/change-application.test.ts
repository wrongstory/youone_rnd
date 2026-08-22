import { describe, expect, it, vi } from "vitest";
import {
  VENDOR_FORBIDDEN_CHANGE_FIELDS,
  EcrVerifiedApprovalOutcomeApplicationService,
  applyEcoImplementation,
  createEcoFromApprovedEcr,
  createNextChangeVersionAfterNegativeOutcome,
  persistEcrMutation,
  persistEmergencyEcoCreation,
  persistEcoMutation,
  projectVendorChangeDetail,
  projectVendorChangeListItem,
  releaseEmergencyEco,
  type ChangeTransactionContext,
  type VendorChangeListItemView
} from "../../packages/features/change/src/application/ecr-eco-contracts.js";
import { EngineeringChangeOrder, EngineeringChangeRequest, type ChangeActorSnapshot, type ChangeCommand, type EcoSnapshot, type EcrSnapshot, type OfficialChangeApprovalEvidence } from "../../packages/features/change/src/domain/ecr-eco.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const u = (suffix: number) => uuid(`c1000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`);
const ecrId = u(1); const ecoId = u(2); const projectId = u(3); const contractId = u(4); const ownerId = u(5); const approverId = u(6); const targetId = u(7); const beforeId = u(8); const afterId = u(9); const evidenceId = u(10);
const actor = (userId: typeof ownerId, ...authorities: string[]): ChangeActorSnapshot => ({ actorKind: "INTERNAL", userId, active: true, positionIds: [], authorities: authorities.map(stableCode) });
const exactApproval: OfficialChangeApprovalEvidence = { approvalInstanceId: u(11), approvalVersion: version(1), subjectVersionId: u(13), subjectVersion: version(3), subjectChecksum: sha256("a".repeat(64)), subjectSealedAt: utcInstant("2026-08-22T02:03:00Z"), completedAt: utcInstant("2026-08-22T02:05:00Z"), officialApproverUserId: approverId, officialApproverPositionId: stableCode("POSITION_LAB_DIRECTOR") };
const approvedEcr: EcrSnapshot = { ecrId, ecrNo: "ECR-A1", title: "도면 변경", priority: "HIGH", projectId, contractId, linkedNcrIds: [], rationale: "변경 근거", requestedChange: "도면 개정", state: "APPROVED", sealedSubjectVersionId: exactApproval.subjectVersionId, sealedSubjectVersion: version(3), sealedSubjectChecksum: exactApproval.subjectChecksum, sealedSubjectAt: exactApproval.subjectSealedAt, officialApproval: exactApproval, version: version(5), originatorUserId: ownerId, createdAt: utcInstant("2026-08-22T02:00:00Z"), updatedAt: utcInstant("2026-08-22T02:05:00Z") };
let sequence = 0;
function command(commandActor: ChangeActorSnapshot, expectedVersion: number): ChangeCommand { sequence += 1; return { actor: commandActor, expectedVersion: version(expectedVersion), at: utcInstant(`2026-08-22T03:${String(sequence % 60).padStart(2, "0")}:00Z`), eventId: u(100 + sequence), correlationId: correlationId(`m10-app-${sequence}`), idempotencyKey: idempotencyKey(`m10-app-${sequence}`) }; }
function createCommand(commandActor: ChangeActorSnapshot) { const { expectedVersion: _expected, ...rest } = command(commandActor, 0); void _expected; return rest; }
function evidence() { return { appendTransition: vi.fn(async () => undefined), appendAudit: vi.fn(async () => undefined), enqueue: vi.fn(async () => undefined) }; }
function baseContext(overrides: Partial<ChangeTransactionContext> = {}): ChangeTransactionContext {
  return {
    ecrs: {} as ChangeTransactionContext["ecrs"], ecos: {} as ChangeTransactionContext["ecos"],
    targets: { assertExactProposedTargets: vi.fn(async () => undefined), assertImplementationCreatedExactAfterRevision: vi.fn(async () => undefined), assertExactAppliedScope: vi.fn(async () => undefined) },
    emergencyAuthority: { assertExactActiveException: vi.fn(async () => undefined) }, signedChangeContracts: { assertExecutedSignedExactSnapshot: vi.fn(async () => undefined) },
    negativeOutcomes: { append: vi.fn(async () => undefined), loadLatestForUpdate: vi.fn(async () => null) }, revisions: { insertNextImmutableVersion: vi.fn(async () => undefined) },
    links: { assertProjectAndContract: vi.fn(async () => undefined), assertExactNcrLinks: vi.fn(async () => undefined) }, evidence: evidence(), ...overrides
  };
}
const unit = (context: ChangeTransactionContext) => ({ transact: async <T>(work: (value: ChangeTransactionContext) => Promise<T>) => work(context) });
const ecoInput = { ecoId, ecoNo: "ECO-A1", title: "도면 개정 실행", priority: "HIGH" as const, projectId, contractId, linkedNcrIds: [], targets: [{ kind: "DOCUMENT_VERSION" as const, targetId, documentId: u(12), beforeRevisionId: beforeId, afterRevisionId: afterId }], contractChangeEffect: { changesScope: false, changesAmount: false, changesDeadline: false, changesAcceptanceCriteria: false }, verificationRequirements: { retestRequired: true, reinspectionRequired: false, basis: "재시험 필요" } };

describe("ECR/ECO application UoW", () => {
  it("appends immutable impact and exact sealed ECR version with transition/audit/outbox", async () => {
    const created = EngineeringChangeRequest.create({ ecrId, ecrNo: "ECR-SEAL", title: "봉인", priority: "NORMAL", projectId, linkedNcrIds: [], rationale: "근거", requestedChange: "변경", originatorUserId: ownerId }, createCommand(actor(ownerId, "change.request.create")));
    const aggregate = EngineeringChangeRequest.restore(created.snapshot); aggregate.startAnalysis(command(actor(ownerId, "change.request.manage"), 1));
    const noImpact = { effect: "NO_IMPACT" as const, analysis: "영향 없음", evidenceIds: [] };
    const mutation = aggregate.submitReview(command(actor(ownerId, "change.impact.analyze"), 2), { impactAnalysisId: u(30), changeRequestVersionId: u(31), cost: noImpact, schedule: noImpact, quality: noImpact, safety: noImpact, security: noImpact, regulatory: noImpact, checksum: sha256("b".repeat(64)), completedByUserId: ownerId, completedAt: utcInstant("2026-08-22T03:10:00Z") });
    const appendImpact = vi.fn(async () => undefined); const appendVersion = vi.fn(async () => undefined); const events = evidence();
    const context = baseContext({ ecrs: { save: vi.fn(async () => true), appendImmutableImpactAnalysis: appendImpact, appendImmutableSealedVersion: appendVersion } as unknown as ChangeTransactionContext["ecrs"], evidence: events });
    await persistEcrMutation(unit(context), mutation);
    expect(appendImpact).toHaveBeenCalledWith(expect.objectContaining({ impactAnalysisId: u(30), changeRequestVersionId: u(31) }));
    expect(appendVersion).toHaveBeenCalledWith(expect.objectContaining({ changeRequestVersionId: u(31), subjectVersion: 3, checksum: sha256("b".repeat(64)) }));
    expect(events.appendTransition).toHaveBeenCalledWith(expect.objectContaining({ fromVersion: 2, toVersion: 3 })); expect(events.enqueue).toHaveBeenCalledOnce();
  });

  it("atomically inserts an ECO from the exact approved ECR and converts that source version", async () => {
    const ecrSave = vi.fn(async () => true); const ecoInsert = vi.fn(async () => undefined); const events = evidence();
    const context = baseContext({ ecrs: { loadForUpdate: vi.fn(async () => approvedEcr), save: ecrSave } as unknown as ChangeTransactionContext["ecrs"], ecos: { insert: ecoInsert } as unknown as ChangeTransactionContext["ecos"], evidence: events });
    const result = await createEcoFromApprovedEcr(unit(context), { ecrId, eco: ecoInput, ecoCommand: createCommand(actor(ownerId, "change.order.manage")), ecrConversionCommand: command(actor(ownerId, "change.order.manage"), 5) });
    expect(result.origin).toMatchObject({ kind: "APPROVED_ECR", ecrId, ecrVersion: 5, sealedSubjectChecksum: exactApproval.subjectChecksum });
    expect(ecoInsert).toHaveBeenCalledWith(expect.objectContaining({ state: "DRAFT", version: 1 }));
    expect(context.targets.assertExactProposedTargets).toHaveBeenCalledWith(expect.objectContaining({ projectId, contractId, targets: ecoInput.targets }));
    expect(ecrSave).toHaveBeenCalledWith(expect.objectContaining({ state: "CONVERTED_TO_ECO", convertedEcoId: ecoId, version: 6 }), 5);
    expect(events.appendAudit).toHaveBeenCalledTimes(2); expect(events.enqueue).toHaveBeenCalledTimes(2);
  });

  it("fails closed through a versioned emergency-authority port and stores exception/audit/outbox together", async () => {
    const origin = { kind: "EMERGENCY_EXCEPTION" as const, emergencyExceptionId: u(20), policyVersionId: u(21), authorityCode: stableCode("CHANGE_EMERGENCY_POLICY"), reason: "안전 즉시조치", riskAssessment: "정지 시 더 큰 위험", temporaryAuthorityAssignmentId: u(22), temporaryAuthorityUserId: ownerId, authorizedByUserId: approverId, authorizedByPositionId: stableCode("POSITION_LAB_DIRECTOR"), validFrom: utcInstant("2026-08-22T02:00:00Z"), validUntil: utcInstant("2026-08-23T02:00:00Z"), retrospectiveApprovalDueAt: utcInstant("2026-08-24T02:00:00Z"), evidenceIds: [evidenceId], recordedAt: utcInstant("2026-08-22T02:00:00Z") };
    const mutation = EngineeringChangeOrder.create({ ...ecoInput, origin }, createCommand(actor(ownerId, "change.order.manage"),));
    const insert = vi.fn(async () => undefined); const append = vi.fn(async () => undefined); const authorityCheck = vi.fn(async () => undefined); const events = evidence();
    const context = baseContext({ ecos: { insert, appendImmutableEmergencyException: append } as unknown as ChangeTransactionContext["ecos"], emergencyAuthority: { assertExactActiveException: authorityCheck }, evidence: events });
    await persistEmergencyEcoCreation(unit(context), mutation);
    expect(authorityCheck).toHaveBeenCalledWith(expect.objectContaining({ policyVersionId: origin.policyVersionId, temporaryAuthorityAssignmentId: origin.temporaryAuthorityAssignmentId, projectId, contractId }));
    expect(append).toHaveBeenCalledWith(origin); expect(events.appendAudit).toHaveBeenCalledOnce(); expect(events.enqueue).toHaveBeenCalledOnce();
  });

  it("revalidates current emergency authority at release and rejects a revoked assignment before any write", async () => {
    const origin = { kind: "EMERGENCY_EXCEPTION" as const, emergencyExceptionId: u(40), policyVersionId: u(41), authorityCode: stableCode("CHANGE_EMERGENCY_POLICY"), reason: "긴급 안전조치", riskAssessment: "즉시 조치 필요", temporaryAuthorityAssignmentId: u(42), temporaryAuthorityUserId: ownerId, authorizedByUserId: approverId, authorizedByPositionId: stableCode("POSITION_LAB_DIRECTOR"), validFrom: utcInstant("2026-08-22T02:00:00Z"), validUntil: utcInstant("2026-08-23T02:00:00Z"), retrospectiveApprovalDueAt: utcInstant("2026-08-24T02:00:00Z"), evidenceIds: [evidenceId], recordedAt: utcInstant("2026-08-22T02:00:00Z") };
    const aggregate = EngineeringChangeOrder.restore(EngineeringChangeOrder.create({ ...ecoInput, origin }, createCommand(actor(ownerId, "change.order.manage"))).snapshot);
    aggregate.submit(command(actor(ownerId, "change.order.manage"), 1), { changeOrderVersionId: u(43), checksum: sha256("c".repeat(64)) });
    const pending = aggregate.snapshot(); const save = vi.fn(); const revoked = vi.fn(async () => { throw new Error("revoked"); });
    const context = baseContext({ ecos: { loadForUpdate: vi.fn(async () => pending), save } as unknown as ChangeTransactionContext["ecos"], emergencyAuthority: { assertExactActiveException: revoked } });
    await expect(releaseEmergencyEco(unit(context), { ecoId, command: command(actor(ownerId, "change.order.emergency_release"), 2) })).rejects.toThrow("revoked");
    expect(revoked).toHaveBeenCalledWith(expect.objectContaining({ temporaryAuthorityAssignmentId: u(42) })); expect(save).not.toHaveBeenCalled();
  });

  it("rejects direct persistence of a structurally forged approval/release mutation", async () => {
    const forged = { expectedVersion: version(2), snapshot: { version: version(3) }, event: { eventType: stableCode("EVT-ECO-RELEASE") } };
    const transact = vi.fn();
    await expect(persistEcoMutation({ transact }, forged as never)).rejects.toMatchObject({ code: "ECO_VERIFIED_APPROVAL_OR_EMERGENCY_BOUNDARY_REQUIRED" });
    expect(transact).not.toHaveBeenCalled();
  });

  it("rejects a structural lookalike at the branded Core Approval outcome boundary", async () => {
    const transact = vi.fn(); const service = new EcrVerifiedApprovalOutcomeApplicationService({ transact });
    await expect(service.applyVerifiedOutcome({ decision: "APPROVED" } as never)).rejects.toMatchObject({ code: "CHANGE_APPROVAL_OUTCOME_NOT_TRUSTED" });
    expect(transact).not.toHaveBeenCalled();
  });

  it("creates only a direct immutable successor after the latest retained rejected outcome", async () => {
    const negativeOutcomeId = u(50); const previousSubjectVersionId = u(51); const nextSubjectVersionId = u(52); const insert = vi.fn(async () => undefined);
    const events = evidence(); const context = baseContext({ negativeOutcomes: { append: vi.fn(), loadLatestForUpdate: vi.fn(async () => ({ negativeOutcomeId, aggregateKind: "ECR" as const, aggregateId: ecrId, subjectVersionId: previousSubjectVersionId, subjectVersion: version(3), decision: "REJECTED" as const, approvalInstanceId: u(53), approvalVersion: version(4), terminalActionId: u(54), occurredAt: utcInstant("2026-08-22T04:00:00Z") })) }, revisions: { insertNextImmutableVersion: insert }, evidence: events });
    await createNextChangeVersionAfterNegativeOutcome(unit(context), { aggregateKind: "ECR", aggregateId: ecrId, previousSubjectVersionId, nextSubjectVersionId, nextSubjectVersion: version(4), checksum: sha256("d".repeat(64)), sealedAt: utcInstant("2026-08-22T04:01:00Z"), negativeOutcomeId, command: createCommand(actor(ownerId, "change.request.create")) });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ previousSubjectVersionId, nextSubjectVersionId, nextSubjectVersion: 4 }));
    expect(events.appendAudit).toHaveBeenCalledOnce(); expect(events.enqueue).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ lifecycleTransitionApplied: false }) }));
    await expect(createNextChangeVersionAfterNegativeOutcome(unit(context), { aggregateKind: "ECR", aggregateId: ecrId, previousSubjectVersionId, nextSubjectVersionId: u(55), nextSubjectVersion: version(5), checksum: sha256("e".repeat(64)), sealedAt: utcInstant("2026-08-22T04:02:00Z"), negativeOutcomeId, command: createCommand(actor(ownerId, "change.request.create")) })).rejects.toMatchObject({ code: "CHANGE_RESUBMISSION_LINEAGE_INVALID" });
  });

  it("persists implementation only after the exact newly-created after revision is validated", async () => {
    const implementing: EcoSnapshot = { ...EngineeringChangeOrder.create({ ...ecoInput, origin: { kind: "APPROVED_ECR", ecrId, ecrVersion: version(5), ecrState: "APPROVED", sealedSubjectVersionId: exactApproval.subjectVersionId, sealedSubjectVersion: version(3), sealedSubjectChecksum: exactApproval.subjectChecksum, sealedSubjectAt: exactApproval.subjectSealedAt, officialApproval: exactApproval } }, createCommand(actor(ownerId, "change.order.manage"))).snapshot, state: "IMPLEMENTING", version: version(4) };
    const save = vi.fn(async () => true); const append = vi.fn(async () => undefined); const validateAfter = vi.fn(async () => undefined);
    const context = baseContext({ ecos: { loadForUpdate: vi.fn(async () => implementing), save, appendImmutableImplementation: append } as unknown as ChangeTransactionContext["ecos"], targets: { assertExactProposedTargets: vi.fn(), assertImplementationCreatedExactAfterRevision: validateAfter, assertExactAppliedScope: vi.fn() } });
    await applyEcoImplementation(unit(context), { ecoId, command: command(actor(ownerId, "change.order.implement"), 4), implementation: { ecoImplementationId: u(23), targetId, beforeRevisionId: beforeId, createdAfterRevisionId: afterId, evidenceIds: [evidenceId] } });
    expect(validateAfter).toHaveBeenCalledWith(expect.objectContaining({ targetId, beforeRevisionId: beforeId, createdAfterRevisionId: afterId, originalOverwritten: false }));
    expect(append).toHaveBeenCalledOnce(); expect(save).toHaveBeenCalledWith(expect.objectContaining({ version: 5, implementedTargetIds: [targetId] }), 4);
  });

  it("defines a vendor-safe projection including security classification but no deliberation, money, legal or approval fields", () => {
    const item: VendorChangeListItemView = { changeRequestId: String(ecrId), ecrNo: "ECR-A1", title: "도면 변경", priority: "HIGH", state: "APPROVED", changeOrderId: String(ecoId), ecoNo: "ECO-A1", ecoState: "IMPLEMENTING", projectId: String(projectId), contractId: String(contractId), impactSummary: { cost: "AFFECTED", schedule: "NO_IMPACT", quality: "AFFECTED", safety: "NO_IMPACT", security: "AFFECTED", regulatory: "NO_IMPACT" }, exactTargetDisplayRefs: [{ kind: "DOCUMENT_VERSION", targetId: String(targetId), displayRef: "DRW-001 rev.2" }], progress: { implementedTargets: 0, totalTargets: 1, verification: "NOT_READY" }, nextAction: stableCode("change.order.implement") };
    const malicious = { ...item, internalImpactDeliberation: "secret", approvalParticipants: [{ userId: "internal" }], contractAmount: "999999", legalNotes: "privileged", securityFindings: "exploit", internalNotes: "hidden" };
    const list = projectVendorChangeListItem(malicious); const detail = projectVendorChangeDetail({ ...malicious, assignedImplementationEvidenceIds: ["external-evidence"], appliedScope: { serialNumbers: ["SN-1"], lotNumbers: [], equipmentIds: [] } });
    expect(list.impactSummary.security).toBe("AFFECTED"); expect(detail.assignedImplementationEvidenceIds).toEqual(["external-evidence"]);
    for (const field of VENDOR_FORBIDDEN_CHANGE_FIELDS) { expect(list).not.toHaveProperty(field); expect(detail).not.toHaveProperty(field); }
    expect(list).not.toHaveProperty("approvalParticipants"); expect(detail).not.toHaveProperty("contractAmount");
  });
});

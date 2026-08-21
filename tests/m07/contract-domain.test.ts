import { describe, expect, it } from "vitest";
import { ContractVersion, VendorContract, createWarrantyIssue, validateContractMilestones, type ContractActorSnapshot, type ContractCommand, type ContractMilestoneSnapshot, type ContractVersionSnapshot } from "../../packages/features/contract/src/domain/contract.js";
import { Deliverable, createDeliverableVersion, type DeliverableCommand } from "../../packages/features/contract/src/domain/deliverable.js";
import { CONTRACT_RESPONSIBILITY_INVARIANT } from "../../packages/features/contract/src/application/contracts.js";
import { correlationId, idempotencyKey, money, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const ids = Array.from({ length: 30 }, (_, index) => uuid(`71000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`));
const [managerId, vendorId, contractId, projectId, versionId, sowId, requirementsId, approvalId, signatureId, eventId, milestoneId, deliverableId, deliverableVersionId, attachmentId, attachmentVersionId] = ids as [ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>, ReturnType<typeof uuid>];
const manifest = sha256("a".repeat(64));
function actor(input: Partial<ContractActorSnapshot> = {}): ContractActorSnapshot { return { actorKind: "INTERNAL", userId: managerId, active: true, authorities: ["CONTRACT_AUTHOR", "CONTRACT_MANAGER", "DIRECTOR", "POLICY_APPROVER"], ...input }; }
function baseCommand(a = actor()) { return { actor: a, at: utcInstant("2026-08-22T02:00:00Z"), eventId, correlationId: correlationId("m07-contract"), idempotencyKey: idempotencyKey("m07-contract") }; }
function command(expected: number, a = actor(), reason?: string): ContractCommand { return { ...baseCommand(a), expectedVersion: version(expected), ...(reason ? { reason } : {}) }; }

function draftVersion(input: Partial<Parameters<typeof ContractVersion.draft>[0]> = {}) {
  return ContractVersion.draft({ contractVersionId: versionId, contractId, versionNo: 1, versionKind: "ORIGINAL", statementOfWorkDocumentVersionId: sowId, requirementsSnapshotId: requirementsId, effectiveFrom: "2026-09-01", effectiveTo: "2027-08-31", contractAmount: money("100000000", "KRW"), intellectualPropertyTermsCode: stableCode("IP.COMPANY_OWNED"), securityTermsCode: stableCode("SEC.L2"), warrantyTermsCode: stableCode("WARRANTY.STANDARD"), liabilityTermsCode: stableCode("LIABILITY.NON_WAIVER"), policyProvenance: { presetPolicyId: stableCode("POL-CONTRACT-BASELINE-V1"), presetPolicyVersion: 1, legalBaselineId: stableCode("LEGAL-KR-2026-08"), legalBaselineVersion: 1, overrideApplied: false }, createdAt: utcInstant("2026-08-22T01:00:00Z"), ...input });
}
function signedVersion(): ContractVersionSnapshot {
  const sealed = draftVersion().seal(manifest, utcInstant("2026-08-22T01:10:00Z"));
  return ContractVersion.restore(sealed).sign({ approvalInstanceId: approvalId, subjectContractVersionId: versionId, subjectManifestHash: manifest, outcome: "APPROVED", decidedAt: utcInstant("2026-08-22T01:20:00Z") }, signatureId, utcInstant("2026-08-22T01:30:00Z"));
}
function signedAmendment(amendmentVersionId: ReturnType<typeof uuid>, predecessorId: ReturnType<typeof uuid>): ContractVersionSnapshot {
  const digest = sha256("e".repeat(64));
  const sealed = draftVersion({ contractVersionId: amendmentVersionId, versionNo: 2, versionKind: "AMENDMENT", previousContractVersionId: predecessorId }).seal(digest, utcInstant("2026-08-22T01:40:00Z"));
  return ContractVersion.restore(sealed).sign({ approvalInstanceId: ids[28]!, subjectContractVersionId: amendmentVersionId, subjectManifestHash: digest, outcome: "APPROVED", decidedAt: utcInstant("2026-08-22T01:50:00Z") }, ids[29]!, utcInstant("2026-08-22T02:00:00Z"));
}
function createContract() { return VendorContract.create({ contractId, vendorId, contractNo: "C-2026-001", title: "시제품 외주", managerUserId: managerId, projectLinks: [{ contractProjectId: ids[15]!, contractId, projectId, validFrom: "2026-09-01", validTo: "2027-08-31" }] }, { ...baseCommand(), vendorExists: true }); }

describe("ContractVersion and normalized finance", () => {
  it("binds signature to exact sealed manifest and keeps signed versions immutable", () => {
    const sealed = draftVersion().seal(manifest, utcInstant("2026-08-22T01:10:00Z"));
    expect(() => ContractVersion.restore(sealed).sign({ approvalInstanceId: approvalId, subjectContractVersionId: ids[16]!, subjectManifestHash: manifest, outcome: "APPROVED", decidedAt: utcInstant("2026-08-22T01:20:00Z") }, signatureId, utcInstant("2026-08-22T01:30:00Z"))).toThrowError(expect.objectContaining({ code: "CONTRACT_APPROVAL_SUBJECT_MISMATCH" }));
    const signed = ContractVersion.restore(sealed).sign({ approvalInstanceId: approvalId, subjectContractVersionId: versionId, subjectManifestHash: manifest, outcome: "APPROVED", decidedAt: utcInstant("2026-08-22T01:20:00Z") }, signatureId, utcInstant("2026-08-22T01:30:00Z"));
    expect(signed).toMatchObject({ state: "SIGNED", manifestHash: manifest, signatureEvidenceId: signatureId, policyProvenance: { approvalSnapshot: { approvalInstanceId: approvalId } } });
    expect(() => ContractVersion.restore(signed).seal(manifest, utcInstant("2026-08-22T02:00:00Z"))).toThrowError(expect.objectContaining({ code: "CONTRACT_VERSION_ALREADY_IMMUTABLE" }));
  });

  it("requires override reason and normalized milestone ratios totaling 100", () => {
    expect(() => draftVersion({ policyProvenance: { presetPolicyId: stableCode("POL-CONTRACT-BASELINE-V1"), presetPolicyVersion: 1, legalBaselineId: stableCode("LEGAL-KR-2026-08"), legalBaselineVersion: 1, overrideApplied: true } })).toThrowError(expect.objectContaining({ code: "CONTRACT_OVERRIDE_REASON_REQUIRED" }));
    const exact = draftVersion().snapshot();
    const milestones: ContractMilestoneSnapshot[] = [{ contractMilestoneId: milestoneId, contractVersionId: versionId, sequenceNo: 1, milestoneCode: stableCode("MILESTONE.DOWNPAYMENT"), title: "착수", dueDate: "2026-09-15", plannedAmount: money("100000000", "KRW"), plannedRatio: "90" }];
    expect(() => validateContractMilestones(exact, milestones)).toThrowError(expect.objectContaining({ code: "CONTRACT_MILESTONE_RATIO_TOTAL_INVALID" }));
    validateContractMilestones(exact, [...milestones.map((item) => ({ ...item, plannedAmount: money("90000000", "KRW") })), { ...milestones[0]!, contractMilestoneId: ids[17]!, sequenceNo: 2, milestoneCode: stableCode("MILESTONE.BALANCE"), plannedAmount: money("10000000", "KRW"), plannedRatio: "10" }]);
  });

  it("requires every amendment to name the exact direct predecessor", () => {
    expect(() => draftVersion({ versionKind: "AMENDMENT", versionNo: 2 })).toThrowError(expect.objectContaining({ code: "CONTRACT_VERSION_PREDECESSOR_INVALID" }));
    expect(draftVersion({ contractVersionId: ids[25]!, versionKind: "AMENDMENT", versionNo: 2, previousContractVersionId: versionId }).snapshot()).toMatchObject({ versionKind: "AMENDMENT", versionNo: 2, previousContractVersionId: versionId });
  });
});

describe("SM-VENDOR-CONTRACT-V1", () => {
  it("follows optimistic lifecycle and declares atomic scope obligations", () => {
    const aggregate = VendorContract.restore(createContract().snapshot);
    aggregate.requestReview({ ...command(1), mandatoryDraftDocumentsSatisfied: true });
    aggregate.beginNegotiation({ ...command(2), reviewOutcomeRecorded: true });
    const sealed = draftVersion().seal(manifest, utcInstant("2026-08-22T02:10:00Z"));
    aggregate.submitApproval(command(3), sealed);
    aggregate.recordApprovedSignature(command(4, actor({ actorKind: "SYSTEM", userId: undefined, authorities: [] })), signedVersion());
    const activated = aggregate.activate({ ...command(5), effectiveOn: "2026-09-01" }, signedVersion());
    expect(activated).toMatchObject({ snapshot: { state: "ACTIVE", version: 6 }, scopeObligation: "ISSUE", event: { eventType: "EVT-CONTRACT-ACTIVATE" } });
    expect(() => aggregate.requestChange({ ...command(5), changeRequestId: ids[18]! })).toThrowError(expect.objectContaining({ code: "CONTRACT_STALE_VERSION" }));
  });

  it("requires exact vendor identity for Vendor change requests and revokes scope on termination", () => {
    const snapshot = { ...createContract().snapshot, state: "ACTIVE" as const, currentSignedVersionId: versionId, currentSignedVersionNo: 1, version: version(6) };
    const aggregate = VendorContract.restore(snapshot);
    expect(() => aggregate.requestChange({ ...command(6, actor({ actorKind: "VENDOR", userId: undefined, vendorId: ids[19]!, authorities: [] })), changeRequestId: ids[18]! })).toThrowError(expect.objectContaining({ code: "CONTRACT_VENDOR_SCOPE_REQUIRED" }));
    aggregate.reviewTermination({ ...command(6, actor({ authorities: ["DIRECTOR"] }), "중대한 위반"), breachEvidenceId: ids[20]! });
    const terminated = aggregate.terminate({ ...command(7, actor({ authorities: ["POLICY_APPROVER"] }), "법무·결재 완료"), legalRequirementsSatisfied: true, approvalRequirementsSatisfied: true });
    expect(terminated).toMatchObject({ snapshot: { state: "TERMINATED" }, scopeObligation: "REVOKE" });
  });

  it("allows only the direct next signed amendment to become effective", () => {
    const aggregate = VendorContract.restore({ ...createContract().snapshot, state: "ACTIVE", currentSignedVersionId: versionId, currentSignedVersionNo: 1, version: version(6) });
    aggregate.requestChange({ ...command(6, actor({ authorities: ["CONTRACT_MANAGER"] })), changeRequestId: ids[18]! });
    expect(() => aggregate.makeChangeEffective(command(7, actor({ authorities: ["CONTRACT_MANAGER"] })), signedAmendment(ids[27]!, ids[26]!))).toThrowError(expect.objectContaining({ code: "CONTRACT_SIGNED_AMENDMENT_REQUIRED" }));
    expect(aggregate.makeChangeEffective(command(7, actor({ authorities: ["CONTRACT_MANAGER"] })), signedAmendment(ids[27]!, versionId))).toMatchObject({ snapshot: { state: "ACTIVE", currentSignedVersionId: ids[27]!, currentSignedVersionNo: 2 }, scopeObligation: "REFRESH" });
  });
});

describe("SM-DELIVERABLE-V1 and non-waiver", () => {
  function exactDeliverableVersion() { return createDeliverableVersion({ deliverableVersionId, deliverableId, versionNo: 1, manifestHash: sha256("b".repeat(64)), manifestEntries: [{ manifestEntryId: ids[21]!, deliverableVersionId, sequenceNo: 1, attachmentId, attachmentVersionId, contentHash: sha256("c".repeat(64)), evidenceTypeCode: stableCode("EVIDENCE.SELF_TEST") }], submitterUserId: ids[22]!, createdAt: utcInstant("2026-08-22T03:00:00Z") }); }
  function deliverableCommand(expected: number, a: ContractActorSnapshot, reason?: string): DeliverableCommand { return { ...command(expected, a, reason) }; }
  it("binds each submission to an exact immutable manifest and prevents Vendor self-acceptance", () => {
    const defined = Deliverable.define({ deliverableId, contractId, contractMilestoneId: milestoneId, deliverableCode: "D-001", title: "시제품", assignedVendorId: vendorId }, baseCommand());
    const aggregate = Deliverable.restore(defined.snapshot);
    const assignedVendor = actor({ actorKind: "VENDOR", userId: ids[22]!, vendorId, contractScopeId: ids[26]!, contractScopeContractId: contractId, authorities: [] });
    aggregate.start(deliverableCommand(1, assignedVendor));
    aggregate.submit(deliverableCommand(2, assignedVendor), exactDeliverableVersion());
    aggregate.startReview(deliverableCommand(3, actor({ authorities: ["CONTRACT_MANAGER"] })));
    expect(() => aggregate.accept({ ...deliverableCommand(4, assignedVendor), authorizedInspectionResultId: ids[23]! })).toThrowError(expect.objectContaining({ code: "DELIVERABLE_INTERNAL_REVIEWER_REQUIRED" }));
    expect(aggregate.accept({ ...deliverableCommand(4, actor({ authorities: ["CONTRACT_MANAGER"] })), authorizedInspectionResultId: ids[23]! }).snapshot.state).toBe("ACCEPTED");
  });
  it("preserves warranty and Vendor responsibility after acceptance or payment facts", () => {
    const issue = createWarrantyIssue({ warrantyIssueId: ids[24]!, contractId, deliverableId, issueCode: "W-001", summary: "잠재 하자", discoveredAt: utcInstant("2027-01-01T00:00:00Z"), responsibilityState: "UNASSESSED" });
    expect(issue).toMatchObject({ acceptanceDoesNotWaiveResponsibility: true, paymentDoesNotWaiveResponsibility: true });
    expect(CONTRACT_RESPONSIBILITY_INVARIANT).toEqual({ acceptanceWaivesVendorResponsibility: false, paymentWaivesVendorResponsibility: false, warrantySurvivesPerformanceCompletion: true });
  });
});

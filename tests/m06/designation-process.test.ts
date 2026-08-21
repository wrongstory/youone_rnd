import { describe, expect, it, vi } from "vitest";
import type { ApprovalActorSnapshot, ApprovalPolicyVersion, ApprovalSubjectSnapshot, ResolvedStep } from "../../packages/core/approval/src/public.js";
import { FormalResearchDesignationError, RESEARCH_APPLICATION_RETURN_REASON_CODE, ResearchProjectApplication, ResearchProjectApplicationApprovalSubjectAdapter, validateFormalResearchApprovalPolicy } from "../../packages/processes/formal-research-designation/src/public.js";
import { correlationId, idempotencyKey, money, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const applicantId = uuid("30000000-0000-4000-8000-000000000001");
const directorId = uuid("30000000-0000-4000-8000-000000000002");
const projectId = uuid("30000000-0000-4000-8000-000000000003");
const rootId = uuid("30000000-0000-4000-8000-000000000004");
const appV1 = uuid("30000000-0000-4000-8000-000000000005");
const approvalId = uuid("30000000-0000-4000-8000-000000000006");
const checksum = sha256("a".repeat(64));

function actor(userId = applicantId, positionIds: readonly string[] = []): ApprovalActorSnapshot { return { actorType: "USER", accountKind: "INTERNAL", authenticatedUserId: userId, effectiveUserId: userId, positionIds: positionIds.map(stableCode), roleIds: [] }; }
function envelope(a: ApprovalActorSnapshot, expected: number, suffix: string) { return { actor: a, at: utcInstant("2026-08-22T00:00:00Z"), expectedVersion: version(expected), correlationId: correlationId(`m06-${suffix}`), idempotencyKey: idempotencyKey(`m06-${suffix}`), eventId: uuid(`31000000-0000-4000-8000-${suffix.padStart(12, "0")}`) }; }
function content() { return { purpose: "목적", objective: "목표", researchPlan: "계획", method: "방법", teamLeadUserId: applicantId, team: [{ userId: applicantId, projectRoleId: stableCode("PROJECT_ROLE.LEAD") }], periodStart: "2026-08-22", periodEnd: "2027-08-21", budget: money("1000", "KRW"), outputs: [{ outputId: uuid("30000000-0000-4000-8000-000000000007"), outputTypeId: stableCode("OUTPUT.REPORT"), title: "보고서" }], securityLevel: "L2" as const, safetyApplicable: true, allowanceApplicable: true, evidenceAttachmentIds: [] }; }
function creationEnvelope(a: ApprovalActorSnapshot, suffix: string) { const result = envelope(a, 0, suffix); return { actor: result.actor, at: result.at, correlationId: result.correlationId, idempotencyKey: result.idempotencyKey, eventId: result.eventId }; }
function createFirst() { return ResearchProjectApplication.create({ applicationVersionId: appV1, applicationRootId: rootId, projectId, revisionNo: 1, applicantUserId: applicantId, content: content() }, creationEnvelope(actor(), "1")); }

describe("formal research designation", () => {
  it("seals an immutable exact version and permits only direct Lab Director consent", () => {
    const application = ResearchProjectApplication.restore(createFirst().application);
    const pending = application.sealAndSubmit(envelope(actor(), 1, "2"), { checksum, approvalInstanceId: approvalId });
    const restored = ResearchProjectApplication.restore(pending.application);
    expect(() => restored.applyDirectorConsent(envelope(actor(directorId, ["POSITION_SENIOR_RESEARCHER"]), 2, "3"), { designationId: uuid("30000000-0000-4000-8000-000000000008"), approvalInstanceId: approvalId, approvalVersion: version(5) })).toThrowError(expect.objectContaining({ code: "RP_LAB_DIRECTOR_ONLY" }));
    expect(() => restored.applyDirectorConsent(envelope(actor(directorId, ["POSITION_REPRESENTATIVE"]), 2, "4"), { designationId: uuid("30000000-0000-4000-8000-000000000008"), approvalInstanceId: approvalId, approvalVersion: version(5) })).toThrowError(expect.objectContaining({ code: "RP_LAB_DIRECTOR_ONLY" }));
    const approved = restored.applyDirectorConsent(envelope(actor(directorId, ["POSITION_LAB_DIRECTOR"]), 2, "5"), { designationId: uuid("30000000-0000-4000-8000-000000000008"), approvalInstanceId: approvalId, approvalVersion: version(5) });
    expect(approved.designation).toMatchObject({ projectId, applicationVersionId: appV1, sealedSnapshotChecksum: checksum, state: "APPROVED" });
  });

  it("requires a strict direct newer version after return or reject", () => {
    const application = ResearchProjectApplication.restore(createFirst().application);
    application.sealAndSubmit(envelope(actor(), 1, "6"), { checksum, approvalInstanceId: approvalId });
    const returned = application.returnForRevision(envelope(actor(directorId, ["POSITION_LAB_DIRECTOR"]), 2, "7"), "보완").application;
    expect(() => ResearchProjectApplication.create({ applicationVersionId: uuid("30000000-0000-4000-8000-000000000009"), applicationRootId: rootId, projectId, revisionNo: 1, previousApplicationVersionId: appV1, applicantUserId: applicantId, content: content(), previous: returned }, creationEnvelope(actor(), "8"))).toThrowError(expect.objectContaining({ code: "RP_STRICTLY_NEWER_VERSION_REQUIRED" }));
    const next = ResearchProjectApplication.create({ applicationVersionId: uuid("30000000-0000-4000-8000-000000000009"), applicationRootId: rootId, projectId, revisionNo: 2, previousApplicationVersionId: appV1, applicantUserId: applicantId, content: content(), previous: returned }, creationEnvelope(actor(), "9"));
    expect(next.application).toMatchObject({ revisionNo: 2, state: "APPLICATION_DRAFT", version: 1 });
  });

  it("rejects a generic policy that adds Senior or Representative and enforces exact lineage in the approval adapter", async () => {
    const policy = { policyVersionId: uuid("30000000-0000-4000-8000-000000000010"), policyId: stableCode("POLICY.RP"), version: 1, checksum, state: "PUBLISHED", effectiveFrom: utcInstant("2026-01-01T00:00:00Z"), selection: { subjectKinds: ["RESEARCH_PROJECT_APPLICATION"], documentTypeIds: [], securityLevels: [], strengthenedRisk: "ANY" }, recallAllowed: true, steps: [{ ruleId: uuid("30000000-0000-4000-8000-000000000011"), sequenceNo: 1, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true, allowedPositionIds: [stableCode("POSITION_LAB_DIRECTOR"), stableCode("POSITION_REPRESENTATIVE")], allowedRoleIds: [] }] } satisfies ApprovalPolicyVersion;
    const line: readonly ResolvedStep[] = [{ stepId: uuid("30000000-0000-4000-8000-000000000012"), ruleId: policy.steps[0].ruleId, sequenceNo: 1, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true, participants: [{ participantId: uuid("30000000-0000-4000-8000-000000000013"), userId: directorId, positionId: stableCode("POSITION_LAB_DIRECTOR"), roleIds: [], order: 1 }] }];
    expect(() => validateFormalResearchApprovalPolicy(policy, line)).toThrowError(FormalResearchDesignationError);

    const application = ResearchProjectApplication.restore(createFirst().application);
    const pending = application.sealAndSubmit(envelope(actor(), 1, "10"), { checksum, approvalInstanceId: approvalId }).application;
    const applyVerifiedOutcome = vi.fn();
    const adapter = new ResearchProjectApplicationApprovalSubjectAdapter({ loadExact: async () => pending, loadPrevious: async () => null }, { applyVerifiedOutcome });
    const exact = await adapter.sealExactVersion({ kind: "RESEARCH_PROJECT_APPLICATION", researchProjectApplicationVersionId: appV1 });
    expect(exact).toMatchObject({ subjectVersion: 1, checksum, sealedAt: pending.sealedAt });
    const wrong: ApprovalSubjectSnapshot = { ...exact, checksum: sha256("b".repeat(64)) };
    await expect(adapter.assertExactVersion(wrong)).rejects.toThrowError(expect.objectContaining({ code: "RP_APPROVAL_SUBJECT_MISMATCH" }));
    const director = actor(directorId, ["POSITION_LAB_DIRECTOR"]);
    const occurredAt = utcInstant("2026-08-22T00:10:00Z");
    await adapter.applyApprovalOutcome({ snapshot: exact, approvalInstanceId: approvalId, approvalVersion: version(5), outcome: "REJECTED", provenance: { terminalAction: { actionId: uuid("30000000-0000-4000-8000-000000000014"), kind: "REJECT", at: occurredAt, actor: director, reasonCode: stableCode("RP.PLAN_INCOMPLETE") }, terminalReasonCode: stableCode("RP.PLAN_INCOMPLETE"), actor: director, occurredAt, correlationId: correlationId("m06-terminal"), idempotencyKey: idempotencyKey("m06-terminal") } });
    expect(applyVerifiedOutcome).toHaveBeenCalledWith(expect.objectContaining({ decision: "REJECT", provenance: expect.objectContaining({ terminalReasonCode: "RP.PLAN_INCOMPLETE" }) }));
    await adapter.applyApprovalOutcome({ snapshot: exact, approvalInstanceId: approvalId, approvalVersion: version(6), outcome: "REJECTED", provenance: { terminalAction: { actionId: uuid("30000000-0000-4000-8000-000000000015"), kind: "REJECT", at: occurredAt, actor: director, reasonCode: stableCode(RESEARCH_APPLICATION_RETURN_REASON_CODE) }, terminalReasonCode: stableCode(RESEARCH_APPLICATION_RETURN_REASON_CODE), actor: director, occurredAt, correlationId: correlationId("m06-return"), idempotencyKey: idempotencyKey("m06-return") } });
    expect(applyVerifiedOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ decision: "RETURN", outcome: "REJECTED", provenance: expect.objectContaining({ terminalReasonCode: RESEARCH_APPLICATION_RETURN_REASON_CODE, terminalAction: expect.objectContaining({ kind: "REJECT" }) }) }));
    const systemActor: ApprovalActorSnapshot = { actorType: "SYSTEM", accountKind: "SYSTEM", positionIds: [], roleIds: [] };
    await adapter.applyApprovalOutcome({ snapshot: exact, approvalInstanceId: approvalId, approvalVersion: version(7), outcome: "RECALLED", provenance: { terminalAction: { actionId: uuid("30000000-0000-4000-8000-000000000016"), kind: "RECALL", at: occurredAt, actor: systemActor }, actor: systemActor, occurredAt, correlationId: correlationId("m06-recall"), idempotencyKey: idempotencyKey("m06-recall") } });
    expect(applyVerifiedOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ decision: "RETURN", outcome: "RECALLED", provenance: expect.objectContaining({ terminalAction: expect.objectContaining({ kind: "RECALL" }) }) }));
  });
});

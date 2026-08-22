import { describe, expect, it } from "vitest";
import { CAR_TRANSITION_MAP, CorrectiveAction, NCR_TRANSITION_MAP, NonConformance, QualityDomainError, type CarSnapshot, type QualityActorSnapshot, type QualityCommand, type RequiredCarFact } from "../../packages/features/quality/src/public.js";
import { correlationId, idempotencyKey, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const ncrId = uuid("90000000-0000-4000-8000-000000000001");
const contractId = uuid("90000000-0000-4000-8000-000000000002");
const contractVersionId = uuid("90000000-0000-4000-8000-000000000003");
const vendorId = uuid("90000000-0000-4000-8000-000000000004");
const ownerId = uuid("90000000-0000-4000-8000-000000000005");
const verifierId = uuid("90000000-0000-4000-8000-000000000006");
const evidenceId = uuid("90000000-0000-4000-8000-000000000007");
let envelopeSequence = 100;

function internal(userId: ReturnType<typeof uuid>, ...authorities: string[]): QualityActorSnapshot { return { actorKind: "INTERNAL", userId, active: true, authorities: authorities.map(stableCode) }; }
function vendor(...authorities: string[]): QualityActorSnapshot { return { actorKind: "VENDOR", vendorId, active: true, authorities: authorities.map(stableCode), contractScopeId: uuid("90000000-0000-4000-8000-000000000008"), contractScopeContractId: contractId, ncrScopeId: uuid("90000000-0000-4000-8000-000000000009") }; }
function command(actor: QualityActorSnapshot, expected: number): QualityCommand { envelopeSequence += 1; return { actor, expectedVersion: version(expected), at: utcInstant(`2026-08-22T00:${String(envelopeSequence % 60).padStart(2, "0")}:00Z`), eventId: uuid(`91000000-0000-4000-8000-${String(envelopeSequence).padStart(12, "0")}`), correlationId: correlationId(`m09-${envelopeSequence}`), idempotencyKey: idempotencyKey(`m09-${envelopeSequence}`) }; }
function creationCommand(actor: QualityActorSnapshot) { const { expectedVersion: _expected, ...result } = command(actor, 0); void _expected; return result; }
function createNcr() { return NonConformance.create({ ncrId, ncrNo: "NCR-001", sourceLinks: [{ kind: "CONTRACT_VERSION", contractId, contractVersionId }], contractId, assignedVendorId: vendorId, severity: "MAJOR", scopeSummary: "납품 범위", observedResult: "치수 초과", requirementSummary: "공차 이내", createdByUserId: ownerId }, creationCommand(internal(ownerId, "ncr.record.issue"))); }
function requiredCar(carId: ReturnType<typeof uuid>, state: CarSnapshot["state"]): RequiredCarFact { return { carId, ncrId, required: true, state, version: version(1) }; }

describe("SM-NCR-V1", () => {
  it("publishes constrained state/event maps and leaves REOPENED without an invented exit", () => {
    expect(NCR_TRANSITION_MAP["EVT-NCR-REQUEST-ROOT-CAUSE"]).toEqual({ from: ["CONTAINMENT"], to: "ROOT_CAUSE_REQUIRED" });
    expect(NCR_TRANSITION_MAP["EVT-NCR-REOPEN"]).toEqual({ from: ["CLOSED"], to: "REOPENED" });
    expect(CAR_TRANSITION_MAP["EVT-CAR-REWORK"]).toEqual({ from: ["INEFFECTIVE"], to: "IN_PROGRESS" });
  });

  it("separates containment from root cause/CAR and supports exact scoped Vendor containment", () => {
    const ncr = NonConformance.restore(createNcr().snapshot);
    expect(() => ncr.issue(command(internal(ownerId, "ncr.record.issue"), 0), [evidenceId])).toThrowError(expect.objectContaining({ code: "NCR_STALE_VERSION" }));
    expect(() => ncr.issue(command(internal(ownerId, "ncr.record.issue"), 1), [])).toThrowError(expect.objectContaining({ code: "NCR_ISSUE_EVIDENCE_REQUIRED" }));
    ncr.issue(command(internal(ownerId, "ncr.record.issue"), 1), [evidenceId]);
    const contained = ncr.contain(command(vendor("ncr.action.perform"), 2), { summary: "격리 완료", evidenceIds: [evidenceId] });
    expect(contained.snapshot).toMatchObject({ state: "CONTAINMENT", containmentSummary: "격리 완료" });
    expect(contained.snapshot).not.toHaveProperty("rootCause");
    expect(ncr.requestRootCause(command(internal(ownerId, "ncr.action.perform"), 3), "원인분석 요청").snapshot.state).toBe("ROOT_CAUSE_REQUIRED");
  });

  it("keeps responsibility assessments append-only and distinguishes preliminary, disputed and final", () => {
    const ncr = NonConformance.restore(createNcr().snapshot);
    const preliminary = ncr.assessResponsibility(command(internal(ownerId, "ncr.record.issue"), 1), { responsibilityAssessmentId: uuid("90000000-0000-4000-8000-000000000010"), status: "PRELIMINARY", partyKind: "VENDOR", vendorId, rationale: "초기 증거", evidenceIds: [evidenceId] });
    const disputed = ncr.assessResponsibility(command(internal(ownerId, "ncr.record.issue"), 2), { responsibilityAssessmentId: uuid("90000000-0000-4000-8000-000000000011"), status: "DISPUTED", partyKind: "UNDETERMINED", rationale: "업체 이의", evidenceIds: [evidenceId] });
    const final = ncr.assessResponsibility(command(internal(verifierId, "ncr.record.close"), 3), { responsibilityAssessmentId: uuid("90000000-0000-4000-8000-000000000012"), status: "FINAL", partyKind: "SHARED", vendorId, rationale: "최종 검토", evidenceIds: [evidenceId] });
    expect([preliminary.immutableResponsibilityAssessment?.sequenceNo, disputed.immutableResponsibilityAssessment?.sequenceNo, final.immutableResponsibilityAssessment?.sequenceNo]).toEqual([1, 2, 3]);
    expect(preliminary.immutableResponsibilityAssessment?.status).toBe("PRELIMINARY");
    expect(final.snapshot).toMatchObject({ currentResponsibilityStatus: "FINAL", responsibilityAssessmentCount: 3 });
    expect(() => ncr.assessResponsibility(command(vendor(), 4), { responsibilityAssessmentId: uuid("90000000-0000-4000-8000-000000000013"), status: "FINAL", partyKind: "VENDOR", vendorId, rationale: "self final", evidenceIds: [evidenceId] })).toThrowError(QualityDomainError);
  });

  it("cannot close until every reviewed required CAR is effective or closed and preserves reopen history", () => {
    const firstCar = uuid("90000000-0000-4000-8000-000000000014");
    const secondCar = uuid("90000000-0000-4000-8000-000000000015");
    const ncr = NonConformance.restore(createNcr().snapshot);
    ncr.issue(command(internal(ownerId, "ncr.record.issue"), 1), [evidenceId]);
    ncr.contain(command(internal(ownerId, "ncr.action.perform"), 2), { summary: "격리", evidenceIds: [evidenceId] });
    ncr.requestRootCause(command(internal(ownerId, "ncr.action.perform"), 3), "원인분석");
    ncr.submitPlan(command(internal(ownerId, "ncr.action.perform"), 4), [requiredCar(firstCar, "PROPOSED"), requiredCar(secondCar, "PROPOSED")], [evidenceId]);
    ncr.acceptPlan(command(internal(verifierId, "ncr.plan.review"), 5), [requiredCar(firstCar, "ACCEPTED"), requiredCar(secondCar, "ACCEPTED")], [evidenceId]);
    expect(() => ncr.readyToVerify(command(internal(ownerId, "ncr.action.perform"), 6), [requiredCar(firstCar, "VERIFICATION_REQUIRED")], [evidenceId])).toThrowError(expect.objectContaining({ code: "NCR_REQUIRED_CAR_SET_CHANGED" }));
    ncr.readyToVerify(command(internal(ownerId, "ncr.action.perform"), 6), [requiredCar(firstCar, "VERIFICATION_REQUIRED"), requiredCar(secondCar, "EFFECTIVE")], [evidenceId]);
    expect(() => ncr.close(command(internal(verifierId, "ncr.record.close"), 7), [requiredCar(firstCar, "EFFECTIVE"), requiredCar(secondCar, "INEFFECTIVE")], { reason: "종결", evidenceIds: [evidenceId] })).toThrowError(expect.objectContaining({ code: "NCR_REQUIRED_CAR_STATE_INVALID" }));
    const closed = ncr.close(command(internal(verifierId, "ncr.record.close"), 7), [requiredCar(firstCar, "EFFECTIVE"), requiredCar(secondCar, "CLOSED")], { reason: "종결", evidenceIds: [evidenceId] });
    expect(() => ncr.reopen(command(internal(verifierId, "ncr.record.close"), 8), { reason: "", evidenceIds: [] })).toThrowError(expect.objectContaining({ code: "NCR_REOPEN_REASON_REQUIRED" }));
    const reopened = ncr.reopen(command(internal(verifierId, "ncr.record.close"), 8), { reason: "재발", evidenceIds: [evidenceId] });
    expect(reopened.snapshot).toMatchObject({ state: "REOPENED", reopenCount: 1, lastClosedAt: closed.snapshot.lastClosedAt });
    expect(reopened.immutableReopen).toMatchObject({ ncrReopenId: reopened.event.eventId, reopenCount: 1, priorClosedAt: closed.snapshot.lastClosedAt, reason: "재발", reopenedByUserId: verifierId });
    expect(() => ncr.requestRootCause(command(internal(ownerId, "ncr.action.perform"), 9), "임의 후속")).toThrowError(expect.objectContaining({ code: "NCR_TRANSITION_INVALID" }));
  });
});

describe("SM-CAR-V1", () => {
  function createCar() { return CorrectiveAction.create({ carId: uuid("90000000-0000-4000-8000-000000000020"), carNo: "CAR-001", ncrId, contractId, required: true, rootCause: "가공조건 오류", actionPlan: "조건 수정 및 재검사", actionOwnerUserId: ownerId, dueAt: utcInstant("2026-09-01T00:00:00Z") }, creationCommand(internal(ownerId, "ncr.action.perform"))); }

  it("keeps Senior as review-only and forbids performer self-verification", () => {
    const car = CorrectiveAction.restore(createCar().snapshot);
    expect(() => car.accept(command(internal(verifierId), 1), [evidenceId])).toThrowError(expect.objectContaining({ code: "QUALITY_INTERNAL_AUTHORITY_REQUIRED" }));
    car.accept(command(internal(verifierId, "ncr.plan.review"), 1), [evidenceId]);
    car.start(command(internal(ownerId, "ncr.action.perform"), 2));
    car.submitVerification(command(internal(ownerId, "ncr.action.perform"), 3), [evidenceId]);
    expect(() => car.verify(command(internal(ownerId, "ncr.effectiveness.verify"), 4), { carVerificationId: uuid("90000000-0000-4000-8000-000000000021"), effective: true, summary: "self", evidenceIds: [evidenceId] })).toThrowError(expect.objectContaining({ code: "CAR_SELF_VERIFICATION_FORBIDDEN" }));
  });

  it("preserves ineffective verification and requires explicit rework before another cycle", () => {
    const car = CorrectiveAction.restore(createCar().snapshot);
    car.accept(command(internal(verifierId, "ncr.plan.review"), 1), [evidenceId]);
    car.start(command(internal(ownerId, "ncr.action.perform"), 2));
    car.submitVerification(command(internal(ownerId, "ncr.action.perform"), 3), [evidenceId]);
    const ineffective = car.verify(command(internal(verifierId, "ncr.effectiveness.verify"), 4), { carVerificationId: uuid("90000000-0000-4000-8000-000000000022"), effective: false, summary: "재발", evidenceIds: [evidenceId] });
    expect(ineffective).toMatchObject({ snapshot: { state: "INEFFECTIVE", effectivenessCycle: 1 }, event: { payload: { ecrReviewRequired: true } } });
    expect(ineffective.immutableVerification).toMatchObject({ effectivenessCycle: 1, result: "INEFFECTIVE", verifierUserId: verifierId });
    expect(() => car.close(command(internal(verifierId, "ncr.record.close"), 5), [evidenceId])).toThrowError(expect.objectContaining({ code: "CAR_TRANSITION_INVALID" }));
    expect(car.rework(command(internal(ownerId, "ncr.action.perform"), 5), { reason: "조건 재수정", evidenceIds: [evidenceId] }).snapshot).toMatchObject({ state: "IN_PROGRESS", effectivenessCycle: 2, verificationEvidenceIds: [] });
    car.submitVerification(command(internal(ownerId, "ncr.action.perform"), 6), [evidenceId]);
    car.verify(command(internal(verifierId, "ncr.effectiveness.verify"), 7), { carVerificationId: uuid("90000000-0000-4000-8000-000000000023"), effective: true, summary: "효과 확인", evidenceIds: [evidenceId] });
    expect(car.close(command(internal(verifierId, "ncr.record.close"), 8), [evidenceId]).snapshot.state).toBe("CLOSED");
  });
});

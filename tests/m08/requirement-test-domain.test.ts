import { describe, expect, it } from "vitest";
import { Requirement, createTestPlanVersion, createTestResult } from "../../packages/features/quality/src/domain/requirement-test.js";
import { sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const id = (n: number) => uuid(`81000000-0000-4000-8000-${String(n).padStart(12, "0")}`);

function initialRequirement() {
  return Requirement.create(
    { requirementId: id(1), requirementCode: "REQ-001", title: "토출 압력" },
    { requirementRevisionId: id(2), criticality: "CRITICAL", target: "10", tolerance: "±0.5", unit: "bar", acceptanceRule: "9.5~10.5 bar", changeReason: "최초 제정", createdByUserId: id(3), createdAt: utcInstant("2026-08-22T01:00:00Z") },
    utcInstant("2026-08-22T01:00:00Z")
  );
}

function plan() {
  return createTestPlanVersion({
    testPlanVersionId: id(5), testPlanId: id(4), versionNo: 1, conditions: "상온, 정격 유량", method: "3회 압력 측정", equipment: ["교정 압력계 EQ-01"], repetitions: 3,
    evidenceRequirements: [stableCode("EVIDENCE.RAW_MEASUREMENT")],
    requirementCoverage: [{ testPlanVersionId: id(5), requirementId: id(1), requirementRevisionId: id(2), coverageKind: "FULL" }],
    manifestHash: sha256("a".repeat(64)), createdByUserId: id(3), createdAt: utcInstant("2026-08-22T02:00:00Z")
  });
}

describe("Requirement and direct-next immutable revision", () => {
  it("creates revision 1 and advances only by an exact predecessor", () => {
    const created = initialRequirement();
    expect(created).toMatchObject({ expectedVersion: 0, snapshot: { currentRevisionNo: 1, currentRevisionId: id(2), state: "ACTIVE" }, immutableRevision: { revisionNo: 1 } });
    const revised = Requirement.restore(created.snapshot).revise(version(1), { requirementRevisionId: id(6), criticality: "CRITICAL", target: "12", tolerance: "±0.5", unit: "bar", acceptanceRule: "11.5~12.5 bar", changeReason: "설계 변경 승인 반영", createdByUserId: id(3), createdAt: utcInstant("2026-08-22T03:00:00Z") }, utcInstant("2026-08-22T03:00:00Z"));
    expect(revised).toMatchObject({ expectedVersion: 1, snapshot: { currentRevisionNo: 2, version: 2 }, immutableRevision: { revisionNo: 2, previousRequirementRevisionId: id(2) } });
    expect(() => Requirement.restore(created.snapshot).revise(version(0), revised.immutableRevision, utcInstant("2026-08-22T04:00:00Z"))).toThrowError(expect.objectContaining({ code: "REQUIREMENT_STALE_VERSION" }));
  });
});

describe("TestPlanVersion and immutable raw TestResult", () => {
  it("freezes exact RequirementRevision coverage before execution", () => {
    expect(plan()).toMatchObject({ versionNo: 1, requirementCoverage: [{ requirementRevisionId: id(2) }] });
    expect(() => createTestPlanVersion({ ...plan(), testPlanVersionId: id(7), requirementCoverage: [{ testPlanVersionId: id(5), requirementId: id(1), requirementRevisionId: id(2), coverageKind: "FULL" }] })).toThrowError(expect.objectContaining({ code: "TEST_PLAN_COVERAGE_SUBJECT_MISMATCH" }));
  });

  it("binds measurements and versioned raw evidence to the exact plan", () => {
    const exactPlan = plan();
    const result = createTestResult({
      testResultId: id(8), testPlanId: id(4), testPlanVersionId: id(5), executionNo: 1, testedDeliverableVersionId: id(9), verdict: "PASS",
      measurements: [{ testResultId: id(8), requirementRevisionId: id(2), sequenceNo: 1, observedValue: "10.1", unit: "bar", verdict: "PASS" }],
      rawEvidence: [{ testResultId: id(8), attachmentId: id(10), attachmentVersionId: id(11), contentHash: sha256("b".repeat(64)), evidenceTypeCode: stableCode("EVIDENCE.RAW_MEASUREMENT") }],
      evidenceManifestHash: sha256("c".repeat(64)), executedByUserId: id(3), executedAt: utcInstant("2026-08-22T05:00:00Z")
    }, exactPlan);
    expect(result).toMatchObject({ verdict: "PASS", testPlanVersionId: id(5), rawEvidence: [{ attachmentVersionId: id(11) }] });
    expect(() => createTestResult({ ...result, testPlanVersionId: id(12) }, exactPlan)).toThrowError(expect.objectContaining({ code: "TEST_RESULT_PLAN_VERSION_MISMATCH" }));
  });
});

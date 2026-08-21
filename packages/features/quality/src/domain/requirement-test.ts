import type { Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import { nextVersion } from "@youone/shared-kernel/public";

export type RequirementState = "ACTIVE" | "RETIRED";
export type RequirementCriticality = "NORMAL" | "IMPORTANT" | "CRITICAL";

export interface RequirementSnapshot {
  readonly requirementId: Uuid;
  readonly requirementCode: string;
  readonly title: string;
  readonly state: RequirementState;
  readonly currentRevisionId: Uuid;
  readonly currentRevisionNo: number;
  readonly version: Version;
  readonly createdAt: UtcInstant;
  readonly updatedAt: UtcInstant;
}

export interface RequirementRevisionSnapshot {
  readonly requirementRevisionId: Uuid;
  readonly requirementId: Uuid;
  readonly revisionNo: number;
  readonly previousRequirementRevisionId?: Uuid;
  readonly criticality: RequirementCriticality;
  readonly target: string;
  readonly tolerance?: string;
  readonly unit?: string;
  readonly acceptanceRule: string;
  readonly changeReason: string;
  readonly createdByUserId: Uuid;
  readonly createdAt: UtcInstant;
}

export interface RequirementRevisionMutation {
  readonly expectedVersion: Version;
  readonly snapshot: RequirementSnapshot;
  readonly immutableRevision: RequirementRevisionSnapshot;
}

export class QualityDomainError extends Error {
  public constructor(public readonly code: StableCode, message: string) {
    super(message);
    this.name = "QualityDomainError";
  }
}

function fail(code: string, message: string): never {
  throw new QualityDomainError(code as StableCode, message);
}

function requireText(value: string, code: string): void {
  if (!value.trim()) fail(code, "A non-empty value is required.");
}

function immutable<T>(value: T): T {
  return Object.freeze(structuredClone(value));
}

function validateRevision(revision: RequirementRevisionSnapshot): void {
  if (!Number.isSafeInteger(revision.revisionNo) || revision.revisionNo <= 0) fail("REQUIREMENT_REVISION_NO_INVALID", "revisionNo must be positive.");
  if ((revision.revisionNo === 1) !== (revision.previousRequirementRevisionId === undefined)) fail("REQUIREMENT_REVISION_PREDECESSOR_INVALID", "Only revision 1 omits a predecessor.");
  requireText(revision.target, "REQUIREMENT_TARGET_REQUIRED");
  requireText(revision.acceptanceRule, "REQUIREMENT_ACCEPTANCE_RULE_REQUIRED");
  requireText(revision.changeReason, "REQUIREMENT_CHANGE_REASON_REQUIRED");
}

export class Requirement {
  private constructor(private value: RequirementSnapshot) {}

  public static create(
    input: Omit<RequirementSnapshot, "state" | "currentRevisionId" | "currentRevisionNo" | "version" | "createdAt" | "updatedAt">,
    initialRevision: Omit<RequirementRevisionSnapshot, "requirementId" | "revisionNo" | "previousRequirementRevisionId">,
    at: UtcInstant
  ): RequirementRevisionMutation {
    requireText(input.requirementCode, "REQUIREMENT_CODE_REQUIRED");
    requireText(input.title, "REQUIREMENT_TITLE_REQUIRED");
    const revision: RequirementRevisionSnapshot = { ...structuredClone(initialRevision), requirementId: input.requirementId, revisionNo: 1 };
    validateRevision(revision);
    const snapshot: RequirementSnapshot = { ...structuredClone(input), state: "ACTIVE", currentRevisionId: revision.requirementRevisionId, currentRevisionNo: 1, version: 1 as Version, createdAt: at, updatedAt: at };
    return { expectedVersion: 0 as Version, snapshot: immutable(snapshot), immutableRevision: immutable(revision) };
  }

  public static restore(snapshot: RequirementSnapshot): Requirement {
    return new Requirement(structuredClone(snapshot));
  }

  public snapshot(): RequirementSnapshot {
    return structuredClone(this.value);
  }

  public revise(
    expectedVersion: Version,
    revision: Omit<RequirementRevisionSnapshot, "requirementId" | "revisionNo" | "previousRequirementRevisionId">,
    at: UtcInstant
  ): RequirementRevisionMutation {
    if (expectedVersion !== this.value.version) fail("REQUIREMENT_STALE_VERSION", "Optimistic version mismatch.");
    if (this.value.state !== "ACTIVE") fail("REQUIREMENT_NOT_ACTIVE", "A retired Requirement cannot be revised.");
    const immutableRevision: RequirementRevisionSnapshot = {
      ...structuredClone(revision),
      requirementId: this.value.requirementId,
      revisionNo: this.value.currentRevisionNo + 1,
      previousRequirementRevisionId: this.value.currentRevisionId
    };
    validateRevision(immutableRevision);
    const previousVersion = this.value.version;
    this.value = {
      ...this.value,
      currentRevisionId: immutableRevision.requirementRevisionId,
      currentRevisionNo: immutableRevision.revisionNo,
      version: nextVersion(previousVersion),
      updatedAt: at
    };
    return { expectedVersion: previousVersion, snapshot: immutable(this.value), immutableRevision: immutable(immutableRevision) };
  }
}

export interface TestRequirementCoverage {
  readonly testPlanVersionId: Uuid;
  readonly requirementId: Uuid;
  readonly requirementRevisionId: Uuid;
  readonly coverageKind: "FULL" | "PARTIAL";
}

export interface TestPlanVersionSnapshot {
  readonly testPlanVersionId: Uuid;
  readonly testPlanId: Uuid;
  readonly versionNo: number;
  readonly previousTestPlanVersionId?: Uuid;
  readonly conditions: string;
  readonly method: string;
  readonly equipment: readonly string[];
  readonly repetitions: number;
  readonly evidenceRequirements: readonly StableCode[];
  readonly requirementCoverage: readonly TestRequirementCoverage[];
  readonly manifestHash: Sha256;
  readonly createdByUserId: Uuid;
  readonly createdAt: UtcInstant;
}

export function createTestPlanVersion(input: TestPlanVersionSnapshot): TestPlanVersionSnapshot {
  if (!Number.isSafeInteger(input.versionNo) || input.versionNo <= 0) fail("TEST_PLAN_VERSION_NO_INVALID", "versionNo must be positive.");
  if ((input.versionNo === 1) !== (input.previousTestPlanVersionId === undefined)) fail("TEST_PLAN_PREDECESSOR_INVALID", "Only version 1 omits a predecessor.");
  requireText(input.conditions, "TEST_PLAN_CONDITIONS_REQUIRED");
  requireText(input.method, "TEST_PLAN_METHOD_REQUIRED");
  if (!Number.isSafeInteger(input.repetitions) || input.repetitions <= 0) fail("TEST_PLAN_REPETITIONS_INVALID", "repetitions must be positive.");
  if (input.equipment.length === 0 || input.equipment.some((item) => !item.trim())) fail("TEST_PLAN_EQUIPMENT_REQUIRED", "At least one exact equipment entry is required.");
  if (input.evidenceRequirements.length === 0) fail("TEST_PLAN_EVIDENCE_REQUIRED", "Evidence requirements are required before execution.");
  if (input.requirementCoverage.length === 0) fail("TEST_PLAN_COVERAGE_REQUIRED", "At least one exact RequirementRevision must be covered.");
  const covered = new Set<string>();
  for (const item of input.requirementCoverage) {
    if (item.testPlanVersionId !== input.testPlanVersionId) fail("TEST_PLAN_COVERAGE_SUBJECT_MISMATCH", "Coverage must bind the exact TestPlanVersion.");
    if (covered.has(item.requirementRevisionId)) fail("TEST_PLAN_COVERAGE_DUPLICATE", "A RequirementRevision may be covered once per TestPlanVersion.");
    covered.add(item.requirementRevisionId);
  }
  return Object.freeze({
    ...structuredClone(input),
    equipment: Object.freeze([...input.equipment]),
    evidenceRequirements: Object.freeze([...input.evidenceRequirements]),
    requirementCoverage: Object.freeze(input.requirementCoverage.map(immutable))
  });
}

export type TestResultVerdict = "PASS" | "FAIL" | "INCONCLUSIVE" | "UNABLE_TO_VERIFY";
export interface TestMeasurement {
  readonly testResultId: Uuid;
  readonly requirementRevisionId: Uuid;
  readonly sequenceNo: number;
  readonly observedValue: string;
  readonly unit?: string;
  readonly verdict: TestResultVerdict;
}
export interface TestEvidenceReference {
  readonly testResultId: Uuid;
  readonly attachmentId: Uuid;
  readonly attachmentVersionId: Uuid;
  readonly contentHash: Sha256;
  readonly evidenceTypeCode: StableCode;
}
export interface TestResultSnapshot {
  readonly testResultId: Uuid;
  readonly testPlanId: Uuid;
  readonly testPlanVersionId: Uuid;
  readonly executionNo: number;
  readonly testedDeliverableVersionId?: Uuid;
  readonly verdict: TestResultVerdict;
  readonly measurements: readonly TestMeasurement[];
  readonly rawEvidence: readonly TestEvidenceReference[];
  readonly evidenceManifestHash: Sha256;
  readonly executedByUserId: Uuid;
  readonly executedAt: UtcInstant;
}

export function createTestResult(input: TestResultSnapshot, plan: TestPlanVersionSnapshot): TestResultSnapshot {
  createTestPlanVersion(plan);
  if (input.testPlanId !== plan.testPlanId || input.testPlanVersionId !== plan.testPlanVersionId) fail("TEST_RESULT_PLAN_VERSION_MISMATCH", "TestResult must bind the exact TestPlanVersion.");
  if (!Number.isSafeInteger(input.executionNo) || input.executionNo <= 0) fail("TEST_RESULT_EXECUTION_NO_INVALID", "executionNo must be positive.");
  if (input.measurements.length === 0) fail("TEST_RESULT_MEASUREMENT_REQUIRED", "Measured results are required.");
  if (input.rawEvidence.length === 0) fail("TEST_RESULT_RAW_EVIDENCE_REQUIRED", "Immutable raw evidence is required.");
  const covered = new Set(plan.requirementCoverage.map((item) => item.requirementRevisionId));
  const measured = new Set<string>();
  const sequences = new Set<number>();
  for (const item of input.measurements) {
    if (item.testResultId !== input.testResultId) fail("TEST_RESULT_MEASUREMENT_SUBJECT_MISMATCH", "Measurement must bind the exact TestResult.");
    if (!covered.has(item.requirementRevisionId)) fail("TEST_RESULT_REQUIREMENT_NOT_COVERED", "Measurement must name a RequirementRevision covered by the exact plan version.");
    if (!Number.isSafeInteger(item.sequenceNo) || item.sequenceNo <= 0 || sequences.has(item.sequenceNo) || measured.has(item.requirementRevisionId)) fail("TEST_RESULT_MEASUREMENT_DUPLICATE", "Each sequence and covered RequirementRevision may be measured once.");
    measured.add(item.requirementRevisionId);
    sequences.add(item.sequenceNo);
    requireText(item.observedValue, "TEST_RESULT_OBSERVED_VALUE_REQUIRED");
  }
  if (measured.size !== covered.size) fail("TEST_RESULT_COVERAGE_INCOMPLETE", "Every RequirementRevision in the exact plan version requires a result.");
  for (const evidence of input.rawEvidence) if (evidence.testResultId !== input.testResultId) fail("TEST_RESULT_EVIDENCE_SUBJECT_MISMATCH", "Evidence must bind the exact TestResult.");
  return Object.freeze({ ...structuredClone(input), measurements: Object.freeze(input.measurements.map(immutable)), rawEvidence: Object.freeze(input.rawEvidence.map(immutable)) });
}

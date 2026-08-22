import type { CorrelationId, IdempotencyKey, Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import { nextVersion } from "@youone/shared-kernel/public";
import { QualityDomainError } from "./requirement-test.js";

export const INSPECTION_MACHINE_ID = "SM-INSPECTION-V1" as const;
export const INSPECTION_EVENT_IDS = {
  REQUESTED: "EVT-INSPECTION-REQUEST",
  SCHEDULED: "EVT-INSPECTION-SCHEDULE",
  STARTED: "EVT-INSPECTION-START",
  DECISION_SUBMITTED: "EVT-INSPECTION-SUBMIT-DECISION",
  ACCEPTED: "EVT-INSPECTION-ACCEPT",
  CORRECTION_REQUESTED: "EVT-INSPECTION-REQUEST-CORRECTION",
  REJECTED: "EVT-INSPECTION-REJECT",
  CORRECTION_SUBMITTED: "EVT-INSPECTION-CORRECTION-SUBMITTED",
  REINSPECTION_STARTED: "EVT-INSPECTION-REINSPECT",
  CANCELLED: "EVT-INSPECTION-CANCEL"
} as const;

export type InspectionState = "REQUESTED" | "SCHEDULED" | "IN_PROGRESS" | "DECISION_PENDING" | "CORRECTION_REQUIRED" | "REINSPECTION_PENDING" | "COMPLETED" | "CANCELLED";
export type InspectionDisposition = "ACCEPTED" | "PARTIAL_ACCEPTANCE" | "CONDITIONAL_ACCEPTANCE" | "CORRECTION_REQUESTED" | "REJECTED" | "UNABLE_TO_VERIFY";
export type CriterionVerdict = "PASS" | "FAIL" | "PARTIAL" | "UNABLE_TO_VERIFY";

export interface InspectionActorSnapshot {
  readonly actorKind: "INTERNAL" | "VENDOR" | "SYSTEM";
  readonly userId?: Uuid;
  readonly vendorId?: Uuid;
  readonly active: boolean;
  readonly authorities: readonly StableCode[];
  readonly contractScopeId?: Uuid;
  readonly contractScopeContractId?: Uuid;
}

export interface InspectionSnapshot {
  readonly inspectionId: Uuid;
  readonly inspectionNo: string;
  readonly inspectionTypeCode: StableCode;
  readonly contractId: Uuid;
  readonly contractMilestoneId: Uuid;
  readonly deliverableId: Uuid;
  readonly deliverableVersionId: Uuid;
  readonly assignedVendorId: Uuid;
  readonly inspectionChecklistVersionId: Uuid;
  readonly state: InspectionState;
  readonly scheduledAt?: UtcInstant;
  readonly openAttemptId?: Uuid;
  readonly openAttemptNo?: number;
  readonly latestSealedAttemptId?: Uuid;
  readonly latestAttemptNo: number;
  readonly finalDisposition?: InspectionDisposition;
  readonly version: Version;
  readonly createdAt: UtcInstant;
  readonly updatedAt: UtcInstant;
}

export interface AcceptanceScorePolicy {
  readonly policyId: StableCode;
  readonly policyVersion: number;
  readonly rounding: { readonly decimalPlaces: number; readonly mode: "HALF_UP" | "DOWN" };
  readonly bands: readonly {
    readonly minInclusive: string;
    readonly maxExclusive?: string;
    readonly disposition: Extract<InspectionDisposition, "ACCEPTED" | "CONDITIONAL_ACCEPTANCE" | "PARTIAL_ACCEPTANCE" | "REJECTED">;
  }[];
}

export const INITIAL_ACCEPTANCE_POLICY_V1: AcceptanceScorePolicy = Object.freeze({
  policyId: "POL-ACCEPTANCE-PAYMENT-V1" as StableCode,
  policyVersion: 1,
  rounding: Object.freeze({ decimalPlaces: 2, mode: "HALF_UP" as const }),
  bands: Object.freeze([
    Object.freeze({ minInclusive: "100", disposition: "ACCEPTED" as const }),
    Object.freeze({ minInclusive: "90", maxExclusive: "100", disposition: "CONDITIONAL_ACCEPTANCE" as const }),
    Object.freeze({ minInclusive: "60", maxExclusive: "90", disposition: "PARTIAL_ACCEPTANCE" as const }),
    Object.freeze({ minInclusive: "0", maxExclusive: "60", disposition: "REJECTED" as const })
  ])
});

export interface InspectionCriterionSnapshot {
  readonly inspectionCriterionId: Uuid;
  readonly inspectionChecklistVersionId: Uuid;
  readonly sequenceNo: number;
  readonly criterionCode: StableCode;
  readonly title: string;
  readonly requirementRevisionId?: Uuid;
  readonly weightPercent: string;
  readonly critical: boolean;
  readonly requiredEvidence: readonly StableCode[];
  readonly measurementRule: string;
  readonly passRule: string;
}

export interface InspectionChecklistVersionSnapshot {
  readonly inspectionChecklistVersionId: Uuid;
  readonly inspectionId: Uuid;
  readonly versionNo: number;
  readonly previousChecklistVersionId?: Uuid;
  readonly policy: AcceptanceScorePolicy;
  readonly criteria: readonly InspectionCriterionSnapshot[];
  readonly checksum: Sha256;
  readonly sealedAt: UtcInstant;
  readonly sealedByUserId: Uuid;
}

export interface InspectionCriterionResultSnapshot {
  readonly inspectionCriterionResultId: Uuid;
  readonly inspectionAttemptId: Uuid;
  readonly inspectionCriterionId: Uuid;
  readonly requirementRevisionId?: Uuid;
  readonly achievedPercent: string;
  readonly verdict: CriterionVerdict;
  readonly observedValue: string;
  readonly evidenceIds: readonly Uuid[];
}

export interface IndependentUsablePortionSnapshot {
  readonly portionCode: StableCode;
  readonly description: string;
  readonly deliverableVersionId: Uuid;
  readonly evidenceIds: readonly Uuid[];
}

export interface ResidualConditionSnapshot {
  readonly conditionCode: StableCode;
  readonly description: string;
  readonly dueAt?: UtcInstant;
  readonly evidenceIds: readonly Uuid[];
}

export interface InspectionAttemptSnapshot {
  readonly inspectionAttemptId: Uuid;
  readonly inspectionId: Uuid;
  readonly attemptNo: number;
  readonly state: "SEALED";
  readonly sealedAt: UtcInstant;
  readonly checksum: Sha256;
  readonly inspectionChecklistVersionId: Uuid;
  readonly policyId: StableCode;
  readonly policyVersion: number;
  readonly contractId: Uuid;
  readonly contractMilestoneId: Uuid;
  readonly deliverableId: Uuid;
  readonly deliverableVersionId: Uuid;
  readonly disposition: InspectionDisposition;
  readonly achievementPercent: string;
  readonly criterionResults: readonly InspectionCriterionResultSnapshot[];
  readonly evidenceIds: readonly Uuid[];
  readonly criticalFailureCriterionIds: readonly Uuid[];
  readonly independentlyUsablePortions: readonly IndependentUsablePortionSnapshot[];
  readonly residualConditions: readonly ResidualConditionSnapshot[];
  readonly inspectorUserId: Uuid;
}

export interface SealInspectionAttemptInput {
  readonly inspectionAttemptId: Uuid;
  readonly inspectionId: Uuid;
  readonly attemptNo: number;
  readonly contractId: Uuid;
  readonly contractMilestoneId: Uuid;
  readonly deliverableId: Uuid;
  readonly deliverableVersionId: Uuid;
  readonly criterionResults: readonly InspectionCriterionResultSnapshot[];
  readonly independentlyUsablePortions?: readonly IndependentUsablePortionSnapshot[];
  readonly residualConditions?: readonly ResidualConditionSnapshot[];
  readonly inspectorUserId: Uuid;
  readonly checksum: Sha256;
  readonly sealedAt: UtcInstant;
}

const PERCENT_SCALE = 1_000_000n;

function fail(code: string, message: string): never {
  throw new QualityDomainError(code as StableCode, message);
}

function requireText(value: string, code: string): void {
  if (!value.trim()) fail(code, "A non-empty value is required.");
}

function parsePercent(value: string, code: string): bigint {
  if (!/^(?:0|[1-9][0-9]?|100)(?:\.[0-9]{1,6})?$/.test(value)) fail(code, "A percent must be between 0 and 100 with at most six decimal places.");
  const [whole = "0", fraction = ""] = value.split(".");
  const scaled = BigInt(whole) * PERCENT_SCALE + BigInt(fraction.padEnd(6, "0"));
  if (scaled < 0n || scaled > 100n * PERCENT_SCALE) fail(code, "A percent must be between 0 and 100.");
  return scaled;
}

function formatPercent(scaled: bigint, decimalPlaces: number): string {
  const whole = scaled / PERCENT_SCALE;
  if (decimalPlaces === 0) return whole.toString();
  const fraction = (scaled % PERCENT_SCALE).toString().padStart(6, "0").slice(0, decimalPlaces).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function rounded(value: bigint, policy: AcceptanceScorePolicy["rounding"]): bigint {
  if (!Number.isSafeInteger(policy.decimalPlaces) || policy.decimalPlaces < 0 || policy.decimalPlaces > 6) fail("INSPECTION_ROUNDING_INVALID", "decimalPlaces must be between 0 and 6.");
  const factor = 10n ** BigInt(6 - policy.decimalPlaces);
  const quotient = value / factor;
  const remainder = value % factor;
  return (policy.mode === "HALF_UP" && remainder * 2n >= factor ? quotient + 1n : quotient) * factor;
}

function validatePolicy(policy: AcceptanceScorePolicy): void {
  if (!Number.isSafeInteger(policy.policyVersion) || policy.policyVersion <= 0 || policy.bands.length === 0) fail("INSPECTION_POLICY_INVALID", "A positive version and score bands are required.");
  rounded(0n, policy.rounding);
  for (const band of policy.bands) {
    const min = parsePercent(band.minInclusive, "INSPECTION_POLICY_BAND_INVALID");
    if (band.maxExclusive !== undefined && parsePercent(band.maxExclusive, "INSPECTION_POLICY_BAND_INVALID") <= min) fail("INSPECTION_POLICY_BAND_INVALID", "Band maximum must exceed its minimum.");
  }
}

export function createInspectionChecklistVersion(input: InspectionChecklistVersionSnapshot): InspectionChecklistVersionSnapshot {
  if (!Number.isSafeInteger(input.versionNo) || input.versionNo <= 0) fail("INSPECTION_CHECKLIST_VERSION_NO_INVALID", "versionNo must be positive.");
  if ((input.versionNo === 1) !== (input.previousChecklistVersionId === undefined)) fail("INSPECTION_CHECKLIST_PREDECESSOR_INVALID", "Only version 1 omits a predecessor.");
  validatePolicy(input.policy);
  if (input.criteria.length === 0) fail("INSPECTION_CRITERIA_REQUIRED", "A checklist requires criteria.");
  const ids = new Set<string>();
  const sequences = new Set<number>();
  let total = 0n;
  for (const criterion of input.criteria) {
    if (criterion.inspectionChecklistVersionId !== input.inspectionChecklistVersionId) fail("INSPECTION_CRITERION_CHECKLIST_MISMATCH", "Criterion must bind the exact checklist version.");
    if (!Number.isSafeInteger(criterion.sequenceNo) || criterion.sequenceNo <= 0 || sequences.has(criterion.sequenceNo)) fail("INSPECTION_CRITERION_SEQUENCE_INVALID", "Criterion sequences must be positive and unique.");
    if (ids.has(criterion.inspectionCriterionId)) fail("INSPECTION_CRITERION_DUPLICATE", "Criterion IDs must be unique.");
    requireText(criterion.title, "INSPECTION_CRITERION_TITLE_REQUIRED");
    requireText(criterion.measurementRule, "INSPECTION_MEASUREMENT_RULE_REQUIRED");
    requireText(criterion.passRule, "INSPECTION_PASS_RULE_REQUIRED");
    if (criterion.requiredEvidence.length === 0) fail("INSPECTION_REQUIRED_EVIDENCE_EMPTY", "Each criterion must define its evidence requirement.");
    total += parsePercent(criterion.weightPercent, "INSPECTION_CRITERION_WEIGHT_INVALID");
    ids.add(criterion.inspectionCriterionId);
    sequences.add(criterion.sequenceNo);
  }
  if (total !== 100n * PERCENT_SCALE) fail("INSPECTION_CRITERION_WEIGHT_TOTAL_INVALID", "Criterion weights must total exactly 100.");
  return Object.freeze({ ...structuredClone(input), policy: Object.freeze(structuredClone(input.policy)), criteria: Object.freeze(input.criteria.map((criterion) => Object.freeze({ ...structuredClone(criterion), requiredEvidence: Object.freeze([...criterion.requiredEvidence]) }))) });
}

function dispositionFor(score: bigint, policy: AcceptanceScorePolicy): InspectionDisposition {
  for (const band of policy.bands) {
    const min = parsePercent(band.minInclusive, "INSPECTION_POLICY_BAND_INVALID");
    const max = band.maxExclusive === undefined ? undefined : parsePercent(band.maxExclusive, "INSPECTION_POLICY_BAND_INVALID");
    if (score >= min && (max === undefined || score < max)) return band.disposition;
  }
  fail("INSPECTION_POLICY_NO_MATCHING_BAND", "The policy does not cover the calculated score.");
}

export function sealInspectionAttempt(input: SealInspectionAttemptInput, checklistInput: InspectionChecklistVersionSnapshot): InspectionAttemptSnapshot {
  const checklist = createInspectionChecklistVersion(checklistInput);
  if (input.inspectionId !== checklist.inspectionId) fail("INSPECTION_ATTEMPT_CHECKLIST_SUBJECT_MISMATCH", "Attempt and checklist must bind the exact Inspection.");
  if (!Number.isSafeInteger(input.attemptNo) || input.attemptNo <= 0) fail("INSPECTION_ATTEMPT_NO_INVALID", "attemptNo must be positive.");
  const criterionMap = new Map(checklist.criteria.map((criterion) => [criterion.inspectionCriterionId, criterion]));
  if (input.criterionResults.length !== criterionMap.size) fail("INSPECTION_RESULT_COVERAGE_INCOMPLETE", "Every checklist criterion requires exactly one result.");
  const seen = new Set<string>();
  const evidenceIds = new Set<Uuid>();
  const criticalFailures: Uuid[] = [];
  let weightedScore = 0n;
  let unableToVerify = false;
  for (const result of input.criterionResults) {
    if (result.inspectionAttemptId !== input.inspectionAttemptId) fail("INSPECTION_RESULT_ATTEMPT_MISMATCH", "CriterionResult must bind the exact attempt.");
    const criterion = criterionMap.get(result.inspectionCriterionId);
    if (!criterion || seen.has(result.inspectionCriterionId)) fail("INSPECTION_RESULT_CRITERION_INVALID", "CriterionResult must bind one unique criterion in the exact checklist.");
    if (result.requirementRevisionId !== criterion.requirementRevisionId) fail("INSPECTION_RESULT_REQUIREMENT_REVISION_MISMATCH", "CriterionResult must preserve the exact RequirementRevision.");
    requireText(result.observedValue, "INSPECTION_RESULT_OBSERVED_VALUE_REQUIRED");
    if (result.evidenceIds.length === 0) fail("INSPECTION_RESULT_EVIDENCE_REQUIRED", "Criterion evidence is required.");
    const achievement = parsePercent(result.achievedPercent, "INSPECTION_RESULT_ACHIEVEMENT_INVALID");
    const weight = parsePercent(criterion.weightPercent, "INSPECTION_CRITERION_WEIGHT_INVALID");
    weightedScore += (weight * achievement) / (100n * PERCENT_SCALE);
    if (criterion.critical && result.verdict !== "PASS") criticalFailures.push(criterion.inspectionCriterionId);
    if (result.verdict === "UNABLE_TO_VERIFY") unableToVerify = true;
    for (const evidenceId of result.evidenceIds) evidenceIds.add(evidenceId);
    seen.add(result.inspectionCriterionId);
  }
  const roundedScore = rounded(weightedScore, checklist.policy.rounding);
  let disposition = unableToVerify ? "UNABLE_TO_VERIFY" : dispositionFor(roundedScore, checklist.policy);
  const usable = [...(input.independentlyUsablePortions ?? [])];
  const residual = [...(input.residualConditions ?? [])];
  for (const item of usable) {
    requireText(item.description, "INSPECTION_USABLE_PORTION_DESCRIPTION_REQUIRED");
    if (item.deliverableVersionId !== input.deliverableVersionId) fail("INSPECTION_USABLE_PORTION_VERSION_MISMATCH", "Usable portions must bind the exact inspected DeliverableVersion.");
    if (item.evidenceIds.length === 0) fail("INSPECTION_USABLE_PORTION_EVIDENCE_REQUIRED", "Usable portions require evidence.");
  }
  for (const item of residual) requireText(item.description, "INSPECTION_RESIDUAL_CONDITION_DESCRIPTION_REQUIRED");
  if (criticalFailures.length > 0 && disposition !== "REJECTED" && disposition !== "UNABLE_TO_VERIFY") disposition = usable.length > 0 ? "PARTIAL_ACCEPTANCE" : "CORRECTION_REQUESTED";
  if (disposition === "PARTIAL_ACCEPTANCE" && usable.length === 0) fail("INSPECTION_PARTIAL_USABLE_PORTION_REQUIRED", "Partial acceptance requires independently usable portions.");
  if (disposition === "CONDITIONAL_ACCEPTANCE" && residual.length === 0) fail("INSPECTION_CONDITIONAL_RESIDUAL_REQUIRED", "Conditional acceptance requires residual conditions.");
  return Object.freeze({
    inspectionAttemptId: input.inspectionAttemptId,
    inspectionId: input.inspectionId,
    attemptNo: input.attemptNo,
    state: "SEALED",
    sealedAt: input.sealedAt,
    checksum: input.checksum,
    inspectionChecklistVersionId: checklist.inspectionChecklistVersionId,
    policyId: checklist.policy.policyId,
    policyVersion: checklist.policy.policyVersion,
    contractId: input.contractId,
    contractMilestoneId: input.contractMilestoneId,
    deliverableId: input.deliverableId,
    deliverableVersionId: input.deliverableVersionId,
    disposition,
    achievementPercent: formatPercent(roundedScore, checklist.policy.rounding.decimalPlaces),
    criterionResults: Object.freeze(input.criterionResults.map((result) => Object.freeze({ ...structuredClone(result), evidenceIds: Object.freeze([...result.evidenceIds]) }))),
    evidenceIds: Object.freeze([...evidenceIds]),
    criticalFailureCriterionIds: Object.freeze(criticalFailures),
    independentlyUsablePortions: Object.freeze(usable.map((item) => Object.freeze({ ...structuredClone(item), evidenceIds: Object.freeze([...item.evidenceIds]) }))),
    residualConditions: Object.freeze(residual.map((item) => Object.freeze({ ...structuredClone(item), evidenceIds: Object.freeze([...item.evidenceIds]) }))),
    inspectorUserId: input.inspectorUserId
  });
}

export function deriveRepeatedCriticalFailureCount(attempts: readonly InspectionAttemptSnapshot[], criterionId: Uuid): number {
  const attemptNos = new Set<number>();
  let count = 0;
  for (const attempt of attempts) {
    if (attempt.state !== "SEALED") fail("INSPECTION_ATTEMPT_NOT_SEALED", "Critical failure counts use sealed attempts only.");
    if (attemptNos.has(attempt.attemptNo)) fail("INSPECTION_ATTEMPT_NO_DUPLICATE", "Attempt numbers must be immutable and unique.");
    attemptNos.add(attempt.attemptNo);
    if (attempt.criticalFailureCriterionIds.includes(criterionId)) count += 1;
  }
  return count;
}

export interface InspectionCommand {
  readonly actor: InspectionActorSnapshot;
  readonly at: UtcInstant;
  readonly expectedVersion: Version;
  readonly eventId: Uuid;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
  readonly reason?: string;
}

export interface InspectionMutation {
  readonly expectedVersion: Version;
  readonly snapshot: InspectionSnapshot;
  readonly immutableAttempt?: InspectionAttemptSnapshot;
  readonly event: { readonly eventId: Uuid; readonly eventType: StableCode; readonly machineId: typeof INSPECTION_MACHINE_ID; readonly aggregateId: Uuid; readonly aggregateVersion: Version; readonly occurredAt: UtcInstant; readonly correlationId: CorrelationId; readonly idempotencyKey: IdempotencyKey };
  readonly audit: { readonly actionId: StableCode; readonly actor: InspectionActorSnapshot; readonly inspectionId: Uuid; readonly occurredAt: UtcInstant; readonly correlationId: CorrelationId; readonly reason?: string };
}

export class Inspection {
  private constructor(private value: InspectionSnapshot) {}

  public static request(input: Omit<InspectionSnapshot, "state" | "scheduledAt" | "openAttemptId" | "openAttemptNo" | "latestSealedAttemptId" | "latestAttemptNo" | "finalDisposition" | "version" | "createdAt" | "updatedAt">, command: Omit<InspectionCommand, "expectedVersion">): InspectionMutation {
    requireText(input.inspectionNo, "INSPECTION_NO_REQUIRED");
    Inspection.requireRequester(input, command.actor);
    const snapshot: InspectionSnapshot = { ...structuredClone(input), state: "REQUESTED", latestAttemptNo: 0, version: 1 as Version, createdAt: command.at, updatedAt: command.at };
    return Inspection.mutation(snapshot, command, 0 as Version, INSPECTION_EVENT_IDS.REQUESTED);
  }

  public static restore(snapshot: InspectionSnapshot): Inspection { return new Inspection(structuredClone(snapshot)); }
  public snapshot(): InspectionSnapshot { return structuredClone(this.value); }

  public schedule(command: InspectionCommand, scheduledAt: UtcInstant): InspectionMutation {
    this.guard(command, "REQUESTED"); this.requireInternal(command.actor, "INSPECTOR");
    this.value = { ...this.value, scheduledAt };
    return this.transition(command, "SCHEDULED", INSPECTION_EVENT_IDS.SCHEDULED);
  }

  public start(command: InspectionCommand, inspectionAttemptId: Uuid): InspectionMutation {
    this.guard(command, "SCHEDULED"); this.requireInternal(command.actor, "INSPECTOR");
    this.value = { ...this.value, openAttemptId: inspectionAttemptId, openAttemptNo: 1 };
    return this.transition(command, "IN_PROGRESS", INSPECTION_EVENT_IDS.STARTED);
  }

  public submitDecision(command: InspectionCommand, attempt: InspectionAttemptSnapshot): InspectionMutation {
    this.guard(command, "IN_PROGRESS"); this.requireInternal(command.actor, "INSPECTOR"); this.requireExactAttempt(attempt);
    this.value = { ...this.value, latestSealedAttemptId: attempt.inspectionAttemptId, latestAttemptNo: attempt.attemptNo, openAttemptId: undefined, openAttemptNo: undefined };
    return this.transition(command, "DECISION_PENDING", INSPECTION_EVENT_IDS.DECISION_SUBMITTED, attempt);
  }

  public accept(command: InspectionCommand, attempt: InspectionAttemptSnapshot): InspectionMutation {
    this.guard(command, "DECISION_PENDING"); this.requireInternalDecider(command.actor); this.requireLatestAttempt(attempt);
    if (!["ACCEPTED", "PARTIAL_ACCEPTANCE", "CONDITIONAL_ACCEPTANCE"].includes(attempt.disposition)) fail("INSPECTION_ACCEPT_DISPOSITION_INVALID", "Only an accepted, partial, or conditional sealed attempt can complete through acceptance.");
    this.value = { ...this.value, finalDisposition: attempt.disposition };
    return this.transition(command, "COMPLETED", INSPECTION_EVENT_IDS.ACCEPTED);
  }

  public requestCorrection(command: InspectionCommand, attempt: InspectionAttemptSnapshot): InspectionMutation {
    this.guard(command, "DECISION_PENDING"); this.requireInternalDecider(command.actor); this.requireLatestAttempt(attempt); requireText(command.reason ?? "", "INSPECTION_CORRECTION_REASON_REQUIRED");
    if (!["CORRECTION_REQUESTED", "UNABLE_TO_VERIFY", "REJECTED"].includes(attempt.disposition)) fail("INSPECTION_CORRECTION_DISPOSITION_INVALID", "The sealed disposition does not support correction.");
    this.value = { ...this.value, finalDisposition: "CORRECTION_REQUESTED" };
    return this.transition(command, "CORRECTION_REQUIRED", INSPECTION_EVENT_IDS.CORRECTION_REQUESTED);
  }

  public reject(command: InspectionCommand, attempt: InspectionAttemptSnapshot): InspectionMutation {
    this.guard(command, "DECISION_PENDING"); this.requireInternalDecider(command.actor); this.requireLatestAttempt(attempt); requireText(command.reason ?? "", "INSPECTION_REJECT_REASON_REQUIRED");
    if (attempt.disposition !== "REJECTED") fail("INSPECTION_REJECT_DISPOSITION_INVALID", "Only a rejected sealed attempt can complete through rejection.");
    this.value = { ...this.value, finalDisposition: "REJECTED" };
    return this.transition(command, "COMPLETED", INSPECTION_EVENT_IDS.REJECTED);
  }

  public submitCorrection(command: InspectionCommand, correctedDeliverableVersionId: Uuid): InspectionMutation {
    this.guard(command, "CORRECTION_REQUIRED"); Inspection.requireRequester(this.value, command.actor);
    this.value = { ...this.value, deliverableVersionId: correctedDeliverableVersionId, finalDisposition: undefined };
    return this.transition(command, "REINSPECTION_PENDING", INSPECTION_EVENT_IDS.CORRECTION_SUBMITTED);
  }

  public startReinspection(command: InspectionCommand, inspectionAttemptId: Uuid): InspectionMutation {
    this.guard(command, "REINSPECTION_PENDING"); this.requireInternal(command.actor, "INSPECTOR");
    this.value = { ...this.value, openAttemptId: inspectionAttemptId, openAttemptNo: this.value.latestAttemptNo + 1 };
    return this.transition(command, "IN_PROGRESS", INSPECTION_EVENT_IDS.REINSPECTION_STARTED);
  }

  public cancel(command: InspectionCommand): InspectionMutation {
    this.guard(command, "REQUESTED", "SCHEDULED"); this.requireInternal(command.actor, "INSPECTION_MANAGER"); requireText(command.reason ?? "", "INSPECTION_CANCEL_REASON_REQUIRED");
    return this.transition(command, "CANCELLED", INSPECTION_EVENT_IDS.CANCELLED);
  }

  private guard(command: InspectionCommand, ...states: readonly InspectionState[]): void {
    if (command.expectedVersion !== this.value.version) fail("INSPECTION_STALE_VERSION", "Optimistic version mismatch.");
    if (!states.includes(this.value.state)) fail("INSPECTION_STATE_INVALID", `Operation is not allowed from ${this.value.state}.`);
    if (!command.actor.active) fail("INSPECTION_ACTOR_INACTIVE", "Inactive actors cannot act.");
  }
  private requireInternal(actor: InspectionActorSnapshot, authority: string): void {
    if (actor.actorKind !== "INTERNAL" || !actor.userId || !actor.authorities.includes(authority as StableCode)) fail("INSPECTION_INTERNAL_AUTHORITY_REQUIRED", `Internal ${authority} authority is required.`);
  }
  private requireInternalDecider(actor: InspectionActorSnapshot): void {
    if (actor.actorKind !== "INTERNAL" || !actor.userId || (!actor.authorities.includes("INSPECTION_DECIDER" as StableCode) && !actor.authorities.includes("DIRECTOR" as StableCode))) fail("INSPECTION_INTERNAL_DECIDER_REQUIRED", "Vendor self-acceptance is forbidden; an authorized internal decider is required.");
  }
  private requireExactAttempt(attempt: InspectionAttemptSnapshot): void {
    if (attempt.inspectionId !== this.value.inspectionId || attempt.inspectionAttemptId !== this.value.openAttemptId || attempt.attemptNo !== this.value.openAttemptNo || attempt.inspectionChecklistVersionId !== this.value.inspectionChecklistVersionId || attempt.contractId !== this.value.contractId || attempt.contractMilestoneId !== this.value.contractMilestoneId || attempt.deliverableId !== this.value.deliverableId || attempt.deliverableVersionId !== this.value.deliverableVersionId) fail("INSPECTION_ATTEMPT_SUBJECT_MISMATCH", "Attempt must bind every exact Inspection subject and the open attempt number.");
  }
  private requireLatestAttempt(attempt: InspectionAttemptSnapshot): void {
    if (attempt.inspectionId !== this.value.inspectionId || attempt.inspectionAttemptId !== this.value.latestSealedAttemptId || attempt.attemptNo !== this.value.latestAttemptNo) fail("INSPECTION_ATTEMPT_NOT_LATEST", "Decision must bind the latest exact sealed attempt.");
  }
  private transition(command: InspectionCommand, state: InspectionState, eventType: string, immutableAttempt?: InspectionAttemptSnapshot): InspectionMutation {
    const expectedVersion = this.value.version;
    this.value = { ...this.value, state, version: nextVersion(expectedVersion), updatedAt: command.at };
    return Inspection.mutation(this.value, command, expectedVersion, eventType, immutableAttempt);
  }
  private static requireRequester(subject: Pick<InspectionSnapshot, "contractId" | "assignedVendorId">, actor: InspectionActorSnapshot): void {
    if (!actor.active) fail("INSPECTION_ACTOR_INACTIVE", "Inactive actors cannot request or submit correction.");
    if (actor.actorKind === "VENDOR") {
      if (!actor.userId || actor.vendorId !== subject.assignedVendorId || !actor.contractScopeId || actor.contractScopeContractId !== subject.contractId) fail("INSPECTION_VENDOR_SCOPE_REQUIRED", "The exact active Vendor ContractScope is required.");
      return;
    }
    if (actor.actorKind !== "INTERNAL" || !actor.userId) fail("INSPECTION_REQUESTER_INVALID", "An active internal user or exact scoped Vendor is required.");
  }
  private static mutation(snapshot: InspectionSnapshot, command: Omit<InspectionCommand, "expectedVersion">, expectedVersion: Version, eventType: string, immutableAttempt?: InspectionAttemptSnapshot): InspectionMutation {
    return {
      expectedVersion,
      snapshot: structuredClone(snapshot),
      ...(immutableAttempt ? { immutableAttempt: structuredClone(immutableAttempt) } : {}),
      event: { eventId: command.eventId, eventType: eventType as StableCode, machineId: INSPECTION_MACHINE_ID, aggregateId: snapshot.inspectionId, aggregateVersion: snapshot.version, occurredAt: command.at, correlationId: command.correlationId, idempotencyKey: command.idempotencyKey },
      audit: { actionId: eventType as StableCode, actor: structuredClone(command.actor), inspectionId: snapshot.inspectionId, occurredAt: command.at, correlationId: command.correlationId, ...(command.reason ? { reason: command.reason } : {}) }
    };
  }
}

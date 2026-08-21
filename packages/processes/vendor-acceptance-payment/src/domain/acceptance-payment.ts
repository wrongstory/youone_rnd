import type { ApprovalActorSnapshot } from "@youone/core-approval/public";
import type {
  CorrelationId,
  IdempotencyKey,
  Money,
  Sha256,
  StableCode,
  UtcInstant,
  Uuid,
  Version
} from "@youone/shared-kernel/public";
import { money, nextVersion } from "@youone/shared-kernel/public";

export const ACCEPTANCE_PAYMENT_MACHINE_ID = "SM-ACCEPTANCE-PAYMENT-V1" as const;
export const ACCEPTANCE_PAYMENT_EVENT_IDS = {
  CALCULATED: "EVT-ACCEPTANCE-PAYMENT-CALCULATE",
  ADJUSTMENT_PROPOSED: "EVT-ACCEPTANCE-PAYMENT-ADJUST",
  APPROVAL_SUBMITTED: "EVT-ACCEPTANCE-PAYMENT-SUBMIT",
  APPROVED: "EVT-ACCEPTANCE-PAYMENT-APPROVE",
  HELD_FOR_CONDITIONS: "EVT-ACCEPTANCE-PAYMENT-HOLD",
  CONDITION_SATISFIED: "EVT-ACCEPTANCE-PAYMENT-CONDITION-SATISFY",
  ELIGIBLE_FOR_EXTERNAL_PAYMENT: "EVT-ACCEPTANCE-PAYMENT-ELIGIBLE",
  CANCELLED: "EVT-ACCEPTANCE-PAYMENT-CANCEL"
} as const;

export type AcceptancePaymentState =
  | "CALCULATED"
  | "ADJUSTMENT_PROPOSED"
  | "APPROVAL_PENDING"
  | "APPROVED"
  | "HELD_FOR_CONDITIONS"
  | "ELIGIBLE_FOR_EXTERNAL_PAYMENT"
  | "CANCELLED";

export type AcceptanceDisposition =
  | "ACCEPTED"
  | "CONDITIONAL_ACCEPTANCE"
  | "PARTIAL_ACCEPTANCE"
  | "REJECTED";

export type Percentage = string;

export interface AcceptanceRateRule {
  readonly ruleId: StableCode;
  readonly minimumAchievementInclusive: Percentage;
  readonly maximumAchievementExclusive?: Percentage;
  readonly disposition: AcceptanceDisposition;
  readonly proposedRate:
    | { readonly kind: "ZERO" }
    | { readonly kind: "ACHIEVEMENT_PERCENT" }
    | { readonly kind: "FIXED"; readonly value: Percentage };
}

/**
 * Thresholds are immutable policy data. This process intentionally contains no
 * built-in 60/90/100 or amount-band values and never labels a preset statutory.
 */
export interface AcceptancePaymentPolicyVersionSnapshot {
  readonly policyVersionId: Uuid;
  readonly policyId: StableCode;
  readonly version: number;
  readonly checksum: Sha256;
  readonly state: "PUBLISHED";
  readonly effectiveFrom: UtcInstant;
  readonly effectiveTo?: UtcInstant;
  readonly basis: {
    readonly kind: "INTERNAL_PRESET" | "CONTRACT_OVERRIDE" | "GOVERNMENT_AGREEMENT" | "MANDATORY_LAW";
    readonly referenceId: StableCode;
    readonly version: number;
  };
  readonly rateRules: readonly AcceptanceRateRule[];
}

export interface SealedInspectionAttemptBasis {
  readonly inspectionAttemptId: Uuid;
  readonly inspectionId: Uuid;
  readonly attemptNo: number;
  readonly checksum: Sha256;
  readonly sealedAt: UtcInstant;
  readonly inspectionChecklistVersionId: Uuid;
  readonly contractId: Uuid;
  readonly contractMilestoneId: Uuid;
  readonly deliverableId: Uuid;
  readonly deliverableVersionId: Uuid;
  readonly disposition: AcceptanceDisposition;
  readonly achievementPercent: Percentage;
  readonly evidenceIds: readonly Uuid[];
  readonly criticalFailureCriterionIds: readonly Uuid[];
  readonly independentlyUsablePortions: readonly {
    readonly portionCode: StableCode;
    readonly description: string;
    readonly deliverableVersionId: Uuid;
    readonly evidenceIds: readonly Uuid[];
  }[];
  readonly residualConditions: readonly {
    readonly conditionCode: StableCode;
    readonly description: string;
    readonly dueAt?: UtcInstant;
    readonly evidenceIds: readonly Uuid[];
  }[];
}

export interface PaymentRateAdjustmentSnapshot {
  readonly adjustmentId: Uuid;
  readonly requestedRate: Percentage;
  readonly reason: string;
  readonly evidenceIds: readonly Uuid[];
  readonly actor: ApprovalActorSnapshot;
  readonly proposedAt: UtcInstant;
  readonly direction: "UPWARD" | "DOWNWARD" | "UNCHANGED";
}

export interface AcceptancePaymentApprovalSnapshot {
  readonly approvalInstanceId: Uuid;
  readonly approvalVersion: Version;
  readonly subjectDecisionId: Uuid;
  readonly subjectVersion: Version;
  readonly subjectChecksum: Sha256;
  readonly outcome: "APPROVED";
  readonly finalApprovedRate: Percentage;
  readonly approvedAt: UtcInstant;
}

export interface ResidualPaymentConditionSnapshot {
  readonly residualConditionId: Uuid;
  readonly sourceConditionCode: StableCode;
  readonly description: string;
  readonly dueDate: string;
  readonly evidenceIds: readonly Uuid[];
  readonly state: "OPEN" | "SATISFIED";
  readonly satisfiedAt?: UtcInstant;
  readonly satisfiedByUserId?: Uuid;
  readonly satisfactionEvidenceIds?: readonly Uuid[];
}

export interface PartialUsablePortionSnapshot {
  readonly usablePortionId: Uuid;
  readonly sourcePortionCode: StableCode;
  readonly sourceDeliverableVersionId: Uuid;
  readonly description: string;
  readonly evidenceIds: readonly Uuid[];
  readonly releaseEligible: boolean;
}

export interface AcceptanceResponsibilityInvariant {
  readonly acceptanceWaivesVendorResponsibility: false;
  readonly paymentEligibilityWaivesVendorResponsibility: false;
  readonly warrantyAndLatentDefectResponsibilitySurvives: true;
  readonly professionalResponsibilitySurvives: true;
  readonly externalTransferExecuted: false;
}

export const ACCEPTANCE_RESPONSIBILITY_INVARIANT: AcceptanceResponsibilityInvariant = Object.freeze({
  acceptanceWaivesVendorResponsibility: false,
  paymentEligibilityWaivesVendorResponsibility: false,
  warrantyAndLatentDefectResponsibilitySurvives: true,
  professionalResponsibilitySurvives: true,
  externalTransferExecuted: false
});

export interface AcceptancePaymentDecisionSnapshot {
  readonly acceptancePaymentDecisionId: Uuid;
  readonly decisionRootId: Uuid;
  readonly revisionNo: number;
  readonly previousDecisionId?: Uuid;
  readonly basis: SealedInspectionAttemptBasis;
  readonly policy: AcceptancePaymentPolicyVersionSnapshot;
  readonly milestoneAmount: Money;
  readonly achievementPercent: Percentage;
  readonly calculatedProposedRate: Percentage;
  readonly adjustedRequestedRate?: Percentage;
  readonly finalApprovedRate?: Percentage;
  readonly adjustment?: PaymentRateAdjustmentSnapshot;
  readonly approvalInstanceId?: Uuid;
  readonly approvalSubjectVersion?: Version;
  readonly sealedSnapshotChecksum?: Sha256;
  readonly sealedAt?: UtcInstant;
  readonly approvalSnapshot?: AcceptancePaymentApprovalSnapshot;
  readonly residualConditions: readonly ResidualPaymentConditionSnapshot[];
  readonly independentlyUsablePortions: readonly PartialUsablePortionSnapshot[];
  readonly heldAmount?: Money;
  readonly unpaidRemainder?: Money;
  readonly state: AcceptancePaymentState;
  readonly responsibility: AcceptanceResponsibilityInvariant;
  readonly version: Version;
  readonly createdAt: UtcInstant;
  readonly updatedAt: UtcInstant;
  readonly cancellationReason?: string;
  readonly approvalTerminalOutcome?: "REJECTED" | "RECALLED" | "CANCELLED";
}

export interface AcceptancePaymentActorCommand {
  readonly actor: ApprovalActorSnapshot;
  readonly at: UtcInstant;
  readonly expectedVersion: Version;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
  readonly eventId: Uuid;
}

export interface AcceptancePaymentSystemCommand extends Omit<AcceptancePaymentActorCommand, "actor"> {
  readonly actor: ApprovalActorSnapshot & { readonly actorType: "SYSTEM"; readonly accountKind: "SYSTEM" };
}

export interface AcceptancePaymentEvent {
  readonly eventId: Uuid;
  readonly eventType: StableCode;
  readonly machineId: typeof ACCEPTANCE_PAYMENT_MACHINE_ID;
  readonly aggregateId: Uuid;
  readonly aggregateVersion: Version;
  readonly occurredAt: UtcInstant;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
}

export interface AcceptancePaymentMutation {
  readonly expectedVersion: Version;
  readonly snapshot: AcceptancePaymentDecisionSnapshot;
  readonly event: AcceptancePaymentEvent;
  readonly audit: {
    readonly actionId: StableCode;
    readonly actor: ApprovalActorSnapshot;
    readonly aggregateId: Uuid;
    readonly occurredAt: UtcInstant;
    readonly correlationId: CorrelationId;
    readonly reason?: string;
    readonly evidenceIds: readonly Uuid[];
  };
}

export class AcceptancePaymentError extends Error {
  public constructor(public readonly code: StableCode, message: string) {
    super(message);
    this.name = "AcceptancePaymentError";
  }
}

const fail = (code: string, message: string): never => {
  throw new AcceptancePaymentError(code as StableCode, message);
};
const clone = <T>(value: T): T => structuredClone(value);

function decimalMicros(value: string, code: string): bigint {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/.exec(value);
  if (!match) return fail(code, "A non-negative decimal with at most six places is required.");
  return BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}

function percentageMicros(value: Percentage, code: string): bigint {
  const parsed = decimalMicros(value, code);
  if (parsed > 100_000_000n) fail(code, "Percentage must be between 0 and 100 inclusive.");
  return parsed;
}

function requireText(value: string, code: string): void {
  if (!value.trim()) fail(code, "A non-empty value is required.");
}

function requireDirectInternal(actor: ApprovalActorSnapshot): Uuid {
  if (
    actor.actorType !== "USER" ||
    actor.accountKind !== "INTERNAL" ||
    !actor.authenticatedUserId ||
    actor.authenticatedUserId !== actor.effectiveUserId ||
    actor.actingAuthority
  ) return fail("ACCEPTANCE_PAYMENT_DIRECT_INTERNAL_REQUIRED", "A direct trusted internal actor is required.");
  return actor.authenticatedUserId;
}

function requireSystem(actor: ApprovalActorSnapshot): void {
  if (actor.actorType !== "SYSTEM" || actor.accountKind !== "SYSTEM") {
    fail("ACCEPTANCE_PAYMENT_SYSTEM_ACTOR_REQUIRED", "A trusted system actor is required.");
  }
}

function validatePolicy(policy: AcceptancePaymentPolicyVersionSnapshot, at: UtcInstant): void {
  if (
    policy.state !== "PUBLISHED" ||
    !Number.isSafeInteger(policy.version) || policy.version < 1 ||
    !Number.isSafeInteger(policy.basis.version) || policy.basis.version < 1 ||
    policy.rateRules.length === 0 ||
    at < policy.effectiveFrom ||
    (policy.effectiveTo !== undefined && at >= policy.effectiveTo)
  ) fail("ACCEPTANCE_PAYMENT_POLICY_INVALID", "An effective published versioned policy is required.");
  for (const rule of policy.rateRules) {
    const min = percentageMicros(rule.minimumAchievementInclusive, "ACCEPTANCE_PAYMENT_POLICY_RATE_INVALID");
    const max = rule.maximumAchievementExclusive === undefined
      ? 100_000_001n
      : percentageMicros(rule.maximumAchievementExclusive, "ACCEPTANCE_PAYMENT_POLICY_RATE_INVALID");
    if (max <= min) fail("ACCEPTANCE_PAYMENT_POLICY_BAND_INVALID", "Policy rate bands must have an increasing range.");
    if (rule.proposedRate.kind === "FIXED") percentageMicros(rule.proposedRate.value, "ACCEPTANCE_PAYMENT_POLICY_RATE_INVALID");
  }
}

function calculateRate(
  policy: AcceptancePaymentPolicyVersionSnapshot,
  achievementPercent: Percentage,
  disposition: AcceptanceDisposition
): Percentage {
  const achievement = percentageMicros(achievementPercent, "ACCEPTANCE_PAYMENT_ACHIEVEMENT_INVALID");
  const matches = policy.rateRules.filter((rule) => {
    const min = percentageMicros(rule.minimumAchievementInclusive, "ACCEPTANCE_PAYMENT_POLICY_RATE_INVALID");
    const max = rule.maximumAchievementExclusive === undefined
      ? 100_000_001n
      : percentageMicros(rule.maximumAchievementExclusive, "ACCEPTANCE_PAYMENT_POLICY_RATE_INVALID");
    return achievement >= min && achievement < max && rule.disposition === disposition;
  });
  if (matches.length !== 1) fail("ACCEPTANCE_PAYMENT_POLICY_RULE_AMBIGUOUS", "Exactly one policy rule must match the sealed achievement and disposition.");
  const proposed = matches[0]!.proposedRate;
  return proposed.kind === "ZERO" ? "0" : proposed.kind === "ACHIEVEMENT_PERCENT" ? achievementPercent : proposed.value;
}

function validateMoneyWithin(value: Money, total: Money, code: string): void {
  if (value.currency !== total.currency || decimalMicros(value.amount, code) > decimalMicros(total.amount, code)) {
    fail(code, "Amount must use the milestone currency and cannot exceed the milestone amount.");
  }
}

function sameUuidSet(left: readonly Uuid[], right: readonly Uuid[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export class AcceptancePaymentDecision {
  private constructor(private value: AcceptancePaymentDecisionSnapshot) {}

  public static calculate(
    input: Omit<AcceptancePaymentDecisionSnapshot,
      | "achievementPercent"
      | "calculatedProposedRate"
      | "adjustedRequestedRate"
      | "finalApprovedRate"
      | "adjustment"
      | "approvalInstanceId"
      | "approvalSubjectVersion"
      | "sealedSnapshotChecksum"
      | "sealedAt"
      | "approvalSnapshot"
      | "residualConditions"
      | "independentlyUsablePortions"
      | "heldAmount"
      | "unpaidRemainder"
      | "state"
      | "responsibility"
      | "version"
      | "createdAt"
      | "updatedAt"
      | "cancellationReason"
      | "approvalTerminalOutcome"
    >,
    command: Omit<AcceptancePaymentSystemCommand, "expectedVersion">
  ): AcceptancePaymentMutation {
    requireSystem(command.actor);
    if (!Number.isSafeInteger(input.revisionNo) || input.revisionNo < 1) fail("ACCEPTANCE_PAYMENT_REVISION_INVALID", "revisionNo must be a positive integer.");
    if ((input.revisionNo === 1) !== (input.previousDecisionId === undefined)) fail("ACCEPTANCE_PAYMENT_LINEAGE_INVALID", "Only a first revision may omit a predecessor.");
    if (input.basis.attemptNo < 1 || !Number.isSafeInteger(input.basis.attemptNo)) fail("ACCEPTANCE_PAYMENT_ATTEMPT_INVALID", "A positive sealed attempt number is required.");
    if (input.basis.contractId === undefined || input.basis.contractMilestoneId === undefined) fail("ACCEPTANCE_PAYMENT_CONTRACT_BASIS_REQUIRED", "An exact Contract and milestone are required.");
    percentageMicros(input.basis.achievementPercent, "ACCEPTANCE_PAYMENT_ACHIEVEMENT_INVALID");
    decimalMicros(input.milestoneAmount.amount, "ACCEPTANCE_PAYMENT_MILESTONE_AMOUNT_INVALID");
    validatePolicy(input.policy, command.at);
    const calculatedProposedRate = calculateRate(input.policy, input.basis.achievementPercent, input.basis.disposition);
    const snapshot: AcceptancePaymentDecisionSnapshot = {
      ...clone(input),
      achievementPercent: input.basis.achievementPercent,
      calculatedProposedRate,
      residualConditions: [],
      independentlyUsablePortions: [],
      state: "CALCULATED",
      responsibility: ACCEPTANCE_RESPONSIBILITY_INVARIANT,
      version: 1 as Version,
      createdAt: command.at,
      updatedAt: command.at
    };
    return AcceptancePaymentDecision.mutation(snapshot, command, 0 as Version, ACCEPTANCE_PAYMENT_EVENT_IDS.CALCULATED);
  }

  public static restore(snapshot: AcceptancePaymentDecisionSnapshot): AcceptancePaymentDecision {
    AcceptancePaymentDecision.validateRestored(snapshot);
    return new AcceptancePaymentDecision(clone(snapshot));
  }

  public snapshot(): AcceptancePaymentDecisionSnapshot { return clone(this.value); }

  public proposeAdjustment(
    command: AcceptancePaymentActorCommand,
    input: { readonly adjustmentId: Uuid; readonly requestedRate: Percentage; readonly reason: string; readonly evidenceIds: readonly Uuid[] }
  ): AcceptancePaymentMutation {
    this.guard(command, "CALCULATED");
    requireDirectInternal(command.actor);
    requireText(input.reason, "ACCEPTANCE_PAYMENT_ADJUSTMENT_REASON_REQUIRED");
    if (input.evidenceIds.length === 0) fail("ACCEPTANCE_PAYMENT_ADJUSTMENT_EVIDENCE_REQUIRED", "An adjustment requires evidence.");
    const requested = percentageMicros(input.requestedRate, "ACCEPTANCE_PAYMENT_ADJUSTMENT_RATE_INVALID");
    const calculated = percentageMicros(this.value.calculatedProposedRate, "ACCEPTANCE_PAYMENT_CALCULATED_RATE_INVALID");
    const direction = requested > calculated ? "UPWARD" : requested < calculated ? "DOWNWARD" : "UNCHANGED";
    const expectedVersion = this.value.version;
    this.value = {
      ...this.value,
      adjustedRequestedRate: input.requestedRate,
      adjustment: {
        adjustmentId: input.adjustmentId,
        requestedRate: input.requestedRate,
        reason: input.reason,
        evidenceIds: clone(input.evidenceIds),
        actor: clone(command.actor),
        proposedAt: command.at,
        direction
      },
      state: "ADJUSTMENT_PROPOSED",
      version: nextVersion(this.value.version),
      updatedAt: command.at
    };
    return AcceptancePaymentDecision.mutation(this.value, command, expectedVersion, ACCEPTANCE_PAYMENT_EVENT_IDS.ADJUSTMENT_PROPOSED, input.reason, input.evidenceIds);
  }

  public submitForApproval(
    command: AcceptancePaymentActorCommand,
    input: { readonly approvalInstanceId: Uuid; readonly checksum: Sha256 }
  ): AcceptancePaymentMutation {
    this.guard(command, "CALCULATED", "ADJUSTMENT_PROPOSED");
    requireDirectInternal(command.actor);
    const expectedVersion = this.value.version;
    const approvalSubjectVersion = nextVersion(this.value.version);
    this.value = {
      ...this.value,
      approvalInstanceId: input.approvalInstanceId,
      approvalSubjectVersion,
      sealedSnapshotChecksum: input.checksum,
      sealedAt: command.at,
      state: "APPROVAL_PENDING",
      version: approvalSubjectVersion,
      updatedAt: command.at
    };
    return AcceptancePaymentDecision.mutation(this.value, command, expectedVersion, ACCEPTANCE_PAYMENT_EVENT_IDS.APPROVAL_SUBMITTED);
  }

  public applyApprovedOutcome(
    command: AcceptancePaymentSystemCommand,
    approval: AcceptancePaymentApprovalSnapshot
  ): AcceptancePaymentMutation {
    this.guard(command, "APPROVAL_PENDING");
    requireSystem(command.actor);
    const checksum = this.value.sealedSnapshotChecksum ?? fail("ACCEPTANCE_PAYMENT_EXACT_SUBJECT_REQUIRED", "A sealed approval subject is required.");
    const subjectVersion = this.value.approvalSubjectVersion ?? fail("ACCEPTANCE_PAYMENT_EXACT_SUBJECT_REQUIRED", "A sealed approval subject version is required.");
    if (
      approval.approvalInstanceId !== this.value.approvalInstanceId ||
      approval.subjectDecisionId !== this.value.acceptancePaymentDecisionId ||
      approval.subjectVersion !== subjectVersion ||
      approval.subjectChecksum !== checksum ||
      approval.outcome !== "APPROVED"
    ) fail("ACCEPTANCE_PAYMENT_APPROVAL_SUBJECT_MISMATCH", "Approval must bind the exact sealed payment decision.");
    percentageMicros(approval.finalApprovedRate, "ACCEPTANCE_PAYMENT_FINAL_RATE_INVALID");
    const exactRequestedRate = this.value.adjustedRequestedRate ?? this.value.calculatedProposedRate;
    if (approval.finalApprovedRate !== exactRequestedRate) {
      fail("ACCEPTANCE_PAYMENT_APPROVED_RATE_MISMATCH", "Final approval cannot create an unrequested rate; a different rate requires a new evidence-backed adjustment decision.");
    }
    const expectedVersion = this.value.version;
    this.value = {
      ...this.value,
      finalApprovedRate: approval.finalApprovedRate,
      approvalSnapshot: clone(approval),
      state: "APPROVED",
      version: nextVersion(this.value.version),
      updatedAt: command.at
    };
    return AcceptancePaymentDecision.mutation(this.value, command, expectedVersion, ACCEPTANCE_PAYMENT_EVENT_IDS.APPROVED);
  }

  public applyNegativeApprovalOutcome(
    command: AcceptancePaymentSystemCommand,
    input: { readonly outcome: "REJECTED" | "RECALLED" | "CANCELLED"; readonly reason: string }
  ): AcceptancePaymentMutation {
    this.guard(command, "APPROVAL_PENDING");
    requireSystem(command.actor);
    requireText(input.reason, "ACCEPTANCE_PAYMENT_CANCELLATION_REASON_REQUIRED");
    const expectedVersion = this.value.version;
    this.value = {
      ...this.value,
      state: "CANCELLED",
      approvalTerminalOutcome: input.outcome,
      cancellationReason: input.reason,
      version: nextVersion(this.value.version),
      updatedAt: command.at
    };
    return AcceptancePaymentDecision.mutation(this.value, command, expectedVersion, ACCEPTANCE_PAYMENT_EVENT_IDS.CANCELLED, input.reason);
  }

  public holdForConditions(
    command: AcceptancePaymentSystemCommand,
    input: {
      readonly residualConditions: readonly ResidualPaymentConditionSnapshot[];
      readonly independentlyUsablePortions: readonly PartialUsablePortionSnapshot[];
      readonly heldAmount: Money;
      readonly unpaidRemainder: Money;
    }
  ): AcceptancePaymentMutation {
    this.guard(command, "APPROVED");
    requireSystem(command.actor);
    if (!this.value.approvalSnapshot || this.value.finalApprovedRate === undefined) fail("ACCEPTANCE_PAYMENT_OFFICIAL_APPROVAL_REQUIRED", "An official Approval snapshot is required before a hold decision.");
    if (this.value.basis.disposition === "CONDITIONAL_ACCEPTANCE") {
      if (input.residualConditions.length === 0) fail("ACCEPTANCE_PAYMENT_RESIDUAL_CONDITION_REQUIRED", "Conditional acceptance requires residual conditions.");
      if (input.residualConditions.length !== this.value.basis.residualConditions.length || input.residualConditions.some((condition) => {
        const source = this.value.basis.residualConditions.find((item) => item.conditionCode === condition.sourceConditionCode);
        return !source || source.description !== condition.description || (source.dueAt !== undefined && source.dueAt !== condition.dueDate) || !sameUuidSet(source.evidenceIds, condition.evidenceIds);
      })) fail("ACCEPTANCE_PAYMENT_RESIDUAL_BASIS_MISMATCH", "Residual conditions must exactly preserve the sealed attempt condition, description, due time and evidence.");
    } else if (this.value.basis.disposition === "PARTIAL_ACCEPTANCE") {
      if (input.independentlyUsablePortions.length === 0) fail("ACCEPTANCE_PAYMENT_USABLE_PORTION_REQUIRED", "Partial acceptance requires independently usable portions.");
      if (input.independentlyUsablePortions.length !== this.value.basis.independentlyUsablePortions.length || input.independentlyUsablePortions.some((portion) => {
        const source = this.value.basis.independentlyUsablePortions.find((item) => item.portionCode === portion.sourcePortionCode);
        return !source || source.description !== portion.description || source.deliverableVersionId !== portion.sourceDeliverableVersionId || !sameUuidSet(source.evidenceIds, portion.evidenceIds);
      })) fail("ACCEPTANCE_PAYMENT_PORTION_BASIS_MISMATCH", "Usable portions must exactly preserve the sealed attempt portion, DeliverableVersion and evidence.");
    } else {
      fail("ACCEPTANCE_PAYMENT_HOLD_DISPOSITION_INVALID", "Only conditional or partial acceptance may enter a residual-obligation hold.");
    }
    for (const condition of input.residualConditions) {
      requireText(condition.description, "ACCEPTANCE_PAYMENT_RESIDUAL_DESCRIPTION_REQUIRED");
      requireText(condition.dueDate, "ACCEPTANCE_PAYMENT_RESIDUAL_DUE_DATE_REQUIRED");
    }
    for (const portion of input.independentlyUsablePortions) requireText(portion.description, "ACCEPTANCE_PAYMENT_PORTION_DESCRIPTION_REQUIRED");
    validateMoneyWithin(input.heldAmount, this.value.milestoneAmount, "ACCEPTANCE_PAYMENT_HELD_AMOUNT_INVALID");
    validateMoneyWithin(input.unpaidRemainder, this.value.milestoneAmount, "ACCEPTANCE_PAYMENT_UNPAID_REMAINDER_INVALID");
    if (input.heldAmount.currency !== input.unpaidRemainder.currency || decimalMicros(input.heldAmount.amount, "ACCEPTANCE_PAYMENT_HELD_AMOUNT_INVALID") !== decimalMicros(input.unpaidRemainder.amount, "ACCEPTANCE_PAYMENT_UNPAID_REMAINDER_INVALID")) {
      fail("ACCEPTANCE_PAYMENT_HOLD_REMAINDER_MISMATCH", "The held amount and unpaid remainder must preserve the same exact monetary basis.");
    }
    const expectedVersion = this.value.version;
    this.value = {
      ...this.value,
      residualConditions: clone(input.residualConditions),
      independentlyUsablePortions: clone(input.independentlyUsablePortions),
      heldAmount: money(input.heldAmount.amount, input.heldAmount.currency),
      unpaidRemainder: money(input.unpaidRemainder.amount, input.unpaidRemainder.currency),
      state: "HELD_FOR_CONDITIONS",
      version: nextVersion(this.value.version),
      updatedAt: command.at
    };
    return AcceptancePaymentDecision.mutation(this.value, command, expectedVersion, ACCEPTANCE_PAYMENT_EVENT_IDS.HELD_FOR_CONDITIONS);
  }

  public satisfyResidualCondition(
    command: AcceptancePaymentActorCommand,
    input: { readonly residualConditionId: Uuid; readonly evidenceIds: readonly Uuid[] }
  ): AcceptancePaymentMutation {
    this.guard(command, "HELD_FOR_CONDITIONS");
    const actorUserId = requireDirectInternal(command.actor);
    if (input.evidenceIds.length === 0) fail("ACCEPTANCE_PAYMENT_CONDITION_EVIDENCE_REQUIRED", "Condition satisfaction requires evidence.");
    const condition = this.value.residualConditions.find((item) => item.residualConditionId === input.residualConditionId);
    if (!condition) throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_RESIDUAL_CONDITION_NOT_FOUND" as StableCode, "The exact residual condition was not found.");
    if (condition.state !== "OPEN") fail("ACCEPTANCE_PAYMENT_CONDITION_ALREADY_SATISFIED", "A satisfied condition cannot be overwritten.");
    const expectedVersion = this.value.version;
    this.value = {
      ...this.value,
      residualConditions: this.value.residualConditions.map((item) => item.residualConditionId === input.residualConditionId
        ? { ...item, state: "SATISFIED" as const, satisfiedAt: command.at, satisfiedByUserId: actorUserId, satisfactionEvidenceIds: clone(input.evidenceIds) }
        : clone(item)),
      version: nextVersion(this.value.version),
      updatedAt: command.at
    };
    return AcceptancePaymentDecision.mutation(this.value, command, expectedVersion, ACCEPTANCE_PAYMENT_EVENT_IDS.CONDITION_SATISFIED, undefined, input.evidenceIds);
  }

  public markEligibleForExternalPayment(command: AcceptancePaymentActorCommand): AcceptancePaymentMutation {
    this.guard(command, "APPROVED", "HELD_FOR_CONDITIONS");
    requireDirectInternal(command.actor);
    if (!this.value.approvalSnapshot || this.value.finalApprovedRate === undefined) fail("ACCEPTANCE_PAYMENT_OFFICIAL_APPROVAL_REQUIRED", "Eligibility requires an official Approval snapshot.");
    if (this.value.basis.disposition === "REJECTED") fail("ACCEPTANCE_PAYMENT_REJECTED_NOT_ELIGIBLE", "A rejected attempt cannot become payment eligible.");
    if (this.value.state === "HELD_FOR_CONDITIONS") {
      if (this.value.residualConditions.some((condition) => condition.state !== "SATISFIED")) fail("ACCEPTANCE_PAYMENT_RESIDUAL_CONDITIONS_OPEN", "All residual conditions must be satisfied before release.");
      if (this.value.basis.disposition === "PARTIAL_ACCEPTANCE" && this.value.independentlyUsablePortions.some((portion) => !portion.releaseEligible)) fail("ACCEPTANCE_PAYMENT_PORTION_NOT_RELEASED", "Every included partial portion must be independently usable before release.");
    }
    const expectedVersion = this.value.version;
    this.value = {
      ...this.value,
      state: "ELIGIBLE_FOR_EXTERNAL_PAYMENT",
      version: nextVersion(this.value.version),
      updatedAt: command.at
    };
    return AcceptancePaymentDecision.mutation(this.value, command, expectedVersion, ACCEPTANCE_PAYMENT_EVENT_IDS.ELIGIBLE_FOR_EXTERNAL_PAYMENT);
  }

  public cancelBeforeApproval(command: AcceptancePaymentActorCommand, reason: string): AcceptancePaymentMutation {
    this.guard(command, "CALCULATED", "ADJUSTMENT_PROPOSED");
    requireDirectInternal(command.actor);
    requireText(reason, "ACCEPTANCE_PAYMENT_CANCELLATION_REASON_REQUIRED");
    const expectedVersion = this.value.version;
    this.value = { ...this.value, state: "CANCELLED", cancellationReason: reason, version: nextVersion(this.value.version), updatedAt: command.at };
    return AcceptancePaymentDecision.mutation(this.value, command, expectedVersion, ACCEPTANCE_PAYMENT_EVENT_IDS.CANCELLED, reason);
  }

  private guard(command: Pick<AcceptancePaymentActorCommand, "expectedVersion">, ...states: readonly AcceptancePaymentState[]): void {
    if (command.expectedVersion !== this.value.version) fail("ACCEPTANCE_PAYMENT_STALE_VERSION", "Optimistic version mismatch.");
    if (!states.includes(this.value.state)) fail("ACCEPTANCE_PAYMENT_STATE_INVALID", `Operation is not allowed from ${this.value.state}.`);
  }

  private static validateRestored(snapshot: AcceptancePaymentDecisionSnapshot): void {
    percentageMicros(snapshot.achievementPercent, "ACCEPTANCE_PAYMENT_ACHIEVEMENT_INVALID");
    percentageMicros(snapshot.calculatedProposedRate, "ACCEPTANCE_PAYMENT_CALCULATED_RATE_INVALID");
    if (snapshot.adjustedRequestedRate !== undefined) percentageMicros(snapshot.adjustedRequestedRate, "ACCEPTANCE_PAYMENT_ADJUSTMENT_RATE_INVALID");
    if (snapshot.finalApprovedRate !== undefined) percentageMicros(snapshot.finalApprovedRate, "ACCEPTANCE_PAYMENT_FINAL_RATE_INVALID");
    if (snapshot.achievementPercent !== snapshot.basis.achievementPercent) fail("ACCEPTANCE_PAYMENT_BASIS_REWRITTEN", "Achievement must remain identical to the sealed attempt basis.");
    if (snapshot.state === "APPROVAL_PENDING" && (!snapshot.approvalInstanceId || !snapshot.approvalSubjectVersion || !snapshot.sealedSnapshotChecksum || !snapshot.sealedAt)) fail("ACCEPTANCE_PAYMENT_EXACT_SUBJECT_REQUIRED", "Approval pending decisions require an exact sealed subject.");
    if (["APPROVED", "HELD_FOR_CONDITIONS", "ELIGIBLE_FOR_EXTERNAL_PAYMENT"].includes(snapshot.state) && (!snapshot.approvalSnapshot || snapshot.finalApprovedRate === undefined)) fail("ACCEPTANCE_PAYMENT_OFFICIAL_APPROVAL_REQUIRED", "Approved and release states require an official Approval snapshot.");
    if (snapshot.responsibility.acceptanceWaivesVendorResponsibility || snapshot.responsibility.paymentEligibilityWaivesVendorResponsibility || !snapshot.responsibility.warrantyAndLatentDefectResponsibilitySurvives || !snapshot.responsibility.professionalResponsibilitySurvives || snapshot.responsibility.externalTransferExecuted) fail("ACCEPTANCE_PAYMENT_NON_WAIVER_REQUIRED", "Acceptance and payment eligibility cannot waive Vendor responsibility or claim transfer execution.");
  }

  private static mutation(
    snapshot: AcceptancePaymentDecisionSnapshot,
    command: Omit<AcceptancePaymentActorCommand, "expectedVersion">,
    expectedVersion: Version,
    eventType: string,
    reason?: string,
    evidenceIds: readonly Uuid[] = []
  ): AcceptancePaymentMutation {
    return {
      expectedVersion,
      snapshot: clone(snapshot),
      event: {
        eventId: command.eventId,
        eventType: eventType as StableCode,
        machineId: ACCEPTANCE_PAYMENT_MACHINE_ID,
        aggregateId: snapshot.acceptancePaymentDecisionId,
        aggregateVersion: snapshot.version,
        occurredAt: command.at,
        correlationId: command.correlationId,
        idempotencyKey: command.idempotencyKey,
        payload: {
          acceptancePaymentDecisionId: snapshot.acceptancePaymentDecisionId,
          inspectionAttemptId: snapshot.basis.inspectionAttemptId,
          contractId: snapshot.basis.contractId,
          state: snapshot.state,
          disposition: snapshot.basis.disposition,
          achievementPercent: snapshot.achievementPercent,
          calculatedProposedRate: snapshot.calculatedProposedRate,
          hasAdjustment: snapshot.adjustment !== undefined,
          externalTransferExecuted: false
        }
      },
      audit: {
        actionId: eventType as StableCode,
        actor: clone(command.actor),
        aggregateId: snapshot.acceptancePaymentDecisionId,
        occurredAt: command.at,
        correlationId: command.correlationId,
        ...(reason ? { reason } : {}),
        evidenceIds: clone(evidenceIds)
      }
    };
  }
}

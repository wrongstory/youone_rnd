import type {
  ApprovalActorSnapshot,
  ApprovalOutcomeInput,
  ApprovalPolicySelectionInput,
  ApprovalPolicyVersion,
  ApprovalSubject,
  ApprovalSubjectSnapshot,
  ResolvedStep,
  TypedApprovalSubjectPort
} from "@youone/core-approval/public";
import { policyMatches } from "@youone/core-approval/public";
import type { Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";

export type AcceptancePaymentApprovalSubject = Extract<ApprovalSubject, { kind: "ACCEPTANCE_PAYMENT_DECISION" }>;

export type AcceptancePaymentApprovalState =
  | "APPROVAL_PENDING"
  | "APPROVED"
  | "REJECTED"
  | "RECALLED"
  | "CANCELLED";

export interface AcceptancePaymentApprovalRecord {
  readonly acceptancePaymentDecisionId: Uuid;
  readonly decisionRootId: Uuid;
  readonly revisionNo: number;
  readonly previousDecisionId?: Uuid;
  readonly approvalState: AcceptancePaymentApprovalState;
  readonly subjectVersion: Version;
  readonly sealedSnapshotChecksum: Sha256;
  readonly sealedAt: UtcInstant;
  readonly inspectionAttemptId: Uuid;
  readonly inspectionAttemptChecksum: Sha256;
  readonly achievementPercent: string;
  readonly calculatedProposedRate: string;
  readonly adjustedRequestedRate?: string;
  readonly finalApprovedRate?: string;
}

export interface AcceptancePaymentApprovalStore {
  loadExact(acceptancePaymentDecisionId: Uuid): Promise<AcceptancePaymentApprovalRecord | null>;
  /** Resolve through the current row's exact previous_decision_id FK, never MAX(revision_no). */
  loadPrevious(acceptancePaymentDecisionId: Uuid): Promise<AcceptancePaymentApprovalRecord | null>;
}

export interface AcceptancePaymentApprovalObligations {
  readonly exactInspectionAttemptBasisIsImmutable: true;
  readonly calculatedRateIsImmutable: true;
  readonly adjustmentIsAppendOnlyAndPreservedSeparately: true;
  readonly officialApprovalSnapshotRequired: true;
  readonly approvalCompletionDoesNotMarkPaymentEligible: true;
  readonly approvalCompletionDoesNotExecuteTransfer: true;
  readonly acceptanceAndPaymentDoNotWaiveVendorResponsibility: true;
}

export const ACCEPTANCE_PAYMENT_APPROVAL_OBLIGATIONS: AcceptancePaymentApprovalObligations = Object.freeze({
  exactInspectionAttemptBasisIsImmutable: true,
  calculatedRateIsImmutable: true,
  adjustmentIsAppendOnlyAndPreservedSeparately: true,
  officialApprovalSnapshotRequired: true,
  approvalCompletionDoesNotMarkPaymentEligible: true,
  approvalCompletionDoesNotExecuteTransfer: true,
  acceptanceAndPaymentDoNotWaiveVendorResponsibility: true
});

export type AcceptancePaymentApprovalDecision = "APPROVED" | "REJECTED" | "RECALLED" | "CANCELLED";

export interface VerifiedAcceptancePaymentApprovalOutcomePort {
  /**
   * Re-loads terminal Approval action, exact subject and sealed InspectionAttempt
   * in one transaction, then applies only the approval decision. Eligibility and
   * any external transfer remain separate commands.
   */
  applyVerifiedOutcome(input: ApprovalOutcomeInput & {
    readonly decision: AcceptancePaymentApprovalDecision;
    readonly exactDecision: AcceptancePaymentApprovalRecord;
    readonly obligations: AcceptancePaymentApprovalObligations;
  }): Promise<void>;
}

export class AcceptancePaymentApprovalError extends Error {
  public constructor(public readonly code: StableCode, message: string) {
    super(message);
    this.name = "AcceptancePaymentApprovalError";
  }
}

const fail = (code: string, message: string): never => {
  throw new AcceptancePaymentApprovalError(code as StableCode, message);
};

function sameActor(left: ApprovalActorSnapshot, right: ApprovalActorSnapshot): boolean {
  const leftAuthority = left.actingAuthority;
  const rightAuthority = right.actingAuthority;
  const sameAuthority = leftAuthority === undefined && rightAuthority === undefined || Boolean(
    leftAuthority && rightAuthority &&
    leftAuthority.assignmentId === rightAuthority.assignmentId &&
    leftAuthority.evidenceId === rightAuthority.evidenceId &&
    leftAuthority.grantorUserId === rightAuthority.grantorUserId &&
    leftAuthority.delegateUserId === rightAuthority.delegateUserId &&
    leftAuthority.representedPositionId === rightAuthority.representedPositionId &&
    leftAuthority.validFrom === rightAuthority.validFrom &&
    leftAuthority.validTo === rightAuthority.validTo &&
    leftAuthority.reason === rightAuthority.reason &&
    leftAuthority.allowedActionIds.length === rightAuthority.allowedActionIds.length &&
    leftAuthority.allowedActionIds.every((value, index) => value === rightAuthority.allowedActionIds[index])
  );
  return left.actorType === right.actorType &&
    left.accountKind === right.accountKind &&
    left.authenticatedUserId === right.authenticatedUserId &&
    left.effectiveUserId === right.effectiveUserId &&
    left.positionIds.length === right.positionIds.length &&
    left.positionIds.every((value, index) => value === right.positionIds[index]) &&
    left.roleIds.length === right.roleIds.length &&
    left.roleIds.every((value, index) => value === right.roleIds[index]) &&
    sameAuthority;
}

function assertTerminalProvenance(input: ApprovalOutcomeInput): void {
  const expectedActions: Readonly<Record<ApprovalOutcomeInput["outcome"], readonly string[]>> = {
    COMPLETED: ["APPROVE", "COMPLETE"],
    REJECTED: ["REJECT"],
    RECALLED: ["RECALL"],
    CANCELLED: ["CANCEL"]
  };
  const provenance = input.provenance;
  if (!expectedActions[input.outcome].includes(provenance.terminalAction.kind)) {
    fail("ACCEPTANCE_PAYMENT_APPROVAL_PROVENANCE_INVALID", "Terminal Approval action does not match the outcome.");
  }
  if (
    provenance.terminalAction.at !== provenance.occurredAt ||
    !sameActor(provenance.terminalAction.actor, provenance.actor) ||
    provenance.terminalAction.reasonCode !== provenance.terminalReasonCode ||
    provenance.actor.actingAuthority?.evidenceId !== provenance.actingAuthorityEvidenceId ||
    !String(provenance.correlationId).trim() ||
    !String(provenance.idempotencyKey).trim()
  ) fail("ACCEPTANCE_PAYMENT_APPROVAL_PROVENANCE_INVALID", "Terminal actor, reason, time and command provenance must remain exact.");
}

export class AcceptancePaymentDecisionApprovalSubjectAdapter
  implements TypedApprovalSubjectPort<AcceptancePaymentApprovalSubject> {
  public readonly kind = "ACCEPTANCE_PAYMENT_DECISION" as const;

  public constructor(
    private readonly store: AcceptancePaymentApprovalStore,
    private readonly outcomes: VerifiedAcceptancePaymentApprovalOutcomePort
  ) {}

  public async sealExactVersion(subject: AcceptancePaymentApprovalSubject): Promise<ApprovalSubjectSnapshot> {
    const decision = await this.requireExact(subject.acceptancePaymentDecisionId);
    if (
      decision.approvalState !== "APPROVAL_PENDING" ||
      decision.subjectVersion < 1 ||
      !decision.sealedSnapshotChecksum ||
      !decision.sealedAt
    ) fail("ACCEPTANCE_PAYMENT_EXACT_SEALED_DECISION_REQUIRED", "Only an exact sealed pending decision may be submitted.");
    return {
      subject,
      subjectVersion: decision.subjectVersion,
      checksum: decision.sealedSnapshotChecksum,
      sealedAt: decision.sealedAt
    };
  }

  public async assertExactVersion(snapshot: ApprovalSubjectSnapshot): Promise<void> {
    const subject = snapshot.subject;
    if (subject.kind !== "ACCEPTANCE_PAYMENT_DECISION") throw new AcceptancePaymentApprovalError("ACCEPTANCE_PAYMENT_APPROVAL_SUBJECT_KIND_INVALID" as StableCode, "Approval subject kind mismatch.");
    const decision = await this.requireExact(subject.acceptancePaymentDecisionId);
    if (
      decision.subjectVersion !== snapshot.subjectVersion ||
      decision.sealedSnapshotChecksum !== snapshot.checksum ||
      decision.sealedAt !== snapshot.sealedAt
    ) fail("ACCEPTANCE_PAYMENT_APPROVAL_SUBJECT_MISMATCH", "Approval does not bind the exact immutable decision checksum and sealed time.");
  }

  public async assertResubmissionLineage(input: { readonly previous: ApprovalSubjectSnapshot; readonly current: ApprovalSubjectSnapshot }): Promise<void> {
    await this.assertExactVersion(input.previous);
    await this.assertExactVersion(input.current);
    const previousSubject = input.previous.subject;
    const currentSubject = input.current.subject;
    if (previousSubject.kind !== "ACCEPTANCE_PAYMENT_DECISION" || currentSubject.kind !== "ACCEPTANCE_PAYMENT_DECISION") throw new AcceptancePaymentApprovalError("ACCEPTANCE_PAYMENT_RESUBMISSION_LINEAGE_INVALID" as StableCode, "Both subjects must be payment decisions.");
    const previous = await this.requireExact(previousSubject.acceptancePaymentDecisionId);
    const current = await this.requireExact(currentSubject.acceptancePaymentDecisionId);
    const storedPrevious = await this.store.loadPrevious(current.acceptancePaymentDecisionId);
    if (
      !["REJECTED", "RECALLED"].includes(previous.approvalState) ||
      current.approvalState !== "APPROVAL_PENDING" ||
      previous.decisionRootId !== current.decisionRootId ||
      current.previousDecisionId !== previous.acceptancePaymentDecisionId ||
      storedPrevious?.acceptancePaymentDecisionId !== previous.acceptancePaymentDecisionId ||
      current.revisionNo <= previous.revisionNo ||
      current.subjectVersion <= previous.subjectVersion
    ) fail("ACCEPTANCE_PAYMENT_RESUBMISSION_LINEAGE_INVALID", "Resubmission must be the direct strictly newer decision version of the same root after rejection or recall.");
  }

  public async applyApprovalOutcome(input: ApprovalOutcomeInput): Promise<void> {
    await this.assertExactVersion(input.snapshot);
    assertTerminalProvenance(input);
    const subject = input.snapshot.subject;
    if (subject.kind !== "ACCEPTANCE_PAYMENT_DECISION") throw new AcceptancePaymentApprovalError("ACCEPTANCE_PAYMENT_APPROVAL_SUBJECT_KIND_INVALID" as StableCode, "Approval subject kind mismatch.");
    const exactDecision = await this.requireExact(subject.acceptancePaymentDecisionId);
    await this.outcomes.applyVerifiedOutcome({
      ...input,
      decision: input.outcome === "COMPLETED" ? "APPROVED" : input.outcome,
      exactDecision,
      obligations: ACCEPTANCE_PAYMENT_APPROVAL_OBLIGATIONS
    });
  }

  private async requireExact(id: Uuid): Promise<AcceptancePaymentApprovalRecord> {
    const result = await this.store.loadExact(id);
    if (result === null) throw new AcceptancePaymentApprovalError("ACCEPTANCE_PAYMENT_DECISION_NOT_FOUND" as StableCode, "AcceptancePaymentDecision was not found.");
    return result;
  }
}

export interface AcceptancePaymentApprovalPolicyEntry {
  readonly policy: ApprovalPolicyVersion;
  readonly line: readonly ResolvedStep[];
  readonly representativeMode: "NONE" | "ANY_ONE" | "ALL";
  readonly coversUpwardAdjustment: boolean;
  readonly selectionPriority: number;
  readonly basis: {
    readonly kind: "INTERNAL_PRESET" | "CONTRACT_OVERRIDE" | "GOVERNMENT_AGREEMENT" | "MANDATORY_LAW";
    readonly referenceId: StableCode;
    readonly version: number;
  };
}

export interface AcceptancePaymentApprovalPolicyRequest {
  readonly at: UtcInstant;
  readonly submitter: ApprovalActorSnapshot;
  readonly selection: ApprovalPolicySelectionInput;
  readonly upwardAdjustment: boolean;
}

function exactPositionRule(
  rule: ApprovalPolicyVersion["steps"][number] | undefined,
  sequenceNo: number,
  positionId: "POSITION_LAB_DIRECTOR" | "POSITION_REPRESENTATIVE",
  completionMode: "SEQUENTIAL" | "ANY_ONE" | "ALL"
): boolean {
  return Boolean(rule &&
    rule.sequenceNo === sequenceNo &&
    rule.role === "APPROVAL" &&
    rule.required &&
    (rule.completionMode ?? (positionId === "POSITION_REPRESENTATIVE" ? "ANY_ONE" : "SEQUENTIAL")) === completionMode &&
    rule.allowedPositionIds.length === 1 &&
    rule.allowedPositionIds[0] === positionId &&
    rule.allowedRoleIds.length === 0 &&
    rule.specificUserId === undefined);
}

function exactResolvedStep(
  step: ResolvedStep | undefined,
  ruleId: Uuid | undefined,
  sequenceNo: number,
  positionId: "POSITION_LAB_DIRECTOR" | "POSITION_REPRESENTATIVE",
  completionMode: "SEQUENTIAL" | "ANY_ONE" | "ALL"
): boolean {
  return Boolean(step && ruleId &&
    step.ruleId === ruleId &&
    step.sequenceNo === sequenceNo &&
    step.role === "APPROVAL" &&
    step.required &&
    step.completionMode === completionMode &&
    step.participants.length >= 1 &&
    step.participants.every((participant) => participant.positionId === positionId));
}

export function validateAcceptancePaymentApprovalPolicy(entry: AcceptancePaymentApprovalPolicyEntry): void {
  const { policy, line, representativeMode } = entry;
  const hasRepresentative = representativeMode !== "NONE";
  const expectedCount = hasRepresentative ? 2 : 1;
  if (
    policy.selection.subjectKinds.length !== 1 ||
    policy.selection.subjectKinds[0] !== "ACCEPTANCE_PAYMENT_DECISION" ||
    policy.steps.length !== expectedCount ||
    line.length !== expectedCount ||
    !exactPositionRule(policy.steps[0], 1, "POSITION_LAB_DIRECTOR", "SEQUENTIAL") ||
    !exactResolvedStep(line[0], policy.steps[0]?.ruleId, 1, "POSITION_LAB_DIRECTOR", "SEQUENTIAL") ||
    (hasRepresentative && !exactPositionRule(policy.steps[1], 2, "POSITION_REPRESENTATIVE", representativeMode)) ||
    (hasRepresentative && !exactResolvedStep(line[1], policy.steps[1]?.ruleId, 2, "POSITION_REPRESENTATIVE", representativeMode))
  ) fail("ACCEPTANCE_PAYMENT_APPROVAL_POLICY_INVALID", "The versioned policy requires Lab Director approval and only its configured Representative amount-band step; Senior approval is forbidden.");
  if (hasRepresentative && policy.selection.amountBand === undefined && policy.selection.strengthenedRisk !== "REQUIRED") {
    fail("ACCEPTANCE_PAYMENT_REPRESENTATIVE_SELECTOR_REQUIRED", "A Representative step requires an explicit amount-band or strengthened-risk selector in policy data.");
  }
  if (!Number.isSafeInteger(entry.selectionPriority) || entry.selectionPriority < 0 || !Number.isSafeInteger(entry.basis.version) || entry.basis.version < 1) {
    fail("ACCEPTANCE_PAYMENT_APPROVAL_POLICY_METADATA_INVALID", "Policy priority and basis version are invalid.");
  }
}

function assertDirectContractOwner(actor: ApprovalActorSnapshot): void {
  if (
    actor.actorType !== "USER" ||
    actor.accountKind !== "INTERNAL" ||
    !actor.authenticatedUserId ||
    actor.authenticatedUserId !== actor.effectiveUserId ||
    actor.actingAuthority ||
    !actor.roleIds.includes("ROLE_CONTRACT_MANAGER" as StableCode)
  ) fail("ACCEPTANCE_PAYMENT_CONTRACT_OWNER_REQUIRED", "A direct internal Contract Manager must submit the decision.");
}

/** Selects only from effective immutable policy data; no amount threshold is embedded here. */
export function selectAcceptancePaymentApprovalPolicy(
  entries: readonly AcceptancePaymentApprovalPolicyEntry[],
  request: AcceptancePaymentApprovalPolicyRequest
): AcceptancePaymentApprovalPolicyEntry {
  assertDirectContractOwner(request.submitter);
  const matches = entries.filter((entry) => {
    if (entry.policy.state !== "PUBLISHED" || request.at < entry.policy.effectiveFrom || (entry.policy.effectiveTo !== undefined && request.at >= entry.policy.effectiveTo)) return false;
    validateAcceptancePaymentApprovalPolicy(entry);
    if (request.upwardAdjustment && !entry.coversUpwardAdjustment) return false;
    return policyMatches(entry.policy, { ...request.selection, subjectKind: "ACCEPTANCE_PAYMENT_DECISION" });
  }).sort((left, right) => right.selectionPriority - left.selectionPriority);
  const selected = matches[0];
  if (selected === undefined) throw new AcceptancePaymentApprovalError("ACCEPTANCE_PAYMENT_APPROVAL_POLICY_NOT_FOUND" as StableCode, "No published decision policy matches the exact amount/risk data.");
  if (matches[1]?.selectionPriority === selected.selectionPriority) fail("ACCEPTANCE_PAYMENT_APPROVAL_POLICY_AMBIGUOUS", "Multiple decision policies match with the same priority.");
  return selected;
}

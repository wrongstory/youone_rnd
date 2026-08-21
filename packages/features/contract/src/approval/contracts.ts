import type {
  ApprovalActorSnapshot,
  ApprovalOutcomeInput,
  ApprovalOutcomeProvenance,
  ApprovalPolicySelectionInput,
  ApprovalPolicyVersion,
  ApprovalSubject,
  ApprovalSubjectSnapshot,
  ResolvedStep,
  TypedApprovalSubjectPort
} from "@youone/core-approval/public";
import { policyMatches } from "@youone/core-approval/public";
import type { Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";

export type ContractVersionApprovalSubject = Extract<ApprovalSubject, { kind: "CONTRACT_VERSION" }>;

export type ContractVersionApprovalState =
  | "APPROVAL_PENDING"
  | "APPROVED"
  | "REJECTED"
  | "RECALLED"
  | "CANCELLED"
  | "SIGNED"
  | "SUPERSEDED_BY_AMENDMENT";

/**
 * Read model required by the Approval adapter. The sealed checksum and time are
 * content identity, not mutable workflow metadata.
 */
export interface ContractVersionApprovalRecord {
  readonly contractVersionId: Uuid;
  readonly contractId: Uuid;
  readonly versionNo: number;
  readonly previousContractVersionId?: Uuid;
  readonly approvalState: ContractVersionApprovalState;
  readonly sealedSnapshotChecksum: Sha256;
  readonly sealedAt: UtcInstant;
  readonly signedAt?: UtcInstant;
  readonly signatureEvidenceIds: readonly Uuid[];
  readonly supersededByContractVersionId?: Uuid;
}

export interface ContractVersionApprovalStore {
  loadExact(contractVersionId: Uuid): Promise<ContractVersionApprovalRecord | null>;
  /** Must resolve the predecessor from the current row's exact FK, not by MAX(version_no). */
  loadPrevious(contractVersionId: Uuid): Promise<ContractVersionApprovalRecord | null>;
}

export type ContractApprovalDecision = "APPROVED" | "REJECTED" | "RECALLED" | "CANCELLED";

/**
 * These obligations prevent Approval completion from silently signing,
 * activating, or rewriting a contract. The outcome adapter must enforce them
 * in the same transaction that updates the exact ContractVersion.
 */
export interface ContractApprovalImmutabilityObligations {
  readonly approvalCompletionDoesNotSign: true;
  readonly signatureEvidenceRequiredBeforeSigned: true;
  readonly signedVersionContentIsImmutable: true;
  readonly amendmentRequiresDirectNewerVersion: true;
  readonly amendmentPreservesSignedPredecessor: true;
  readonly activationRequiresSeparateContractCommand: true;
}

export const CONTRACT_APPROVAL_IMMUTABILITY_OBLIGATIONS: ContractApprovalImmutabilityObligations =
  Object.freeze({
    approvalCompletionDoesNotSign: true,
    signatureEvidenceRequiredBeforeSigned: true,
    signedVersionContentIsImmutable: true,
    amendmentRequiresDirectNewerVersion: true,
    amendmentPreservesSignedPredecessor: true,
    activationRequiresSeparateContractCommand: true
  });

function sameIds(left: readonly Uuid[], right: readonly Uuid[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSealedIdentity(
  previous: ContractVersionApprovalRecord,
  current: ContractVersionApprovalRecord
): boolean {
  return previous.contractVersionId === current.contractVersionId &&
    previous.contractId === current.contractId &&
    previous.versionNo === current.versionNo &&
    previous.previousContractVersionId === current.previousContractVersionId &&
    previous.sealedSnapshotChecksum === current.sealedSnapshotChecksum &&
    previous.sealedAt === current.sealedAt;
}

/**
 * Guard for the infrastructure outcome implementation. A signed version may
 * only gain an exact signed successor link; its sealed identity and signature
 * evidence never change in place.
 */
export function assertContractSignedTransition(input: {
  readonly previous: ContractVersionApprovalRecord;
  readonly current: ContractVersionApprovalRecord;
  readonly amendment?: ContractVersionApprovalRecord;
}): void {
  const { previous, current, amendment } = input;
  if (!sameSealedIdentity(previous, current)) {
    fail("CONTRACT_SIGNED_VERSION_IMMUTABLE", "A post-approval transition cannot rewrite the sealed ContractVersion identity.");
  }
  if (previous.approvalState === "APPROVED" && current.approvalState === "SIGNED") {
    if (!current.signedAt || current.signatureEvidenceIds.length === 0 || current.supersededByContractVersionId) {
      fail("CONTRACT_SIGNATURE_EVIDENCE_REQUIRED", "Signing requires immutable signature evidence and cannot create an amendment link at the same time.");
    }
    return;
  }
  if (previous.approvalState === "SIGNED" && current.approvalState === "SUPERSEDED_BY_AMENDMENT") {
    if (
      previous.signedAt !== current.signedAt ||
      !sameIds(previous.signatureEvidenceIds, current.signatureEvidenceIds) ||
      !current.supersededByContractVersionId ||
      current.supersededByContractVersionId !== amendment?.contractVersionId ||
      amendment.contractId !== previous.contractId ||
      amendment.previousContractVersionId !== previous.contractVersionId ||
      amendment.versionNo <= previous.versionNo ||
      amendment.approvalState !== "SIGNED" ||
      !amendment.signedAt ||
      amendment.signatureEvidenceIds.length === 0
    ) {
      fail("CONTRACT_AMENDMENT_LINEAGE_INVALID", "An amendment must be a direct strictly newer signed version while preserving its signed predecessor.");
    }
    return;
  }
  fail("CONTRACT_POST_APPROVAL_TRANSITION_INVALID", "Only APPROVED to SIGNED or SIGNED to a direct signed amendment transition is valid here.");
}

export interface VerifiedContractApprovalOutcomePort {
  /**
   * Re-loads the Approval terminal action and exact ContractVersion in one DB
   * transaction, then applies only the requested approval decision.
   */
  applyVerifiedOutcome(
    input: ApprovalOutcomeInput & {
      readonly decision: ContractApprovalDecision;
      readonly exactVersion: ContractVersionApprovalRecord;
      readonly obligations: ContractApprovalImmutabilityObligations;
    }
  ): Promise<void>;
}

export class ContractApprovalContractError extends Error {
  public constructor(public readonly code: StableCode, message: string) {
    super(message);
    this.name = "ContractApprovalContractError";
  }
}

const fail = (code: string, message: string): never => {
  throw new ContractApprovalContractError(code as StableCode, message);
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
    fail("CONTRACT_APPROVAL_OUTCOME_PROVENANCE_INVALID", "Terminal Approval action does not match the ContractVersion outcome.");
  }
  if (
    provenance.terminalAction.at !== provenance.occurredAt ||
    !sameActor(provenance.terminalAction.actor, provenance.actor) ||
    provenance.terminalAction.reasonCode !== provenance.terminalReasonCode ||
    !String(provenance.correlationId).trim() ||
    !String(provenance.idempotencyKey).trim()
  ) {
    fail("CONTRACT_APPROVAL_OUTCOME_PROVENANCE_INVALID", "Terminal actor, reason, time, correlation, and idempotency provenance must remain exact.");
  }
  const authorityEvidence = provenance.actor.actingAuthority?.evidenceId;
  if (authorityEvidence !== provenance.actingAuthorityEvidenceId) {
    fail("CONTRACT_APPROVAL_OUTCOME_PROVENANCE_INVALID", "Acting-authority evidence differs from the terminal actor snapshot.");
  }
}

export class ContractVersionApprovalSubjectAdapter
  implements TypedApprovalSubjectPort<ContractVersionApprovalSubject>
{
  public readonly kind = "CONTRACT_VERSION" as const;

  public constructor(
    private readonly store: ContractVersionApprovalStore,
    private readonly outcomes: VerifiedContractApprovalOutcomePort
  ) {}

  public async sealExactVersion(subject: ContractVersionApprovalSubject): Promise<ApprovalSubjectSnapshot> {
    const version = await this.requireExact(subject.contractVersionId);
    if (
      version.approvalState !== "APPROVAL_PENDING" ||
      !Number.isSafeInteger(version.versionNo) ||
      version.versionNo < 1 ||
      !version.sealedSnapshotChecksum ||
      !version.sealedAt
    ) {
      fail("CONTRACT_EXACT_SEALED_VERSION_REQUIRED", "Only an exact sealed ContractVersion pending approval may be submitted.");
    }
    return {
      subject,
      subjectVersion: version.versionNo as Version,
      checksum: version.sealedSnapshotChecksum,
      sealedAt: version.sealedAt
    };
  }

  public async assertExactVersion(snapshot: ApprovalSubjectSnapshot): Promise<void> {
    const subject = snapshot.subject;
    if (subject.kind !== this.kind) {
      throw new ContractApprovalContractError("CONTRACT_APPROVAL_SUBJECT_KIND_INVALID" as StableCode, "Approval subject kind must be CONTRACT_VERSION.");
    }
    const version = await this.requireExact(subject.contractVersionId);
    if (
      version.versionNo !== snapshot.subjectVersion ||
      version.sealedSnapshotChecksum !== snapshot.checksum ||
      version.sealedAt !== snapshot.sealedAt
    ) {
      fail("CONTRACT_APPROVAL_SUBJECT_MISMATCH", "Approval does not reference the exact immutable ContractVersion checksum and sealed time.");
    }
  }

  public async assertResubmissionLineage(input: {
    readonly previous: ApprovalSubjectSnapshot;
    readonly current: ApprovalSubjectSnapshot;
  }): Promise<void> {
    await this.assertExactVersion(input.previous);
    await this.assertExactVersion(input.current);
    const previousSubject = input.previous.subject;
    const currentSubject = input.current.subject;
    if (previousSubject.kind !== this.kind || currentSubject.kind !== this.kind) {
      throw new ContractApprovalContractError("CONTRACT_RESUBMISSION_LINEAGE_INVALID" as StableCode, "Both approval subjects must be ContractVersion subjects.");
    }
    const previous = await this.requireExact(previousSubject.contractVersionId);
    const current = await this.requireExact(currentSubject.contractVersionId);
    const storedPrevious = await this.store.loadPrevious(current.contractVersionId);
    if (
      !["REJECTED", "RECALLED"].includes(previous.approvalState) ||
      current.approvalState !== "APPROVAL_PENDING" ||
      previous.contractId !== current.contractId ||
      current.previousContractVersionId !== previous.contractVersionId ||
      storedPrevious?.contractVersionId !== previous.contractVersionId ||
      current.versionNo <= previous.versionNo
    ) {
      fail("CONTRACT_RESUBMISSION_LINEAGE_INVALID", "Resubmission must be the direct strictly newer version of the same Contract root after rejection or recall.");
    }
  }

  public async applyApprovalOutcome(input: ApprovalOutcomeInput): Promise<void> {
    await this.assertExactVersion(input.snapshot);
    assertTerminalProvenance(input);
    const subject = input.snapshot.subject;
    if (subject.kind !== this.kind) {
      throw new ContractApprovalContractError("CONTRACT_APPROVAL_SUBJECT_KIND_INVALID" as StableCode, "Approval subject kind must be CONTRACT_VERSION.");
    }
    const exactVersion = await this.requireExact(subject.contractVersionId);
    const decision: ContractApprovalDecision = input.outcome === "COMPLETED"
      ? "APPROVED"
      : input.outcome;
    await this.outcomes.applyVerifiedOutcome({
      ...input,
      decision,
      exactVersion,
      obligations: CONTRACT_APPROVAL_IMMUTABILITY_OBLIGATIONS
    });
  }

  private async requireExact(contractVersionId: Uuid): Promise<ContractVersionApprovalRecord> {
    const version = await this.store.loadExact(contractVersionId);
    if (version === null) throw new ContractApprovalContractError("CONTRACT_VERSION_NOT_FOUND" as StableCode, "ContractVersion was not found.");
    return version;
  }
}

export const CONTRACT_MANAGER_ROLE_ID = "ROLE_CONTRACT_MANAGER" as const;

export interface ContractApprovalPolicyEntry {
  readonly policy: ApprovalPolicyVersion;
  readonly line: readonly ResolvedStep[];
  /** Tier and matching conditions are immutable policy data, not statutory constants in code. */
  readonly tier: "STANDARD" | "STRENGTHENED";
  readonly selectionPriority: number;
  readonly basis: {
    readonly kind: "INTERNAL_PRESET" | "CONTRACT_OVERRIDE" | "GOVERNMENT_AGREEMENT" | "MANDATORY_LAW";
    readonly referenceId: StableCode;
    readonly version: number;
  };
}

export interface ContractApprovalPolicyRequest {
  readonly at: UtcInstant;
  readonly submitter: ApprovalActorSnapshot;
  readonly selection: ApprovalPolicySelectionInput;
}

function assertDirectContractManager(submitter: ApprovalActorSnapshot): void {
  if (
    submitter.actorType !== "USER" ||
    submitter.accountKind !== "INTERNAL" ||
    !submitter.authenticatedUserId ||
    submitter.authenticatedUserId !== submitter.effectiveUserId ||
    submitter.actingAuthority ||
    !submitter.roleIds.includes(CONTRACT_MANAGER_ROLE_ID as StableCode)
  ) {
    fail("CONTRACT_MANAGER_SUBMITTER_REQUIRED", "A direct internal Contract Manager must submit the ContractVersion.");
  }
}

function exactPositionRule(
  rule: ApprovalPolicyVersion["steps"][number] | undefined,
  sequenceNo: number,
  positionId: string,
  completionMode: "SEQUENTIAL" | "ANY_ONE" | "ALL"
): boolean {
  return Boolean(
    rule &&
    rule.sequenceNo === sequenceNo &&
    rule.role === "APPROVAL" &&
    rule.required &&
    (rule.completionMode ?? (positionId === "POSITION_REPRESENTATIVE" ? "ANY_ONE" : "SEQUENTIAL")) === completionMode &&
    rule.allowedPositionIds.length === 1 &&
    rule.allowedPositionIds[0] === positionId &&
    rule.allowedRoleIds.length === 0 &&
    rule.specificUserId === undefined
  );
}

function exactResolvedStep(
  step: ResolvedStep | undefined,
  ruleId: Uuid | undefined,
  sequenceNo: number,
  positionId: string,
  completionMode: "SEQUENTIAL" | "ANY_ONE" | "ALL"
): boolean {
  return Boolean(
    step &&
    ruleId &&
    step.ruleId === ruleId &&
    step.sequenceNo === sequenceNo &&
    step.role === "APPROVAL" &&
    step.required &&
    step.completionMode === completionMode &&
    step.participants.length >= 1 &&
    step.participants.every((participant) => participant.positionId === positionId)
  );
}

export function validateContractApprovalPolicy(entry: ContractApprovalPolicyEntry): void {
  const { policy, line, tier } = entry;
  const representativeMode = tier === "STRENGTHENED" ? "ALL" : "ANY_ONE";
  if (
    policy.selection.subjectKinds.length !== 1 ||
    policy.selection.subjectKinds[0] !== "CONTRACT_VERSION" ||
    policy.steps.length !== 2 ||
    line.length !== 2 ||
    !exactPositionRule(policy.steps[0], 1, "POSITION_LAB_DIRECTOR", "SEQUENTIAL") ||
    !exactPositionRule(policy.steps[1], 2, "POSITION_REPRESENTATIVE", representativeMode) ||
    !exactResolvedStep(line[0], policy.steps[0]?.ruleId, 1, "POSITION_LAB_DIRECTOR", "SEQUENTIAL") ||
    !exactResolvedStep(line[1], policy.steps[1]?.ruleId, 2, "POSITION_REPRESENTATIVE", representativeMode)
  ) {
    fail("CONTRACT_APPROVAL_POLICY_INVALID", "Contract approval requires Contract Manager submission, then Lab Director and Representative approval using the policy-owned completion mode.");
  }
  if (
    tier === "STRENGTHENED" &&
    policy.selection.strengthenedRisk !== "REQUIRED" &&
    policy.selection.amountBand?.minInclusive === undefined
  ) {
    fail("CONTRACT_STRENGTHENED_POLICY_SELECTOR_REQUIRED", "Representative ALL requires an explicit strengthened-risk or amount-band selector in policy data.");
  }
  if (!Number.isSafeInteger(entry.selectionPriority) || entry.selectionPriority < 0 || !Number.isSafeInteger(entry.basis.version) || entry.basis.version < 1) {
    fail("CONTRACT_APPROVAL_POLICY_METADATA_INVALID", "Policy selection priority and basis version must be non-negative and positive integers respectively.");
  }
}

/**
 * Selects by immutable policy data. No amount threshold, legal value, or risk
 * classification is embedded in this function.
 */
export function selectContractApprovalPolicy(
  entries: readonly ContractApprovalPolicyEntry[],
  request: ContractApprovalPolicyRequest
): ContractApprovalPolicyEntry {
  assertDirectContractManager(request.submitter);
  const matches = entries.filter((entry) => {
    if (
      entry.policy.state !== "PUBLISHED" ||
      request.at < entry.policy.effectiveFrom ||
      (entry.policy.effectiveTo !== undefined && request.at >= entry.policy.effectiveTo)
    ) return false;
    validateContractApprovalPolicy(entry);
    return policyMatches(entry.policy, { ...request.selection, subjectKind: "CONTRACT_VERSION" });
  }).sort((left, right) => right.selectionPriority - left.selectionPriority);

  const selected = matches[0];
  if (selected === undefined) throw new ContractApprovalContractError("CONTRACT_APPROVAL_POLICY_NOT_FOUND" as StableCode, "No published ContractVersion policy matches the versioned selection data.");
  if (matches[1]?.selectionPriority === selected.selectionPriority) {
    fail("CONTRACT_APPROVAL_POLICY_AMBIGUOUS", "Multiple ContractVersion policies match with the same selection priority.");
  }
  return selected;
}

export type ContractApprovalTerminalProvenance = ApprovalOutcomeProvenance;

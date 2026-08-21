import type { CorrelationId, IdempotencyKey, Money, Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import { nextVersion } from "@youone/shared-kernel/public";

export const CONTRACT_MACHINE_ID = "SM-VENDOR-CONTRACT-V1" as const;
export const CONTRACT_EVENT_IDS = {
  CREATED: "EVT-CONTRACT-CREATE",
  REVIEW_REQUESTED: "EVT-CONTRACT-REQUEST-REVIEW",
  NEGOTIATION_BEGUN: "EVT-CONTRACT-BEGIN-NEGOTIATION",
  APPROVAL_SUBMITTED: "EVT-CONTRACT-SUBMIT-APPROVAL",
  APPROVED_SIGNED: "EVT-CONTRACT-APPROVED-SIGNED",
  ACTIVATED: "EVT-CONTRACT-ACTIVATE",
  CHANGE_REQUESTED: "EVT-CONTRACT-REQUEST-CHANGE",
  CHANGE_EFFECTIVE: "EVT-CONTRACT-CHANGE-EFFECTIVE",
  PERFORMANCE_COMPLETED: "EVT-CONTRACT-PERFORMANCE-COMPLETE",
  CLOSE_BEGUN: "EVT-CONTRACT-BEGIN-CLOSE",
  CLOSED: "EVT-CONTRACT-CLOSE",
  TERMINATION_REVIEWED: "EVT-CONTRACT-REVIEW-TERMINATION",
  TERMINATED: "EVT-CONTRACT-TERMINATE",
  CONTINUED: "EVT-CONTRACT-CONTINUE",
} as const;

export type VendorContractState = "DRAFT" | "INTERNAL_REVIEW" | "NEGOTIATION" | "APPROVAL_PENDING" | "SIGNED" | "ACTIVE" | "CHANGE_PENDING" | "PERFORMANCE_COMPLETE" | "CLOSING" | "CLOSED" | "TERMINATION_REVIEW" | "TERMINATED";
export type ContractAuthority = "CONTRACT_AUTHOR" | "CONTRACT_MANAGER" | "DIRECTOR" | "POLICY_APPROVER";
export type ContractVersionState = "DRAFT" | "SEALED" | "SIGNED" | "SUPERSEDED";
export type ContractVersionKind = "ORIGINAL" | "AMENDMENT";
export type ContractScopeObligation = "NONE" | "ISSUE" | "REFRESH" | "REVOKE";

export interface ContractActorSnapshot {
  readonly actorKind: "INTERNAL" | "VENDOR" | "SYSTEM";
  readonly userId?: Uuid;
  readonly vendorId?: Uuid;
  readonly contractScopeId?: Uuid;
  readonly contractScopeContractId?: Uuid;
  readonly active: boolean;
  readonly authorities: readonly ContractAuthority[];
}

export interface ContractProject {
  readonly contractProjectId: Uuid;
  readonly contractId: Uuid;
  readonly projectId: Uuid;
  readonly validFrom: string;
  readonly validTo?: string;
}

export interface ContractMilestoneSnapshot {
  readonly contractMilestoneId: Uuid;
  readonly contractVersionId: Uuid;
  readonly sequenceNo: number;
  readonly milestoneCode: StableCode;
  readonly title: string;
  readonly dueDate: string;
  readonly plannedAmount: Money;
  readonly plannedRatio: string;
}

export interface ContractApprovalSnapshot {
  readonly approvalInstanceId: Uuid;
  readonly subjectContractVersionId: Uuid;
  readonly subjectManifestHash: Sha256;
  readonly outcome: "APPROVED";
  readonly decidedAt: UtcInstant;
}

export interface ContractPolicyProvenance {
  readonly presetPolicyId: StableCode;
  readonly presetPolicyVersion: number;
  readonly legalBaselineId: StableCode;
  readonly legalBaselineVersion: number;
  readonly overrideApplied: boolean;
  readonly overrideReason?: string;
  readonly approvalSnapshot?: ContractApprovalSnapshot;
}

export interface ContractVersionSnapshot {
  readonly contractVersionId: Uuid;
  readonly contractId: Uuid;
  readonly versionNo: number;
  readonly versionKind: ContractVersionKind;
  readonly previousContractVersionId?: Uuid;
  readonly statementOfWorkDocumentVersionId: Uuid;
  readonly requirementsSnapshotId: Uuid;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly contractAmount: Money;
  readonly intellectualPropertyTermsCode: StableCode;
  readonly securityTermsCode: StableCode;
  readonly warrantyTermsCode: StableCode;
  readonly liabilityTermsCode: StableCode;
  readonly policyProvenance: ContractPolicyProvenance;
  readonly state: ContractVersionState;
  readonly manifestHash?: Sha256;
  readonly signatureEvidenceId?: Uuid;
  readonly createdAt: UtcInstant;
  readonly sealedAt?: UtcInstant;
  readonly signedAt?: UtcInstant;
}

export interface VendorContractSnapshot {
  readonly contractId: Uuid;
  readonly vendorId: Uuid;
  readonly contractNo: string;
  readonly title: string;
  readonly managerUserId: Uuid;
  readonly projectLinks: readonly ContractProject[];
  readonly currentSignedVersionId?: Uuid;
  readonly currentSignedVersionNo?: number;
  readonly pendingApprovalVersionId?: Uuid;
  readonly pendingApprovalManifestHash?: Sha256;
  readonly pendingChangeRequestId?: Uuid;
  readonly state: VendorContractState;
  readonly priorStateBeforeTerminationReview?: "ACTIVE" | "CHANGE_PENDING" | "PERFORMANCE_COMPLETE";
  readonly version: Version;
  readonly createdAt: UtcInstant;
  readonly updatedAt: UtcInstant;
}

export interface ContractCommand {
  readonly actor: ContractActorSnapshot;
  readonly at: UtcInstant;
  readonly expectedVersion: Version;
  readonly eventId: Uuid;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
  readonly reason?: string;
}

export interface ContractDomainEvent {
  readonly eventId: Uuid;
  readonly eventType: StableCode;
  readonly machineId: typeof CONTRACT_MACHINE_ID;
  readonly aggregateId: Uuid;
  readonly aggregateVersion: Version;
  readonly occurredAt: UtcInstant;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ContractMutation {
  readonly expectedVersion: Version;
  readonly snapshot: VendorContractSnapshot;
  readonly event: ContractDomainEvent;
  readonly audit: { readonly actionId: StableCode; readonly actor: ContractActorSnapshot; readonly contractId: Uuid; readonly occurredAt: UtcInstant; readonly correlationId: CorrelationId; readonly reason?: string };
  readonly scopeObligation: ContractScopeObligation;
}

export class ContractDomainError extends Error {
  public constructor(public readonly code: StableCode, message: string) { super(message); this.name = "ContractDomainError"; }
}
function fail(code: string, message: string): never { throw new ContractDomainError(code as StableCode, message); }
function clone<T>(value: T): T { return structuredClone(value); }
function requireText(value: string, code: string): void { if (value.trim().length === 0) fail(code, "A non-empty value is required."); }
function requirePositiveInteger(value: number, code: string): void { if (!Number.isSafeInteger(value) || value <= 0) fail(code, "A positive integer is required."); }
function hasAuthority(actor: ContractActorSnapshot, ...allowed: readonly ContractAuthority[]): boolean { return actor.actorKind === "INTERNAL" && actor.active && !!actor.userId && allowed.some((authority) => actor.authorities.includes(authority)); }
function requireAuthority(actor: ContractActorSnapshot, ...allowed: readonly ContractAuthority[]): void { if (!hasAuthority(actor, ...allowed)) fail("CONTRACT_INTERNAL_AUTHORITY_REQUIRED", "Required active internal authority is missing."); }

export class ContractVersion {
  private constructor(private readonly value: ContractVersionSnapshot) {}

  public static draft(input: Omit<ContractVersionSnapshot, "state" | "manifestHash" | "signatureEvidenceId" | "sealedAt" | "signedAt">): ContractVersion {
    requirePositiveInteger(input.versionNo, "CONTRACT_VERSION_NO_INVALID");
    if ((input.versionKind === "ORIGINAL" && input.versionNo !== 1) || (input.versionKind === "AMENDMENT" && input.versionNo <= 1)) fail("CONTRACT_VERSION_KIND_NUMBER_INVALID", "Original must be version 1 and amendments must be later versions.");
    if ((input.versionKind === "ORIGINAL" && input.previousContractVersionId) || (input.versionKind === "AMENDMENT" && !input.previousContractVersionId)) fail("CONTRACT_VERSION_PREDECESSOR_INVALID", "Only an amendment has, and every amendment requires, an exact predecessor.");
    if (input.effectiveTo && input.effectiveFrom > input.effectiveTo) fail("CONTRACT_VERSION_PERIOD_INVALID", "Contract version period is invalid.");
    if (input.policyProvenance.overrideApplied && !input.policyProvenance.overrideReason?.trim()) fail("CONTRACT_OVERRIDE_REASON_REQUIRED", "A policy override requires a reason.");
    if (!input.policyProvenance.overrideApplied && input.policyProvenance.overrideReason) fail("CONTRACT_OVERRIDE_REASON_UNEXPECTED", "An override reason is only valid for an override.");
    if (input.policyProvenance.approvalSnapshot) fail("CONTRACT_DRAFT_APPROVAL_SNAPSHOT_FORBIDDEN", "Draft content cannot claim an approval outcome.");
    return new ContractVersion(Object.freeze({ ...clone(input), state: "DRAFT" }));
  }

  public static restore(snapshot: ContractVersionSnapshot): ContractVersion { return new ContractVersion(Object.freeze(clone(snapshot))); }
  public snapshot(): ContractVersionSnapshot { return clone(this.value); }

  /** Sealing creates a new immutable value; the draft instance is never edited. */
  public seal(manifestHash: Sha256, sealedAt: UtcInstant): ContractVersionSnapshot {
    if (this.value.state !== "DRAFT") return fail("CONTRACT_VERSION_ALREADY_IMMUTABLE", "Only a draft may be sealed.");
    return Object.freeze({ ...clone(this.value), state: "SEALED", manifestHash, sealedAt });
  }

  /** Signature evidence and Approval must bind the exact sealed version and checksum. */
  public sign(approval: ContractApprovalSnapshot, signatureEvidenceId: Uuid, signedAt: UtcInstant): ContractVersionSnapshot {
    if (this.value.state !== "SEALED" || !this.value.manifestHash || !this.value.sealedAt) return fail("CONTRACT_VERSION_NOT_SEALED", "Only an exact sealed ContractVersion may be signed.");
    if (approval.subjectContractVersionId !== this.value.contractVersionId || approval.subjectManifestHash !== this.value.manifestHash || approval.outcome !== "APPROVED") fail("CONTRACT_APPROVAL_SUBJECT_MISMATCH", "Approval must bind the exact ContractVersion and manifest hash.");
    return Object.freeze({ ...clone(this.value), state: "SIGNED", signatureEvidenceId, signedAt, policyProvenance: Object.freeze({ ...clone(this.value.policyProvenance), approvalSnapshot: clone(approval) }) });
  }
}

export function validateContractMilestones(version: Pick<ContractVersionSnapshot, "contractVersionId" | "contractAmount">, milestones: readonly ContractMilestoneSnapshot[]): void {
  if (milestones.length === 0) fail("CONTRACT_MILESTONE_REQUIRED", "At least one normalized milestone is required.");
  const sequences = new Set<number>();
  let totalRatio = 0;
  let totalAmount = 0n;
  const decimalMicros = (value: string): bigint => {
    const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/.exec(value);
    if (!match) fail("CONTRACT_MILESTONE_AMOUNT_INVALID", "Amounts must be non-negative decimals with at most six places.");
    return BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
  };
  for (const milestone of milestones) {
    if (milestone.contractVersionId !== version.contractVersionId) fail("CONTRACT_MILESTONE_VERSION_MISMATCH", "Milestone must belong to the exact ContractVersion.");
    requirePositiveInteger(milestone.sequenceNo, "CONTRACT_MILESTONE_SEQUENCE_INVALID");
    if (sequences.has(milestone.sequenceNo)) fail("CONTRACT_MILESTONE_SEQUENCE_DUPLICATE", "Milestone sequence must be unique within a ContractVersion.");
    sequences.add(milestone.sequenceNo);
    const ratio = Number(milestone.plannedRatio);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) fail("CONTRACT_MILESTONE_RATIO_INVALID", "Milestone ratio must be between 0 and 100.");
    if (milestone.plannedAmount.currency !== version.contractAmount.currency) fail("CONTRACT_MILESTONE_CURRENCY_MISMATCH", "Milestone currency must match the ContractVersion.");
    totalAmount += decimalMicros(milestone.plannedAmount.amount);
    totalRatio += ratio;
  }
  if (Math.abs(totalRatio - 100) > 0.000001) fail("CONTRACT_MILESTONE_RATIO_TOTAL_INVALID", "Milestone ratios must total exactly 100.");
  if (totalAmount !== decimalMicros(version.contractAmount.amount)) fail("CONTRACT_MILESTONE_AMOUNT_TOTAL_INVALID", "Milestone amounts must total the ContractVersion amount.");
}

export class VendorContract {
  private constructor(private value: VendorContractSnapshot) {}

  public static create(input: Omit<VendorContractSnapshot, "state" | "version" | "createdAt" | "updatedAt" | "currentSignedVersionId" | "currentSignedVersionNo" | "pendingApprovalVersionId" | "pendingApprovalManifestHash" | "pendingChangeRequestId" | "priorStateBeforeTerminationReview">, command: Omit<ContractCommand, "expectedVersion"> & { readonly vendorExists: boolean }): ContractMutation {
    requireAuthority(command.actor, "CONTRACT_MANAGER");
    if (!command.vendorExists) fail("CONTRACT_VENDOR_NOT_FOUND", "Vendor must exist before Contract creation.");
    requireText(input.contractNo, "CONTRACT_NO_REQUIRED"); requireText(input.title, "CONTRACT_TITLE_REQUIRED");
    if (input.projectLinks.length === 0 || input.projectLinks.some((link) => link.contractId !== input.contractId)) fail("CONTRACT_PROJECT_LINK_REQUIRED", "At least one exact ContractProject link is required.");
    if (new Set(input.projectLinks.map((link) => link.projectId)).size !== input.projectLinks.length) fail("CONTRACT_PROJECT_LINK_DUPLICATE", "A Project may be linked only once per Contract.");
    if (input.projectLinks.some((link) => link.validTo && link.validFrom > link.validTo)) fail("CONTRACT_PROJECT_LINK_PERIOD_INVALID", "ContractProject validity is invalid.");
    const snapshot: VendorContractSnapshot = { ...clone(input), state: "DRAFT", version: 1 as Version, createdAt: command.at, updatedAt: command.at };
    return VendorContract.mutation(snapshot, command, 0 as Version, CONTRACT_EVENT_IDS.CREATED, "NONE");
  }

  public static restore(snapshot: VendorContractSnapshot): VendorContract { return new VendorContract(clone(snapshot)); }
  public snapshot(): VendorContractSnapshot { return clone(this.value); }

  public requestReview(command: ContractCommand & { readonly mandatoryDraftDocumentsSatisfied: boolean }): ContractMutation { this.guard(command, "DRAFT"); this.requireAuthorOrManager(command.actor); if (!command.mandatoryDraftDocumentsSatisfied) fail("CONTRACT_DRAFT_DOCUMENTS_REQUIRED", "Mandatory draft documents are missing."); return this.transition(command, "INTERNAL_REVIEW", CONTRACT_EVENT_IDS.REVIEW_REQUESTED); }
  public beginNegotiation(command: ContractCommand & { readonly reviewOutcomeRecorded: boolean }): ContractMutation { this.guard(command, "INTERNAL_REVIEW"); requireAuthority(command.actor, "DIRECTOR", "POLICY_APPROVER"); if (!command.reviewOutcomeRecorded) fail("CONTRACT_REVIEW_OUTCOME_REQUIRED", "Review outcome is required."); return this.transition(command, "NEGOTIATION", CONTRACT_EVENT_IDS.NEGOTIATION_BEGUN); }
  public submitApproval(command: ContractCommand, sealedVersion: ContractVersionSnapshot): ContractMutation { this.guard(command, "NEGOTIATION"); this.requireAuthorOrManager(command.actor); if (sealedVersion.contractId !== this.value.contractId || sealedVersion.state !== "SEALED" || !sealedVersion.manifestHash) fail("CONTRACT_EXACT_SEALED_VERSION_REQUIRED", "Approval submission requires the exact sealed ContractVersion."); this.value = { ...this.value, pendingApprovalVersionId: sealedVersion.contractVersionId, pendingApprovalManifestHash: sealedVersion.manifestHash }; return this.transition(command, "APPROVAL_PENDING", CONTRACT_EVENT_IDS.APPROVAL_SUBMITTED); }
  public recordApprovedSignature(command: ContractCommand, signedVersion: ContractVersionSnapshot): ContractMutation { this.guard(command, "APPROVAL_PENDING"); if (command.actor.actorKind !== "SYSTEM" || !command.actor.active) fail("CONTRACT_SYSTEM_COMPLETION_REQUIRED", "Approval/signature completion is system-applied."); this.requireSignedVersion(signedVersion); if (signedVersion.contractVersionId !== this.value.pendingApprovalVersionId || signedVersion.manifestHash !== this.value.pendingApprovalManifestHash) fail("CONTRACT_PENDING_APPROVAL_VERSION_MISMATCH", "The signed version must be the exact version submitted for approval."); this.value = { ...this.value, currentSignedVersionId: signedVersion.contractVersionId, currentSignedVersionNo: signedVersion.versionNo, pendingApprovalVersionId: undefined, pendingApprovalManifestHash: undefined }; return this.transition(command, "SIGNED", CONTRACT_EVENT_IDS.APPROVED_SIGNED); }
  public activate(command: ContractCommand & { readonly effectiveOn: string }, signedVersion: ContractVersionSnapshot): ContractMutation { this.guard(command, "SIGNED"); requireAuthority(command.actor, "CONTRACT_MANAGER"); this.requireSignedVersion(signedVersion); if (command.effectiveOn < signedVersion.effectiveFrom || (signedVersion.effectiveTo && command.effectiveOn > signedVersion.effectiveTo)) fail("CONTRACT_EFFECTIVE_DATE_INVALID", "Activation date must fall within the signed version period."); return this.transition(command, "ACTIVE", CONTRACT_EVENT_IDS.ACTIVATED, "ISSUE"); }
  public requestChange(command: ContractCommand & { readonly changeRequestId: Uuid }): ContractMutation { this.guard(command, "ACTIVE"); if (command.actor.actorKind === "VENDOR") { if (!command.actor.active || command.actor.vendorId !== this.value.vendorId || !command.actor.contractScopeId || command.actor.contractScopeContractId !== this.value.contractId) fail("CONTRACT_VENDOR_SCOPE_REQUIRED", "Only the exact active Vendor with exact ContractScope may request a change."); } else requireAuthority(command.actor, "CONTRACT_MANAGER", "DIRECTOR"); this.value = { ...this.value, pendingChangeRequestId: command.changeRequestId }; return this.transition(command, "CHANGE_PENDING", CONTRACT_EVENT_IDS.CHANGE_REQUESTED); }
  public makeChangeEffective(command: ContractCommand, signedAmendment: ContractVersionSnapshot): ContractMutation { this.guard(command, "CHANGE_PENDING"); requireAuthority(command.actor, "CONTRACT_MANAGER", "DIRECTOR"); this.requireSignedVersion(signedAmendment); if (!this.value.pendingChangeRequestId || !this.value.currentSignedVersionId || this.value.currentSignedVersionNo === undefined || signedAmendment.versionKind !== "AMENDMENT" || signedAmendment.previousContractVersionId !== this.value.currentSignedVersionId || signedAmendment.versionNo !== this.value.currentSignedVersionNo + 1) fail("CONTRACT_SIGNED_AMENDMENT_REQUIRED", "A direct next signed amendment linked to the current signed version and pending change is required."); this.value = { ...this.value, currentSignedVersionId: signedAmendment.contractVersionId, currentSignedVersionNo: signedAmendment.versionNo, pendingChangeRequestId: undefined }; return this.transition(command, "ACTIVE", CONTRACT_EVENT_IDS.CHANGE_EFFECTIVE, "REFRESH"); }
  public completePerformance(command: ContractCommand & { readonly deliverablesSatisfied: boolean; readonly inspectionChecksSatisfied: boolean }): ContractMutation { this.guard(command, "ACTIVE"); requireAuthority(command.actor, "DIRECTOR"); if (!command.deliverablesSatisfied || !command.inspectionChecksSatisfied) fail("CONTRACT_PERFORMANCE_CHECKS_REQUIRED", "Deliverable and inspection checks are required."); return this.transition(command, "PERFORMANCE_COMPLETE", CONTRACT_EVENT_IDS.PERFORMANCE_COMPLETED); }
  public beginClose(command: ContractCommand & { readonly handoverSatisfied: boolean; readonly paymentStatusRecorded: boolean; readonly guaranteeChecksSatisfied: boolean }): ContractMutation { this.guard(command, "PERFORMANCE_COMPLETE"); requireAuthority(command.actor, "CONTRACT_MANAGER"); if (!command.handoverSatisfied || !command.paymentStatusRecorded || !command.guaranteeChecksSatisfied) fail("CONTRACT_CLOSE_CHECKLIST_REQUIRED", "Handover, payment status and guarantee checks are required."); return this.transition(command, "CLOSING", CONTRACT_EVENT_IDS.CLOSE_BEGUN); }
  public close(command: ContractCommand): ContractMutation { this.guard(command, "CLOSING"); requireAuthority(command.actor, "DIRECTOR", "POLICY_APPROVER"); requireText(command.reason ?? "", "CONTRACT_CLOSE_REASON_REQUIRED"); return this.transition(command, "CLOSED", CONTRACT_EVENT_IDS.CLOSED, "REVOKE"); }
  public reviewTermination(command: ContractCommand & { readonly breachEvidenceId: Uuid }): ContractMutation { this.guard(command, "ACTIVE", "CHANGE_PENDING", "PERFORMANCE_COMPLETE"); requireAuthority(command.actor, "DIRECTOR"); requireText(command.reason ?? "", "CONTRACT_TERMINATION_REASON_REQUIRED"); const priorStateBeforeTerminationReview = this.value.state as "ACTIVE" | "CHANGE_PENDING" | "PERFORMANCE_COMPLETE"; this.value = { ...this.value, priorStateBeforeTerminationReview }; return this.transition(command, "TERMINATION_REVIEW", CONTRACT_EVENT_IDS.TERMINATION_REVIEWED); }
  public terminate(command: ContractCommand & { readonly legalRequirementsSatisfied: boolean; readonly approvalRequirementsSatisfied: boolean }): ContractMutation { this.guard(command, "TERMINATION_REVIEW"); requireAuthority(command.actor, "POLICY_APPROVER"); requireText(command.reason ?? "", "CONTRACT_TERMINATION_REASON_REQUIRED"); if (!command.legalRequirementsSatisfied || !command.approvalRequirementsSatisfied) fail("CONTRACT_TERMINATION_REQUIREMENTS_REQUIRED", "Legal and approval requirements must be satisfied."); return this.transition(command, "TERMINATED", CONTRACT_EVENT_IDS.TERMINATED, "REVOKE"); }
  public continueAfterReview(command: ContractCommand & { readonly remedyDecisionRecorded: boolean }): ContractMutation { this.guard(command, "TERMINATION_REVIEW"); requireAuthority(command.actor, "POLICY_APPROVER"); requireText(command.reason ?? "", "CONTRACT_CONTINUE_REASON_REQUIRED"); if (!command.remedyDecisionRecorded || !this.value.priorStateBeforeTerminationReview) fail("CONTRACT_REMEDY_DECISION_REQUIRED", "A remedy decision and prior active state are required."); const target = this.value.priorStateBeforeTerminationReview; this.value = { ...this.value, priorStateBeforeTerminationReview: undefined }; return this.transition(command, target, CONTRACT_EVENT_IDS.CONTINUED); }

  private guard(command: ContractCommand, ...states: readonly VendorContractState[]): void { if (command.expectedVersion !== this.value.version) fail("CONTRACT_STALE_VERSION", "Optimistic version mismatch."); if (!states.includes(this.value.state)) fail("CONTRACT_STATE_INVALID", `Operation is not allowed from ${this.value.state}.`); if (!command.actor.active) fail("CONTRACT_ACTOR_INACTIVE", "Inactive actors cannot change a Contract."); }
  private requireAuthorOrManager(actor: ContractActorSnapshot): void { if (actor.actorKind !== "INTERNAL" || !actor.userId || (actor.userId !== this.value.managerUserId && !actor.authorities.includes("CONTRACT_AUTHOR") && !actor.authorities.includes("CONTRACT_MANAGER"))) fail("CONTRACT_AUTHOR_OR_MANAGER_REQUIRED", "Contract author or manager is required."); }
  private requireSignedVersion(versionSnapshot: ContractVersionSnapshot): void { if (versionSnapshot.contractId !== this.value.contractId || versionSnapshot.state !== "SIGNED" || !versionSnapshot.manifestHash || !versionSnapshot.signatureEvidenceId || !versionSnapshot.policyProvenance.approvalSnapshot) fail("CONTRACT_EXACT_SIGNED_VERSION_REQUIRED", "An exact approved and signed ContractVersion is required."); }
  private transition(command: ContractCommand, state: VendorContractState, eventType: string, scopeObligation: ContractScopeObligation = "NONE"): ContractMutation { const expectedVersion = this.value.version; this.value = { ...this.value, state, version: nextVersion(this.value.version), updatedAt: command.at }; return VendorContract.mutation(this.value, command, expectedVersion, eventType, scopeObligation); }
  private static mutation(snapshot: VendorContractSnapshot, command: Omit<ContractCommand, "expectedVersion">, expectedVersion: Version, eventType: string, scopeObligation: ContractScopeObligation): ContractMutation { return { expectedVersion, snapshot: clone(snapshot), event: { eventId: command.eventId, eventType: eventType as StableCode, machineId: CONTRACT_MACHINE_ID, aggregateId: snapshot.contractId, aggregateVersion: snapshot.version, occurredAt: command.at, correlationId: command.correlationId, idempotencyKey: command.idempotencyKey, payload: { contractId: snapshot.contractId, vendorId: snapshot.vendorId, state: snapshot.state, scopeObligation } }, audit: { actionId: eventType as StableCode, actor: clone(command.actor), contractId: snapshot.contractId, occurredAt: command.at, correlationId: command.correlationId, ...(command.reason ? { reason: command.reason } : {}) }, scopeObligation }; }
}

export interface GuaranteeSnapshot {
  readonly guaranteeId: Uuid;
  readonly contractId: Uuid;
  readonly contractVersionId: Uuid;
  readonly guaranteeTypeCode: StableCode;
  readonly issuerName: string;
  readonly guaranteedAmount: Money;
  readonly validFrom: string;
  readonly validTo: string;
  readonly evidenceId: Uuid;
  readonly state: "ACTIVE" | "EXPIRED" | "RELEASED" | "CLAIMED";
}

export interface WarrantyIssueSnapshot {
  readonly warrantyIssueId: Uuid;
  readonly contractId: Uuid;
  readonly deliverableId?: Uuid;
  readonly guaranteeId?: Uuid;
  readonly issueCode: string;
  readonly summary: string;
  readonly discoveredAt: UtcInstant;
  readonly responsibilityState: "UNASSESSED" | "VENDOR_RESPONSIBLE" | "INTERNAL_RESPONSIBLE" | "DISPUTED";
  readonly state: "OPEN" | "INVESTIGATING" | "REMEDY_IN_PROGRESS" | "VERIFICATION" | "CLOSED";
  readonly acceptanceDoesNotWaiveResponsibility: true;
  readonly paymentDoesNotWaiveResponsibility: true;
}

export function createWarrantyIssue(input: Omit<WarrantyIssueSnapshot, "state" | "acceptanceDoesNotWaiveResponsibility" | "paymentDoesNotWaiveResponsibility">): WarrantyIssueSnapshot {
  requireText(input.issueCode, "WARRANTY_ISSUE_CODE_REQUIRED"); requireText(input.summary, "WARRANTY_ISSUE_SUMMARY_REQUIRED");
  return Object.freeze({ ...clone(input), state: "OPEN", acceptanceDoesNotWaiveResponsibility: true, paymentDoesNotWaiveResponsibility: true });
}

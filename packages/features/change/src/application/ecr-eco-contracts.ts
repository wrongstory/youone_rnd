import type { Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import {
  EngineeringChangeOrder,
  EngineeringChangeRequest,
  type ApprovedEcrOrigin,
  type ChangeAuditObligation,
  type ChangeActorSnapshot,
  type ChangeCommand,
  type ChangeDomainEvent,
  type ChangePriority,
  type EcoImplementationSnapshot,
  type EcoMutation,
  type EcoSealedVersionSnapshot,
  type EcoSnapshot,
  type EcoState,
  type EcoTarget,
  type EcoVerificationSnapshot,
  type EcrMutation,
  type EcrImpactAnalysisSnapshot,
  type EcrReviewSnapshot,
  type EcrSealedVersionSnapshot,
  type EcrSnapshot,
  type EcrState,
  type EmergencyChangeExceptionSnapshot,
  type ExecutedSignedChangeContractSnapshot,
  type OfficialChangeApprovalEvidence
} from "../domain/ecr-eco";
import {
  assertTrustedChangeApprovalOutcome,
  type CompletedChangeApprovalSnapshot,
  type TrustedChangeOrderApprovalOutcome,
  type TrustedChangeRequestApprovalOutcome,
  type VerifiedChangeOrderApprovalOutcomePort,
  type VerifiedChangeRequestApprovalOutcomePort
} from "../approval/contracts";

export const CHANGE_PERMISSION_IDS = Object.freeze({
  REQUEST_CREATE: "change.request.create",
  REQUEST_MANAGE: "change.request.manage",
  IMPACT_ANALYZE: "change.impact.analyze",
  REQUEST_REVIEW: "change.request.review",
  REQUEST_APPROVE: "change.request.approve",
  ORDER_MANAGE: "change.order.manage",
  ORDER_EMERGENCY_RELEASE: "change.order.emergency_release",
  ORDER_IMPLEMENT: "change.order.implement",
  ORDER_VERIFY: "change.order.verify"
} as const);

export interface EcrRepository {
  loadForUpdate(ecrId: Uuid): Promise<EcrSnapshot | null>;
  insert(snapshot: EcrSnapshot): Promise<void>;
  save(snapshot: EcrSnapshot, expectedVersion: Version): Promise<boolean>;
  appendImmutableImpactAnalysis(snapshot: EcrImpactAnalysisSnapshot): Promise<void>;
  appendImmutableSealedVersion(snapshot: EcrSealedVersionSnapshot): Promise<void>;
  appendImmutableReview(snapshot: EcrReviewSnapshot): Promise<void>;
  appendImmutableOfficialApproval(ecrId: Uuid, snapshot: OfficialChangeApprovalEvidence): Promise<void>;
}

export interface EcoRepository {
  loadForUpdate(ecoId: Uuid): Promise<EcoSnapshot | null>;
  insert(snapshot: EcoSnapshot): Promise<void>;
  save(snapshot: EcoSnapshot, expectedVersion: Version): Promise<boolean>;
  appendImmutableSealedVersion(snapshot: EcoSealedVersionSnapshot): Promise<void>;
  appendImmutableEmergencyException(snapshot: EmergencyChangeExceptionSnapshot): Promise<void>;
  appendImmutableImplementation(snapshot: EcoImplementationSnapshot): Promise<void>;
  appendImmutableVerification(snapshot: EcoVerificationSnapshot): Promise<void>;
  appendImmutableOfficialApproval(ecoId: Uuid, snapshot: OfficialChangeApprovalEvidence): Promise<void>;
  appendImmutableRetrospectiveApproval(ecoId: Uuid, snapshot: OfficialChangeApprovalEvidence): Promise<void>;
  appendImmutableSignedChangeContract(snapshot: ExecutedSignedChangeContractSnapshot): Promise<void>;
}

export interface NegativeChangeApprovalOutcomeSnapshot {
  readonly negativeOutcomeId: Uuid;
  readonly aggregateKind: "ECR" | "ECO";
  readonly aggregateId: Uuid;
  readonly subjectVersionId: Uuid;
  readonly subjectVersion: Version;
  readonly decision: "REJECTED" | "RECALLED" | "CANCELLED";
  readonly approvalInstanceId: Uuid;
  readonly approvalVersion: Version;
  readonly terminalActionId: Uuid;
  readonly reasonCode?: StableCode;
  readonly occurredAt: UtcInstant;
}
export interface NegativeChangeApprovalOutcomeRepository {
  append(snapshot: NegativeChangeApprovalOutcomeSnapshot): Promise<void>;
  loadLatestForUpdate(input: { readonly aggregateKind: "ECR" | "ECO"; readonly aggregateId: Uuid }): Promise<NegativeChangeApprovalOutcomeSnapshot | null>;
}

export interface NextChangeVersionInput {
  readonly aggregateKind: "ECR" | "ECO";
  readonly aggregateId: Uuid;
  readonly previousSubjectVersionId: Uuid;
  readonly nextSubjectVersionId: Uuid;
  readonly nextSubjectVersion: Version;
  readonly checksum: Sha256;
  readonly sealedAt: UtcInstant;
}
export interface ChangeRevisionPort { insertNextImmutableVersion(input: NextChangeVersionInput): Promise<void> }

/** Adapters must validate entity identity, immutable before revision, and distinct newly-created after revision. */
export interface EcoTargetValidationPort {
  assertExactProposedTargets(input: { readonly projectId: Uuid; readonly contractId?: Uuid; readonly targets: readonly EcoTarget[] }): Promise<void>;
  assertImplementationCreatedExactAfterRevision(input: EcoImplementationSnapshot): Promise<void>;
  assertExactAppliedScope(input: EcoVerificationSnapshot["appliedScope"]): Promise<void>;
}

/** Optional BOM integration point only. M10 does not create or write BOM storage. */
export interface BomChangeTargetExtension {
  readonly extensionId: Uuid;
  readonly ecoId: Uuid;
  readonly bomId: Uuid;
  readonly beforeBomVersionId: Uuid;
  readonly proposedAfterBomVersionId: Uuid;
}
export interface BomChangeTargetExtensionPort {
  assertExactBomTarget(input: BomChangeTargetExtension): Promise<void>;
  recordAppliedBomRevision(input: BomChangeTargetExtension & { readonly implementedAt: UtcInstant; readonly evidenceIds: readonly Uuid[] }): Promise<void>;
}

export interface EmergencyChangeAuthorityPort {
  /** Fail closed if the referenced policy or exact temporary authority assignment is absent, expired, revoked, or not applicable. */
  assertExactActiveException(input: EmergencyChangeExceptionSnapshot & { readonly projectId: Uuid; readonly contractId?: Uuid }): Promise<void>;
}

export interface ExecutedChangeContractValidationPort {
  assertExecutedSignedExactSnapshot(snapshot: ExecutedSignedChangeContractSnapshot): Promise<void>;
}

export interface ChangeLinkValidationPort {
  assertProjectAndContract(input: { readonly projectId: Uuid; readonly contractId?: Uuid; readonly assignedVendorId?: Uuid }): Promise<void>;
  assertExactNcrLinks(ncrIds: readonly Uuid[]): Promise<void>;
}

export interface ChangeEvidencePort {
  appendTransition(input: { readonly aggregateId: Uuid; readonly machineId: StableCode; readonly fromVersion: Version; readonly toVersion: Version; readonly eventType: StableCode; readonly occurredAt: UtcInstant }): Promise<void>;
  appendAudit(obligation: ChangeAuditObligation): Promise<void>;
  enqueue(event: ChangeDomainEvent): Promise<void>;
}

export interface ChangeTransactionContext {
  readonly ecrs: EcrRepository;
  readonly ecos: EcoRepository;
  readonly targets: EcoTargetValidationPort;
  readonly emergencyAuthority: EmergencyChangeAuthorityPort;
  readonly signedChangeContracts: ExecutedChangeContractValidationPort;
  readonly negativeOutcomes: NegativeChangeApprovalOutcomeRepository;
  readonly revisions: ChangeRevisionPort;
  readonly links: ChangeLinkValidationPort;
  readonly evidence: ChangeEvidencePort;
}
export interface ChangeUnitOfWork { transact<T>(work: (context: ChangeTransactionContext) => Promise<T>): Promise<T> }

export class ChangeApplicationError extends Error {
  public constructor(public readonly code: StableCode, message: string) { super(message); this.name = "ChangeApplicationError"; }
}
export class ChangeConcurrencyError extends ChangeApplicationError {
  public constructor(message: string) { super("CHANGE_STALE_VERSION" as StableCode, message); }
}

async function appendEvidence(context: ChangeTransactionContext, mutation: EcrMutation | EcoMutation): Promise<void> {
  if (mutation.snapshot.version !== mutation.expectedVersion + 1) throw new ChangeConcurrencyError("A change mutation must increment optimistic version exactly once.");
  await context.evidence.appendTransition({ aggregateId: mutation.event.aggregateId, machineId: mutation.event.machineId as StableCode, fromVersion: mutation.expectedVersion, toVersion: mutation.snapshot.version, eventType: mutation.event.eventType, occurredAt: mutation.event.occurredAt });
  await context.evidence.appendAudit(mutation.audit);
  await context.evidence.enqueue(mutation.event);
}

async function saveEcr(context: ChangeTransactionContext, mutation: EcrMutation): Promise<void> {
  if (mutation.expectedVersion === 0) {
    if (mutation.snapshot.version !== 1 || mutation.event.eventType !== "EVT-ECR-CREATE") throw new ChangeConcurrencyError("ECR creation must be version 0 to 1.");
    await context.links.assertProjectAndContract({ projectId: mutation.snapshot.projectId, ...(mutation.snapshot.contractId ? { contractId: mutation.snapshot.contractId } : {}), ...(mutation.snapshot.assignedVendorId ? { assignedVendorId: mutation.snapshot.assignedVendorId } : {}) });
    await context.links.assertExactNcrLinks(mutation.snapshot.linkedNcrIds);
    await context.ecrs.insert(mutation.snapshot);
  } else if (!await context.ecrs.save(mutation.snapshot, mutation.expectedVersion)) {
    throw new ChangeConcurrencyError("ECR optimistic lock lost.");
  }
  if (mutation.immutableReview) await context.ecrs.appendImmutableReview(mutation.immutableReview);
  if (mutation.immutableImpactAnalysis) await context.ecrs.appendImmutableImpactAnalysis(mutation.immutableImpactAnalysis);
  if (mutation.immutableSealedVersion) await context.ecrs.appendImmutableSealedVersion(mutation.immutableSealedVersion);
  if (mutation.immutableOfficialApproval) await context.ecrs.appendImmutableOfficialApproval(mutation.snapshot.ecrId, mutation.immutableOfficialApproval);
  await appendEvidence(context, mutation);
}

async function saveEco(context: ChangeTransactionContext, mutation: EcoMutation): Promise<void> {
  if (mutation.expectedVersion === 0) {
    if (mutation.snapshot.version !== 1 || mutation.event.eventType !== "EVT-ECO-CREATE") throw new ChangeConcurrencyError("ECO creation must be version 0 to 1.");
    await context.links.assertProjectAndContract({ projectId: mutation.snapshot.projectId, ...(mutation.snapshot.contractId ? { contractId: mutation.snapshot.contractId } : {}), ...(mutation.snapshot.assignedVendorId ? { assignedVendorId: mutation.snapshot.assignedVendorId } : {}) });
    await context.links.assertExactNcrLinks(mutation.snapshot.linkedNcrIds);
    await context.targets.assertExactProposedTargets({ projectId: mutation.snapshot.projectId, ...(mutation.snapshot.contractId ? { contractId: mutation.snapshot.contractId } : {}), targets: mutation.snapshot.targets });
    await context.ecos.insert(mutation.snapshot);
  } else if (!await context.ecos.save(mutation.snapshot, mutation.expectedVersion)) {
    throw new ChangeConcurrencyError("ECO optimistic lock lost.");
  }
  if (mutation.immutableEmergencyException) await context.ecos.appendImmutableEmergencyException(mutation.immutableEmergencyException);
  if (mutation.immutableSealedVersion) await context.ecos.appendImmutableSealedVersion(mutation.immutableSealedVersion);
  if (mutation.immutableImplementation) { await context.targets.assertImplementationCreatedExactAfterRevision(mutation.immutableImplementation); await context.ecos.appendImmutableImplementation(mutation.immutableImplementation); }
  if (mutation.immutableVerification) { await context.targets.assertExactAppliedScope(mutation.immutableVerification.appliedScope); await context.ecos.appendImmutableVerification(mutation.immutableVerification); }
  if (mutation.immutableOfficialApproval) await context.ecos.appendImmutableOfficialApproval(mutation.snapshot.ecoId, mutation.immutableOfficialApproval);
  if (mutation.immutableRetrospectiveApproval) await context.ecos.appendImmutableRetrospectiveApproval(mutation.snapshot.ecoId, mutation.immutableRetrospectiveApproval);
  if (mutation.immutableSignedChangeContract) { await context.signedChangeContracts.assertExecutedSignedExactSnapshot(mutation.immutableSignedChangeContract); await context.ecos.appendImmutableSignedChangeContract(mutation.immutableSignedChangeContract); }
  await appendEvidence(context, mutation);
}

export async function persistEcrMutation(unitOfWork: ChangeUnitOfWork, mutation: EcrMutation): Promise<void> {
  if (["EVT-ECR-APPROVE", "EVT-ECR-REJECT"].includes(mutation.event.eventType) || mutation.snapshot.state === "APPROVED" || mutation.snapshot.state === "REJECTED") throw new ChangeApplicationError("ECR_VERIFIED_APPROVAL_OUTCOME_REQUIRED" as StableCode, "Approval terminal transitions must enter through the verified Core Approval outcome boundary.");
  await unitOfWork.transact((context) => saveEcr(context, mutation));
}

/** Approved-ECR ECO creation is intentionally unavailable here; it must atomically convert the source ECR. */
export async function persistEmergencyEcoCreation(unitOfWork: ChangeUnitOfWork, mutation: EcoMutation): Promise<void> {
  if (mutation.expectedVersion !== 0 || mutation.snapshot.origin.kind !== "EMERGENCY_EXCEPTION" || !mutation.immutableEmergencyException) throw new ChangeApplicationError("ECO_EMERGENCY_CREATE_REQUIRED" as StableCode, "Only a documented emergency ECO creation may use this path.");
  await unitOfWork.transact(async (context) => {
    const origin = mutation.snapshot.origin as EmergencyChangeExceptionSnapshot;
    await context.emergencyAuthority.assertExactActiveException({ ...origin, projectId: mutation.snapshot.projectId, ...(mutation.snapshot.contractId ? { contractId: mutation.snapshot.contractId } : {}) });
    await saveEco(context, mutation);
  });
}

export async function persistEcoMutation(unitOfWork: ChangeUnitOfWork, mutation: EcoMutation): Promise<void> {
  if (mutation.expectedVersion === 0) throw new ChangeApplicationError("ECO_CREATE_UOW_REQUIRED" as StableCode, "Use the approved-ECR or emergency ECO creation UoW.");
  if (["EVT-ECO-RELEASE", "EVT-ECO-RECORD-RETROSPECTIVE-APPROVAL"].includes(mutation.event.eventType) || mutation.snapshot.state === "RELEASED" || mutation.immutableOfficialApproval || mutation.immutableRetrospectiveApproval) throw new ChangeApplicationError("ECO_VERIFIED_APPROVAL_OR_EMERGENCY_BOUNDARY_REQUIRED" as StableCode, "Release and retrospective approval must enter through their verified application boundary.");
  await unitOfWork.transact((context) => saveEco(context, mutation));
}

/** Emergency operational release rechecks the policy assignment at command time; a stale snapshot never authorizes release. */
export async function releaseEmergencyEco(unitOfWork: ChangeUnitOfWork, input: { readonly ecoId: Uuid; readonly command: ChangeCommand }): Promise<EcoSnapshot> {
  return unitOfWork.transact(async (context) => {
    const snapshot = await context.ecos.loadForUpdate(input.ecoId);
    if (!snapshot) throw new ChangeApplicationError("ECO_NOT_FOUND" as StableCode, "ECO was not found.");
    if (snapshot.origin.kind !== "EMERGENCY_EXCEPTION") throw new ChangeApplicationError("ECO_EMERGENCY_RELEASE_REQUIRED" as StableCode, "This path is limited to a documented emergency ECO.");
    await context.emergencyAuthority.assertExactActiveException({ ...snapshot.origin, projectId: snapshot.projectId, ...(snapshot.contractId ? { contractId: snapshot.contractId } : {}) });
    const mutation = EngineeringChangeOrder.restore(snapshot).release(input.command);
    await saveEco(context, mutation);
    return mutation.snapshot;
  });
}

function trustedApprovalActor(input: TrustedChangeRequestApprovalOutcome | TrustedChangeOrderApprovalOutcome, official = false): ChangeActorSnapshot {
  const completed = input.completedApproval;
  const userId = completed?.officialApproverUserId ?? input.provenance.actor.effectiveUserId ?? input.provenance.actor.authenticatedUserId;
  if (!userId) throw new ChangeApplicationError("CHANGE_APPROVAL_ACTOR_MISSING" as StableCode, "Verified terminal Approval outcome has no effective actor.");
  return Object.freeze({ actorKind: "INTERNAL", userId, active: true, positionIds: completed ? [completed.officialApproverPositionId] : [...input.provenance.actor.positionIds], authorities: official || input.decision === "REJECTED" ? [CHANGE_PERMISSION_IDS.REQUEST_APPROVE as StableCode] : [] });
}

function trustedCommand(input: TrustedChangeRequestApprovalOutcome | TrustedChangeOrderApprovalOutcome, expectedVersion: Version, official = false): ChangeCommand {
  return { actor: trustedApprovalActor(input, official), expectedVersion, at: input.provenance.occurredAt, eventId: input.provenance.terminalAction.actionId, correlationId: input.provenance.correlationId, idempotencyKey: input.provenance.idempotencyKey };
}

function completedEvidence(completed: CompletedChangeApprovalSnapshot, subjectVersionId: Uuid): OfficialChangeApprovalEvidence {
  return Object.freeze({ approvalInstanceId: completed.approvalInstanceId, approvalVersion: completed.approvalVersion, subjectVersionId, subjectVersion: completed.subjectVersion, subjectChecksum: completed.subjectChecksum, subjectSealedAt: completed.subjectSealedAt, completedAt: completed.completedAt, officialApproverUserId: completed.officialApproverUserId, officialApproverPositionId: completed.officialApproverPositionId });
}

function assertCompletedExact(input: TrustedChangeRequestApprovalOutcome | TrustedChangeOrderApprovalOutcome, subjectVersionId: Uuid): CompletedChangeApprovalSnapshot {
  const completed = input.completedApproval;
  if (!completed || input.outcome !== "COMPLETED" || completed.approvalInstanceId !== input.approvalInstanceId || completed.approvalVersion !== input.approvalVersion || completed.subjectVersion !== input.snapshot.subjectVersion || completed.subjectChecksum !== input.snapshot.checksum || completed.subjectSealedAt !== input.snapshot.sealedAt) throw new ChangeApplicationError("CHANGE_COMPLETED_APPROVAL_NOT_EXACT" as StableCode, "Completed Approval must bind the exact typed subject version/checksum/sealedAt and terminal instance.");
  const completedSubjectId = completed.subject.kind === "CHANGE_REQUEST_VERSION" ? completed.subject.changeRequestVersionId : completed.subject.kind === "CHANGE_ORDER_VERSION" ? completed.subject.changeOrderVersionId : undefined;
  if (completedSubjectId !== subjectVersionId) throw new ChangeApplicationError("CHANGE_COMPLETED_APPROVAL_SUBJECT_MISMATCH" as StableCode, "Completed Approval subject ID differs from the exact Business version.");
  return completed;
}

function negativeSnapshot(input: TrustedChangeRequestApprovalOutcome | TrustedChangeOrderApprovalOutcome, aggregateKind: "ECR" | "ECO", aggregateId: Uuid, subjectVersionId: Uuid): NegativeChangeApprovalOutcomeSnapshot {
  if (input.decision !== "REJECTED" && input.decision !== "RECALLED" && input.decision !== "CANCELLED") throw new ChangeApplicationError("CHANGE_NEGATIVE_OUTCOME_REQUIRED" as StableCode, "A negative terminal outcome is required.");
  return Object.freeze({ negativeOutcomeId: input.provenance.terminalAction.actionId, aggregateKind, aggregateId, subjectVersionId, subjectVersion: input.snapshot.subjectVersion, decision: input.decision, approvalInstanceId: input.approvalInstanceId, approvalVersion: input.approvalVersion, terminalActionId: input.provenance.terminalAction.actionId, ...(input.provenance.terminalReasonCode ? { reasonCode: input.provenance.terminalReasonCode } : {}), occurredAt: input.provenance.occurredAt });
}

async function appendNegativeOutcome(context: ChangeTransactionContext, input: TrustedChangeRequestApprovalOutcome | TrustedChangeOrderApprovalOutcome, record: NegativeChangeApprovalOutcomeSnapshot, aggregateVersion: Version, emitStandaloneEvidence = true): Promise<void> {
  await context.negativeOutcomes.append(record);
  if (!emitStandaloneEvidence) return;
  const actor = trustedApprovalActor(input);
  const eventType = `${record.aggregateKind === "ECR" ? "EVT-ECR" : "EVT-ECO"}-APPROVAL-NEGATIVE-RECORDED` as StableCode;
  await context.evidence.appendAudit({ eventType, actor, aggregateId: record.aggregateId, occurredAt: record.occurredAt, correlationId: input.provenance.correlationId, ...(record.reasonCode ? { reason: record.reasonCode } : {}), evidenceIds: [record.terminalActionId] });
  await context.evidence.enqueue({ eventId: record.negativeOutcomeId, eventType, machineId: record.aggregateKind === "ECR" ? "SM-ECR-V1" : "SM-ECO-V1", aggregateId: record.aggregateId, aggregateVersion, occurredAt: record.occurredAt, correlationId: input.provenance.correlationId, idempotencyKey: input.provenance.idempotencyKey, payload: { decision: record.decision, subjectVersionId: record.subjectVersionId, stateTransitionApplied: false } });
}

/** Only the branded outcome minted by ChangeRequestApprovalSubjectAdapter reaches this UoW. */
export class EcrVerifiedApprovalOutcomeApplicationService implements VerifiedChangeRequestApprovalOutcomePort {
  public constructor(private readonly unitOfWork: ChangeUnitOfWork) {}
  public async applyVerifiedOutcome(input: TrustedChangeRequestApprovalOutcome): Promise<void> {
    assertTrustedChangeApprovalOutcome(input);
    await this.unitOfWork.transact(async (context) => {
      const snapshot = await context.ecrs.loadForUpdate(input.exactVersion.changeRequestId);
      if (!snapshot || snapshot.ecrId !== input.exactVersion.changeRequestId || input.snapshot.subject.kind !== "CHANGE_REQUEST_VERSION" || input.snapshot.subject.changeRequestVersionId !== input.exactVersion.changeRequestVersionId || input.exactVersion.subjectVersion !== input.snapshot.subjectVersion || input.exactVersion.sealedSnapshotChecksum !== input.snapshot.checksum || input.exactVersion.sealedAt !== input.snapshot.sealedAt || snapshot.sealedSubjectVersionId !== input.exactVersion.changeRequestVersionId || snapshot.sealedSubjectVersion !== input.snapshot.subjectVersion || snapshot.sealedSubjectChecksum !== input.snapshot.checksum || snapshot.sealedSubjectAt !== input.snapshot.sealedAt) throw new ChangeApplicationError("ECR_APPROVAL_EXACT_VERSION_MISMATCH" as StableCode, "Verified Approval outcome no longer matches the locked ECR version.");
      if (!(["REVIEW_PENDING", "APPROVAL_PENDING"] as const).includes(snapshot.state as "REVIEW_PENDING" | "APPROVAL_PENDING") || input.decision === "APPROVED" && snapshot.state !== "APPROVAL_PENDING") throw new ChangeApplicationError("ECR_APPROVAL_STATE_MISMATCH" as StableCode, "Terminal Approval outcome may affect only the exact pending ECR lifecycle state.");
      const aggregate = EngineeringChangeRequest.restore(snapshot);
      if (input.decision === "APPROVED") {
        const completed = assertCompletedExact(input, input.exactVersion.changeRequestVersionId);
        await saveEcr(context, aggregate.approve(trustedCommand(input, snapshot.version, true), completedEvidence(completed, input.exactVersion.changeRequestVersionId)));
        return;
      }
      const negative = negativeSnapshot(input, "ECR", snapshot.ecrId, input.exactVersion.changeRequestVersionId);
      await appendNegativeOutcome(context, input, negative, snapshot.version, input.decision !== "REJECTED");
      if (input.decision === "REJECTED") {
        if (!input.provenance.terminalReasonCode) throw new ChangeApplicationError("ECR_REJECT_REASON_REQUIRED" as StableCode, "Verified ECR rejection requires a terminal reason code.");
        await saveEcr(context, aggregate.reject(trustedCommand(input, snapshot.version), { reason: input.provenance.terminalReasonCode, evidenceIds: [input.provenance.terminalAction.actionId] }));
      }
      // RECALLED/CANCELLED have no canonical ECR transition under OD-033; evidence is retained without inventing one.
    });
  }
}

/** Standard completion releases once; emergency completion only appends retrospective approval to an already released exact ECO. */
export class EcoVerifiedApprovalOutcomeApplicationService implements VerifiedChangeOrderApprovalOutcomePort {
  public constructor(private readonly unitOfWork: ChangeUnitOfWork) {}
  public async applyVerifiedOutcome(input: TrustedChangeOrderApprovalOutcome): Promise<void> {
    assertTrustedChangeApprovalOutcome(input);
    await this.unitOfWork.transact(async (context) => {
      const snapshot = await context.ecos.loadForUpdate(input.exactVersion.changeOrderId);
      if (!snapshot || snapshot.ecoId !== input.exactVersion.changeOrderId || input.snapshot.subject.kind !== "CHANGE_ORDER_VERSION" || input.snapshot.subject.changeOrderVersionId !== input.exactVersion.changeOrderVersionId || input.exactVersion.subjectVersion !== input.snapshot.subjectVersion || input.exactVersion.sealedSnapshotChecksum !== input.snapshot.checksum || input.exactVersion.sealedAt !== input.snapshot.sealedAt || snapshot.sealedDefinitionVersionId !== input.exactVersion.changeOrderVersionId || snapshot.sealedDefinitionVersion !== input.snapshot.subjectVersion || snapshot.sealedDefinitionChecksum !== input.snapshot.checksum || snapshot.sealedDefinitionAt !== input.snapshot.sealedAt) throw new ChangeApplicationError("ECO_APPROVAL_EXACT_VERSION_MISMATCH" as StableCode, "Verified Approval outcome no longer matches the locked ECO version.");
      const expectedApprovalState = input.exactVersion.releaseMode === "STANDARD" ? "APPROVAL_PENDING" : "RELEASED";
      if (snapshot.state !== expectedApprovalState) throw new ChangeApplicationError("ECO_APPROVAL_STATE_MISMATCH" as StableCode, "Standard and emergency retrospective outcomes require their exact pending or already-released lifecycle state.");
      if (input.businessEffect.kind === "RETAIN_NEGATIVE_APPROVAL_OUTCOME") { await appendNegativeOutcome(context, input, negativeSnapshot(input, "ECO", snapshot.ecoId, input.exactVersion.changeOrderVersionId), snapshot.version); return; }
      const completed = assertCompletedExact(input, input.exactVersion.changeOrderVersionId);
      const aggregate = EngineeringChangeOrder.restore(snapshot);
      if (input.businessEffect.kind === "RELEASE_STANDARD_CHANGE_ORDER") {
        if (input.exactVersion.releaseMode !== "STANDARD") throw new ChangeApplicationError("ECO_STANDARD_RELEASE_MODE_REQUIRED" as StableCode, "Standard release cannot consume an emergency retrospective Approval outcome.");
        await saveEco(context, aggregate.release(trustedCommand(input, snapshot.version, true), completedEvidence(completed, input.exactVersion.changeOrderVersionId)));
        return;
      }
      if (input.exactVersion.releaseMode !== "EMERGENCY_RETROSPECTIVE" || snapshot.origin.kind !== "EMERGENCY_EXCEPTION" || snapshot.state !== "RELEASED") throw new ChangeApplicationError("ECO_RETROSPECTIVE_RELEASED_STATE_REQUIRED" as StableCode, "Emergency retrospective Approval may append only to an already RELEASED exact emergency ECO and never release again.");
      await saveEco(context, aggregate.recordRetrospectiveApproval(trustedCommand(input, snapshot.version, true), completedEvidence(completed, input.exactVersion.changeOrderVersionId)));
    });
  }
}

/** Creates only a direct immutable successor after a retained REJECTED/RECALLED outcome; no OD-033 lifecycle transition is invented. */
export async function createNextChangeVersionAfterNegativeOutcome(unitOfWork: ChangeUnitOfWork, input: NextChangeVersionInput & { readonly negativeOutcomeId: Uuid; readonly command: Omit<ChangeCommand, "expectedVersion"> }): Promise<void> {
  await unitOfWork.transact(async (context) => {
    const negative = await context.negativeOutcomes.loadLatestForUpdate({ aggregateKind: input.aggregateKind, aggregateId: input.aggregateId });
    if (!negative || negative.negativeOutcomeId !== input.negativeOutcomeId || !["REJECTED", "RECALLED"].includes(negative.decision) || negative.subjectVersionId !== input.previousSubjectVersionId || input.nextSubjectVersion !== negative.subjectVersion + 1 || input.nextSubjectVersionId === input.previousSubjectVersionId) throw new ChangeApplicationError("CHANGE_RESUBMISSION_LINEAGE_INVALID" as StableCode, "Resubmission requires the latest retained negative outcome and a direct strictly newer immutable version.");
    const revision: NextChangeVersionInput = { aggregateKind: input.aggregateKind, aggregateId: input.aggregateId, previousSubjectVersionId: input.previousSubjectVersionId, nextSubjectVersionId: input.nextSubjectVersionId, nextSubjectVersion: input.nextSubjectVersion, checksum: input.checksum, sealedAt: input.sealedAt };
    await context.revisions.insertNextImmutableVersion(revision);
    const eventType = `${input.aggregateKind === "ECR" ? "EVT-ECR" : "EVT-ECO"}-RESUBMISSION-VERSION-CREATED` as StableCode;
    await context.evidence.appendAudit({ eventType, actor: input.command.actor, aggregateId: input.aggregateId, occurredAt: input.command.at, correlationId: input.command.correlationId, evidenceIds: [negative.terminalActionId] });
    await context.evidence.enqueue({ eventId: input.command.eventId, eventType, machineId: input.aggregateKind === "ECR" ? "SM-ECR-V1" : "SM-ECO-V1", aggregateId: input.aggregateId, aggregateVersion: input.nextSubjectVersion, occurredAt: input.command.at, correlationId: input.command.correlationId, idempotencyKey: input.command.idempotencyKey, payload: { previousSubjectVersionId: input.previousSubjectVersionId, nextSubjectVersionId: input.nextSubjectVersionId, lifecycleTransitionApplied: false } });
  });
}

export type StandardEcoCreateInput = Omit<Parameters<typeof EngineeringChangeOrder.create>[0], "origin">;
export async function createEcoFromApprovedEcr(unitOfWork: ChangeUnitOfWork, input: {
  readonly ecrId: Uuid;
  readonly eco: StandardEcoCreateInput;
  readonly ecoCommand: Omit<ChangeCommand, "expectedVersion">;
  readonly ecrConversionCommand: ChangeCommand;
}): Promise<EcoSnapshot> {
  return unitOfWork.transact(async (context) => {
    const exact = await context.ecrs.loadForUpdate(input.ecrId);
    if (!exact) throw new ChangeApplicationError("ECR_NOT_FOUND" as StableCode, "Source ECR was not found.");
    if (exact.state !== "APPROVED" || !exact.sealedSubjectVersionId || !exact.sealedSubjectVersion || !exact.sealedSubjectChecksum || !exact.sealedSubjectAt || !exact.officialApproval) throw new ChangeApplicationError("ECO_APPROVED_ECR_REQUIRED" as StableCode, "ECO creation requires the exact immutable approved ECR snapshot.");
    const origin: ApprovedEcrOrigin = { kind: "APPROVED_ECR", ecrId: exact.ecrId, ecrVersion: exact.version, ecrState: "APPROVED", sealedSubjectVersionId: exact.sealedSubjectVersionId, sealedSubjectVersion: exact.sealedSubjectVersion, sealedSubjectChecksum: exact.sealedSubjectChecksum, sealedSubjectAt: exact.sealedSubjectAt, officialApproval: exact.officialApproval };
    const ecoMutation = EngineeringChangeOrder.create({ ...input.eco, origin }, input.ecoCommand);
    const ecrMutation = EngineeringChangeRequest.restore(exact).markEcoCreated(input.ecrConversionCommand, ecoMutation.snapshot.ecoId);
    await saveEco(context, ecoMutation);
    await saveEcr(context, ecrMutation);
    return ecoMutation.snapshot;
  });
}

export async function applyEcoImplementation(unitOfWork: ChangeUnitOfWork, input: { readonly ecoId: Uuid; readonly command: ChangeCommand; readonly implementation: Omit<EcoImplementationSnapshot, "ecoId" | "implementedByUserId" | "implementedByVendorId" | "implementedAt" | "originalOverwritten"> }): Promise<EcoSnapshot> {
  return unitOfWork.transact(async (context) => {
    const snapshot = await context.ecos.loadForUpdate(input.ecoId);
    if (!snapshot) throw new ChangeApplicationError("ECO_NOT_FOUND" as StableCode, "ECO was not found.");
    const mutation = EngineeringChangeOrder.restore(snapshot).recordImplementation(input.command, input.implementation);
    await saveEco(context, mutation);
    return mutation.snapshot;
  });
}

export async function verifyEcoEffectiveness(unitOfWork: ChangeUnitOfWork, input: { readonly ecoId: Uuid; readonly command: ChangeCommand; readonly verification: Omit<EcoVerificationSnapshot, "ecoId" | "verifierUserId" | "verifiedAt">; readonly signedChangeContract?: ExecutedSignedChangeContractSnapshot }): Promise<EcoSnapshot> {
  return unitOfWork.transact(async (context) => {
    const snapshot = await context.ecos.loadForUpdate(input.ecoId);
    if (!snapshot) throw new ChangeApplicationError("ECO_NOT_FOUND" as StableCode, "ECO was not found.");
    const aggregate = EngineeringChangeOrder.restore(snapshot);
    const mutation = aggregate.verify(input.command, { verification: input.verification, ...(input.signedChangeContract ? { signedChangeContract: input.signedChangeContract } : {}) });
    const enriched: EcoMutation = input.signedChangeContract ? { ...mutation, immutableSignedChangeContract: input.signedChangeContract } : mutation;
    await saveEco(context, enriched);
    return enriched.snapshot;
  });
}

export interface ChangeImpactSummaryView { readonly cost: "NO_IMPACT" | "AFFECTED"; readonly schedule: "NO_IMPACT" | "AFFECTED"; readonly quality: "NO_IMPACT" | "AFFECTED"; readonly safety: "NO_IMPACT" | "AFFECTED"; readonly security: "NO_IMPACT" | "AFFECTED"; readonly regulatory: "NO_IMPACT" | "AFFECTED" }
export interface ChangeTargetDisplayRef { readonly kind: EcoTarget["kind"]; readonly targetId: string; readonly displayRef: string }
export interface ChangeProgressView { readonly implementedTargets: number; readonly totalTargets: number; readonly verification: "NOT_READY" | "PENDING" | "VERIFIED" }
export interface VendorChangeListItemView {
  readonly changeRequestId: string; readonly ecrNo: string; readonly title: string; readonly priority: ChangePriority; readonly state: EcrState;
  readonly changeOrderId?: string; readonly ecoNo?: string; readonly ecoState?: EcoState; readonly projectId: string; readonly contractId?: string;
  readonly impactSummary: ChangeImpactSummaryView; readonly exactTargetDisplayRefs: readonly ChangeTargetDisplayRef[]; readonly progress: ChangeProgressView; readonly nextAction: StableCode | null;
}
export interface VendorChangeDetailView extends VendorChangeListItemView {
  readonly assignedImplementationEvidenceIds: readonly string[];
  readonly appliedScope?: { readonly serialNumbers: readonly string[]; readonly lotNumbers: readonly string[]; readonly equipmentIds: readonly string[] };
}
export type VendorChangeProjectionSource = VendorChangeListItemView;
export type VendorChangeDetailProjectionSource = VendorChangeDetailView;

/** Runtime allowlist: never spread repository rows into an external response. */
export function projectVendorChangeListItem<T extends VendorChangeProjectionSource>(source: T): VendorChangeListItemView {
  return Object.freeze({
    changeRequestId: source.changeRequestId, ecrNo: source.ecrNo, title: source.title, priority: source.priority, state: source.state,
    ...(source.changeOrderId !== undefined ? { changeOrderId: source.changeOrderId } : {}), ...(source.ecoNo !== undefined ? { ecoNo: source.ecoNo } : {}), ...(source.ecoState !== undefined ? { ecoState: source.ecoState } : {}),
    projectId: source.projectId, ...(source.contractId !== undefined ? { contractId: source.contractId } : {}),
    impactSummary: Object.freeze({ cost: source.impactSummary.cost, schedule: source.impactSummary.schedule, quality: source.impactSummary.quality, safety: source.impactSummary.safety, security: source.impactSummary.security, regulatory: source.impactSummary.regulatory }),
    exactTargetDisplayRefs: Object.freeze(source.exactTargetDisplayRefs.map((target) => Object.freeze({ kind: target.kind, targetId: target.targetId, displayRef: target.displayRef }))),
    progress: Object.freeze({ implementedTargets: source.progress.implementedTargets, totalTargets: source.progress.totalTargets, verification: source.progress.verification }), nextAction: source.nextAction
  });
}

export function projectVendorChangeDetail<T extends VendorChangeDetailProjectionSource>(source: T): VendorChangeDetailView {
  const list = projectVendorChangeListItem(source);
  return Object.freeze({ ...list, assignedImplementationEvidenceIds: Object.freeze([...source.assignedImplementationEvidenceIds]), ...(source.appliedScope ? { appliedScope: Object.freeze({ serialNumbers: Object.freeze([...source.appliedScope.serialNumbers]), lotNumbers: Object.freeze([...source.appliedScope.lotNumbers]), equipmentIds: Object.freeze([...source.appliedScope.equipmentIds]) }) } : {}) });
}
export interface InternalChangeDetailView { readonly ecr: EcrSnapshot; readonly eco?: EcoSnapshot; readonly reviews: readonly EcrReviewSnapshot[]; readonly implementations: readonly EcoImplementationSnapshot[] }
export type ChangeVendorListResult = { readonly availability: "AVAILABLE"; readonly items: readonly VendorChangeListItemView[] } | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type ChangeVendorDetailResult = { readonly availability: "AVAILABLE"; readonly detail: VendorChangeDetailView } | { readonly availability: "FORBIDDEN" | "NOT_FOUND"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type ChangeInternalDetailResult = { readonly availability: "AVAILABLE"; readonly detail: InternalChangeDetailView } | { readonly availability: "FORBIDDEN" | "NOT_FOUND"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface ChangeQueryPort { listMineExternal(): Promise<ChangeVendorListResult>; getMineExternal(changeRequestId: string): Promise<ChangeVendorDetailResult>; getInternalDetail(changeRequestId: string): Promise<ChangeInternalDetailResult> }

/** Explicit forbidden-field contract for external projections. */
export type VendorForbiddenChangeField = "internalImpactDeliberation" | "approvalParticipants" | "contractAmount" | "legalNotes" | "securityFindings" | "internalNotes" | "temporaryAuthorityInternalReasoning";
export const VENDOR_FORBIDDEN_CHANGE_FIELDS: readonly VendorForbiddenChangeField[] = Object.freeze(["internalImpactDeliberation", "approvalParticipants", "contractAmount", "legalNotes", "securityFindings", "internalNotes", "temporaryAuthorityInternalReasoning"]);

export interface ChangeCommandPort {
  /** The trusted server loads and seals the completed analysis; no client-provided checksum is authoritative. */
  submitEcrReview(input: { readonly ecrId: string; readonly expectedVersion: number }): Promise<{ readonly availability: "ACCEPTED"; readonly newVersion: number } | { readonly availability: "FORBIDDEN" | "CONFLICT" | "NOT_FOUND" } | { readonly availability: "UNAVAILABLE"; readonly reason: "COMMAND_ADAPTER_NOT_CONFIGURED" }>;
  submitEcoVerification(input: { readonly ecoId: string; readonly expectedVersion: number }): Promise<{ readonly availability: "ACCEPTED"; readonly newVersion: number } | { readonly availability: "FORBIDDEN" | "CONFLICT" | "NOT_FOUND" } | { readonly availability: "UNAVAILABLE"; readonly reason: "COMMAND_ADAPTER_NOT_CONFIGURED" }>;
}

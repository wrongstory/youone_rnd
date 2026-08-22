import { policyMatches } from "@youone/core-approval/public";
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
import type { Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";

export type ChangeRequestApprovalSubject = Extract<ApprovalSubject, { kind: "CHANGE_REQUEST_VERSION" }>;
export type ChangeOrderApprovalSubject = Extract<ApprovalSubject, { kind: "CHANGE_ORDER_VERSION" }>;
export type ChangeApprovalSubject = ChangeRequestApprovalSubject | ChangeOrderApprovalSubject;
export type ChangeRequestApprovalDecision = "APPROVED" | "REJECTED" | "RECALLED" | "CANCELLED";
export type ChangeOrderApprovalDecision = "RELEASED" | "RETROSPECTIVE_APPROVAL_RECORDED" | "REJECTED" | "RECALLED" | "CANCELLED";
export type ChangeApprovalState = "APPROVAL_PENDING" | ChangeRequestApprovalDecision | Exclude<ChangeOrderApprovalDecision, "RETROSPECTIVE_APPROVAL_RECORDED">;

/** Exact private-file identity. Storage keys, URLs and delivery tokens are deliberately absent. */
export interface OpaquePrivateFileRef {
  readonly attachmentId: Uuid;
  readonly rowVersion: Version;
  readonly checksum: Sha256;
}

export interface EmergencyRetrospectiveApprovalEvidence {
  readonly emergencyExceptionId: Uuid;
  readonly policyVersionId: Uuid;
  readonly authorityCode: StableCode;
  readonly reason: string;
  readonly riskAssessment: string;
  readonly temporaryAuthorityAssignmentId: Uuid;
  readonly temporaryAuthorityUserId: Uuid;
  readonly authorizedByUserId: Uuid;
  readonly authorizedByPositionId: StableCode;
  readonly validFrom: UtcInstant;
  readonly validUntil: UtcInstant;
  readonly retrospectiveApprovalDueAt: UtcInstant;
  readonly evidenceIds: readonly Uuid[];
  readonly privateFileRefs: readonly OpaquePrivateFileRef[];
  readonly recordedAt: UtcInstant;
}

export interface CompletedChangeApprovalSnapshot<Subject extends ChangeApprovalSubject = ChangeApprovalSubject> {
  readonly approvalInstanceId: Uuid;
  readonly approvalVersion: Version;
  readonly approvalPolicyVersionId: Uuid;
  readonly approvalPolicyChecksum: Sha256;
  readonly approvalStepId: Uuid;
  readonly approvalParticipantId: Uuid;
  readonly approvalStepRole: "APPROVAL";
  readonly authorityPolicyEvidenceId: Uuid;
  /** Exact typed subject identity resolved from the terminal ApprovalInstance link. */
  readonly subject: Subject;
  readonly subjectVersion: Version;
  readonly subjectChecksum: Sha256;
  readonly subjectSealedAt: UtcInstant;
  readonly completedAt: UtcInstant;
  readonly officialApproverUserId: Uuid;
  readonly officialApproverPositionId: StableCode;
  readonly actingAuthorityEvidenceId?: Uuid;
}

/** Re-loads the exact terminal ApprovalAction/participant; caller-provided position IDs are never trusted. */
export interface CompletedChangeApprovalSnapshotPort {
  /** Must resolve an APPROVAL participant from the sealed policy/line, never a REVIEW action or caller claim. */
  resolve(input: ApprovalOutcomeInput): Promise<CompletedChangeApprovalSnapshot>;
}

interface SealedChangeVersionIdentity {
  readonly subjectVersion: Version;
  readonly sealedSnapshotChecksum: Sha256;
  readonly sealedAt: UtcInstant;
  readonly approvalState: ChangeApprovalState;
}

export interface ChangeRequestApprovalRecord extends SealedChangeVersionIdentity {
  readonly changeRequestVersionId: Uuid;
  readonly changeRequestId: Uuid;
  readonly revisionNo: number;
  readonly previousChangeRequestVersionId?: Uuid;
  readonly impactAnalysisEvidenceIds: readonly Uuid[];
  readonly privateFileRefs: readonly OpaquePrivateFileRef[];
}

export interface ChangeOrderApprovalRecord extends SealedChangeVersionIdentity {
  readonly changeOrderVersionId: Uuid;
  readonly changeOrderId: Uuid;
  readonly revisionNo: number;
  readonly previousChangeOrderVersionId?: Uuid;
  readonly sourceChangeRequestVersionId?: Uuid;
  readonly releaseMode: "STANDARD" | "EMERGENCY_RETROSPECTIVE";
  readonly emergencyEvidence?: EmergencyRetrospectiveApprovalEvidence;
  readonly implementationEvidenceIds: readonly Uuid[];
  readonly verificationEvidenceIds: readonly Uuid[];
  readonly privateFileRefs: readonly OpaquePrivateFileRef[];
}

export interface ChangeRequestApprovalStore {
  loadExact(id: Uuid): Promise<ChangeRequestApprovalRecord | null>;
  /** Resolve only through the current row's exact previous-version FK. */
  loadPrevious(id: Uuid): Promise<ChangeRequestApprovalRecord | null>;
}

export interface ChangeOrderApprovalStore {
  loadExact(id: Uuid): Promise<ChangeOrderApprovalRecord | null>;
  /** Resolve only through the current row's exact previous-version FK. */
  loadPrevious(id: Uuid): Promise<ChangeOrderApprovalRecord | null>;
}

export interface ChangeApprovalObligations {
  readonly sealedSubjectIdentityIsImmutable: true;
  readonly terminalApprovalSnapshotIsRequired: true;
  readonly seniorReviewIsNotOfficialApproval: true;
  readonly evidenceReferencesAreAppendOnly: true;
  readonly privateFilesRemainOpaqueAndAuthorized: true;
  readonly vendorProfessionalResponsibilityIsNotWaived: true;
  readonly approvalDoesNotImplementOrVerifyChange: true;
  readonly emergencyRetrospectiveApprovalNeverReleasesAgain: true;
}

export const CHANGE_APPROVAL_OBLIGATIONS: ChangeApprovalObligations = Object.freeze({
  sealedSubjectIdentityIsImmutable: true,
  terminalApprovalSnapshotIsRequired: true,
  seniorReviewIsNotOfficialApproval: true,
  evidenceReferencesAreAppendOnly: true,
  privateFilesRemainOpaqueAndAuthorized: true,
  vendorProfessionalResponsibilityIsNotWaived: true,
  approvalDoesNotImplementOrVerifyChange: true,
  emergencyRetrospectiveApprovalNeverReleasesAgain: true
});

declare const trustedChangeApprovalOutcomeBrand: unique symbol;
interface TrustedChangeApprovalOutcomeBrand {
  readonly [trustedChangeApprovalOutcomeBrand]: true;
}

export type ChangeOrderApprovalBusinessEffect =
  | { readonly kind: "RELEASE_STANDARD_CHANGE_ORDER"; readonly releaseTransitionAllowed: true }
  | { readonly kind: "APPEND_EMERGENCY_RETROSPECTIVE_APPROVAL"; readonly releaseTransitionAllowed: false }
  | { readonly kind: "RETAIN_NEGATIVE_APPROVAL_OUTCOME"; readonly releaseTransitionAllowed: false };

export type TrustedChangeRequestApprovalOutcome = Readonly<ApprovalOutcomeInput & {
  readonly decision: ChangeRequestApprovalDecision;
  readonly exactVersion: ChangeRequestApprovalRecord;
  readonly completedApproval?: CompletedChangeApprovalSnapshot<ChangeRequestApprovalSubject>;
  readonly obligations: ChangeApprovalObligations;
}> & TrustedChangeApprovalOutcomeBrand;

export type TrustedChangeOrderApprovalOutcome = Readonly<ApprovalOutcomeInput & {
  readonly decision: ChangeOrderApprovalDecision;
  readonly businessEffect: ChangeOrderApprovalBusinessEffect;
  readonly exactVersion: ChangeOrderApprovalRecord;
  readonly retrospectiveEvidence?: EmergencyRetrospectiveApprovalEvidence;
  readonly completedApproval?: CompletedChangeApprovalSnapshot<ChangeOrderApprovalSubject>;
  readonly obligations: ChangeApprovalObligations;
}> & TrustedChangeApprovalOutcomeBrand;

export interface VerifiedChangeRequestApprovalOutcomePort {
  /** Input can only be minted after the Approval adapter re-loads and verifies exact terminal evidence. */
  applyVerifiedOutcome(input: TrustedChangeRequestApprovalOutcome): Promise<void>;
}

export interface VerifiedChangeOrderApprovalOutcomePort {
  /** Emergency completion appends retrospective evidence and is never a second release transition. */
  applyVerifiedOutcome(input: TrustedChangeOrderApprovalOutcome): Promise<void>;
}

export class ChangeApprovalContractError extends Error {
  public constructor(public readonly code: StableCode, message: string) {
    super(message);
    this.name = "ChangeApprovalContractError";
  }
}

const fail = (code: string, message: string): never => {
  throw new ChangeApprovalContractError(code as StableCode, message);
};

const trustedChangeApprovalOutcomes = new WeakSet<object>();

function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>();
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    for (const nested of Object.values(candidate)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(value);
  return value;
}

function mintTrustedChangeApprovalOutcome<T extends object>(value: T): T & TrustedChangeApprovalOutcomeBrand {
  const envelope = deepFreeze(structuredClone(value)) as T & TrustedChangeApprovalOutcomeBrand;
  trustedChangeApprovalOutcomes.add(envelope);
  return envelope;
}

/** Runtime gate for Business UoW implementations; structural lookalikes are rejected. */
export function assertTrustedChangeApprovalOutcome(
  value: unknown
): asserts value is TrustedChangeRequestApprovalOutcome | TrustedChangeOrderApprovalOutcome {
  if (value === null || typeof value !== "object" || !trustedChangeApprovalOutcomes.has(value)) {
    fail("CHANGE_APPROVAL_OUTCOME_NOT_TRUSTED", "Only an outcome minted by the exact Approval subject adapter may drive a Business transition.");
  }
}

function sameActor(left: ApprovalActorSnapshot, right: ApprovalActorSnapshot): boolean {
  const a = left.actingAuthority;
  const b = right.actingAuthority;
  const sameAuthority = a === undefined && b === undefined || Boolean(a && b &&
    a.assignmentId === b.assignmentId && a.evidenceId === b.evidenceId &&
    a.grantorUserId === b.grantorUserId && a.delegateUserId === b.delegateUserId &&
    a.representedPositionId === b.representedPositionId && a.validFrom === b.validFrom &&
    a.validTo === b.validTo && a.reason === b.reason &&
    a.allowedActionIds.length === b.allowedActionIds.length &&
    a.allowedActionIds.every((value, index) => value === b.allowedActionIds[index]));
  return left.actorType === right.actorType && left.accountKind === right.accountKind &&
    left.authenticatedUserId === right.authenticatedUserId && left.effectiveUserId === right.effectiveUserId &&
    left.positionIds.length === right.positionIds.length && left.positionIds.every((value, index) => value === right.positionIds[index]) &&
    left.roleIds.length === right.roleIds.length && left.roleIds.every((value, index) => value === right.roleIds[index]) && sameAuthority;
}

function assertTerminalProvenance(input: ApprovalOutcomeInput): void {
  const allowed: Readonly<Record<ApprovalOutcomeInput["outcome"], readonly string[]>> = {
    COMPLETED: ["APPROVE"], REJECTED: ["REJECT"], RECALLED: ["RECALL"], CANCELLED: ["CANCEL"]
  };
  const provenance = input.provenance;
  if (!allowed[input.outcome].includes(provenance.terminalAction.kind) ||
    provenance.terminalAction.at !== provenance.occurredAt ||
    !sameActor(provenance.terminalAction.actor, provenance.actor) ||
    provenance.terminalAction.reasonCode !== provenance.terminalReasonCode ||
    provenance.actor.actingAuthority?.evidenceId !== provenance.actingAuthorityEvidenceId ||
    !String(provenance.correlationId).trim() || !String(provenance.idempotencyKey).trim()) {
    fail("CHANGE_APPROVAL_PROVENANCE_INVALID", "Terminal action, actor, time, reason and command provenance must remain exact.");
  }
}

function sameChangeSubject(left: unknown, right: ChangeApprovalSubject): left is ChangeApprovalSubject {
  if (left === null || typeof left !== "object" || !("kind" in left) || left.kind !== right.kind) return false;
  return left.kind === "CHANGE_REQUEST_VERSION"
    ? "changeRequestVersionId" in left && left.changeRequestVersionId === (right as ChangeRequestApprovalSubject).changeRequestVersionId
    : "changeOrderVersionId" in left && left.changeOrderVersionId === (right as ChangeOrderApprovalSubject).changeOrderVersionId;
}

async function completedApproval<Subject extends ChangeApprovalSubject>(
  input: ApprovalOutcomeInput,
  subject: Subject,
  resolver: CompletedChangeApprovalSnapshotPort
): Promise<CompletedChangeApprovalSnapshot<Subject> | undefined> {
  if (input.outcome !== "COMPLETED") return undefined;
  const resolved = await resolver.resolve(input);
  const actor = input.provenance.actor;
  const positionAllowed = actor.actingAuthority?.representedPositionId === resolved.officialApproverPositionId || actor.positionIds.includes(resolved.officialApproverPositionId);
  if (actor.actorType !== "USER" || actor.accountKind !== "INTERNAL" || !actor.effectiveUserId || !positionAllowed ||
    resolved.approvalStepRole !== "APPROVAL" || resolved.officialApproverPositionId === "POSITION_SENIOR_RESEARCHER" ||
    !resolved.approvalPolicyVersionId || !resolved.approvalPolicyChecksum || !resolved.approvalStepId ||
    !resolved.approvalParticipantId || !resolved.authorityPolicyEvidenceId ||
    resolved.approvalInstanceId !== input.approvalInstanceId || resolved.approvalVersion !== input.approvalVersion ||
    !sameChangeSubject(resolved.subject, subject) ||
    resolved.subjectVersion !== input.snapshot.subjectVersion || resolved.subjectChecksum !== input.snapshot.checksum ||
    resolved.subjectSealedAt !== input.snapshot.sealedAt || resolved.completedAt !== input.provenance.occurredAt ||
    resolved.officialApproverUserId !== actor.effectiveUserId || resolved.actingAuthorityEvidenceId !== input.provenance.actingAuthorityEvidenceId) {
    fail("CHANGE_OFFICIAL_APPROVAL_SNAPSHOT_INVALID", "Resolved official approval must bind the exact terminal participant, subject triple and trusted actor provenance.");
  }
  return resolved as CompletedChangeApprovalSnapshot<Subject>;
}

function assertEmergencyEvidence(record: ChangeOrderApprovalRecord): void {
  if (record.releaseMode === "STANDARD") {
    if (record.emergencyEvidence !== undefined) fail("CHANGE_ORDER_EMERGENCY_EVIDENCE_UNEXPECTED", "A standard ECO cannot carry an emergency exception.");
    return;
  }
  const evidence = record.emergencyEvidence;
  if (!evidence || !evidence.reason.trim() || !evidence.riskAssessment.trim() || evidence.evidenceIds.length === 0 ||
    evidence.privateFileRefs.length === 0 || evidence.validUntil <= evidence.validFrom || evidence.recordedAt < evidence.validFrom ||
    record.sealedAt < evidence.validFrom || record.sealedAt >= evidence.validUntil || evidence.retrospectiveApprovalDueAt <= record.sealedAt) {
    fail("CHANGE_ORDER_EMERGENCY_EVIDENCE_REQUIRED", "Emergency ECO release requires reason, authority, exact private evidence and a future retrospective approval deadline.");
  }
}

abstract class BaseChangeApprovalAdapter {
  protected assertSnapshot(record: SealedChangeVersionIdentity, snapshot: ApprovalSubjectSnapshot): void {
    if (record.subjectVersion !== snapshot.subjectVersion || record.sealedSnapshotChecksum !== snapshot.checksum || record.sealedAt !== snapshot.sealedAt) {
      fail("CHANGE_APPROVAL_SUBJECT_MISMATCH", "Approval does not bind the exact immutable change version/checksum/sealedAt.");
    }
  }
  protected assertPending(record: SealedChangeVersionIdentity): void {
    if (record.approvalState !== "APPROVAL_PENDING" || record.subjectVersion < 1 || !record.sealedAt || !record.sealedSnapshotChecksum) {
      fail("CHANGE_EXACT_SEALED_VERSION_REQUIRED", "Only an exact sealed change version pending approval may be submitted.");
    }
  }
}

function requireChangeRequestSubject(subject: ApprovalSubject): ChangeRequestApprovalSubject {
  if (subject.kind !== "CHANGE_REQUEST_VERSION") {
    throw new ChangeApprovalContractError("CHANGE_REQUEST_SUBJECT_KIND_INVALID" as StableCode, "Approval subject must be CHANGE_REQUEST_VERSION.");
  }
  return subject;
}

function requireChangeOrderSubject(subject: ApprovalSubject): ChangeOrderApprovalSubject {
  if (subject.kind !== "CHANGE_ORDER_VERSION") {
    throw new ChangeApprovalContractError("CHANGE_ORDER_SUBJECT_KIND_INVALID" as StableCode, "Approval subject must be CHANGE_ORDER_VERSION.");
  }
  return subject;
}

export class ChangeRequestApprovalSubjectAdapter extends BaseChangeApprovalAdapter
  implements TypedApprovalSubjectPort<ChangeRequestApprovalSubject> {
  public readonly kind = "CHANGE_REQUEST_VERSION" as const;
  public constructor(private readonly store: ChangeRequestApprovalStore, private readonly outcomes: VerifiedChangeRequestApprovalOutcomePort,
    private readonly completedApprovals: CompletedChangeApprovalSnapshotPort) { super(); }

  public async sealExactVersion(subject: ChangeRequestApprovalSubject): Promise<ApprovalSubjectSnapshot> {
    const record = await this.requireExact(subject.changeRequestVersionId); this.assertPending(record);
    return { subject, subjectVersion: record.subjectVersion, checksum: record.sealedSnapshotChecksum, sealedAt: record.sealedAt };
  }
  public async assertExactVersion(snapshot: ApprovalSubjectSnapshot): Promise<void> {
    const subject = requireChangeRequestSubject(snapshot.subject);
    this.assertSnapshot(await this.requireExact(subject.changeRequestVersionId), snapshot);
  }
  public async assertResubmissionLineage(input: { readonly previous: ApprovalSubjectSnapshot; readonly current: ApprovalSubjectSnapshot }): Promise<void> {
    await this.assertExactVersion(input.previous); await this.assertExactVersion(input.current);
    const previousSubject = requireChangeRequestSubject(input.previous.subject);
    const currentSubject = requireChangeRequestSubject(input.current.subject);
    const previous = await this.requireExact(previousSubject.changeRequestVersionId);
    const current = await this.requireExact(currentSubject.changeRequestVersionId);
    const storedPrevious = await this.store.loadPrevious(current.changeRequestVersionId);
    if ((previous.approvalState !== "REJECTED" && previous.approvalState !== "RECALLED") ||
      current.approvalState !== "APPROVAL_PENDING" || previous.changeRequestId !== current.changeRequestId ||
      current.previousChangeRequestVersionId !== previous.changeRequestVersionId || storedPrevious?.changeRequestVersionId !== previous.changeRequestVersionId ||
      current.revisionNo <= previous.revisionNo || current.subjectVersion <= previous.subjectVersion) {
      fail("CHANGE_REQUEST_RESUBMISSION_INVALID", "ECR resubmission requires a direct strictly newer same-root version after rejection or recall.");
    }
  }
  public async applyApprovalOutcome(input: ApprovalOutcomeInput): Promise<void> {
    await this.assertExactVersion(input.snapshot); assertTerminalProvenance(input);
    const subject = requireChangeRequestSubject(input.snapshot.subject);
    const exactVersion = await this.requireExact(subject.changeRequestVersionId);
    const completed = await completedApproval(input, subject, this.completedApprovals);
    const outcome = mintTrustedChangeApprovalOutcome({ ...input, decision: input.outcome === "COMPLETED" ? "APPROVED" as const : input.outcome,
      exactVersion, ...(completed ? { completedApproval: completed } : {}), obligations: CHANGE_APPROVAL_OBLIGATIONS });
    await this.outcomes.applyVerifiedOutcome(outcome);
  }
  private async requireExact(id: Uuid): Promise<ChangeRequestApprovalRecord> {
    const record = await this.store.loadExact(id);
    if (record === null) throw new ChangeApprovalContractError("CHANGE_REQUEST_VERSION_NOT_FOUND" as StableCode, "ECR version was not found.");
    return record;
  }
}

export class ChangeOrderApprovalSubjectAdapter extends BaseChangeApprovalAdapter
  implements TypedApprovalSubjectPort<ChangeOrderApprovalSubject> {
  public readonly kind = "CHANGE_ORDER_VERSION" as const;
  public constructor(private readonly store: ChangeOrderApprovalStore, private readonly outcomes: VerifiedChangeOrderApprovalOutcomePort,
    private readonly completedApprovals: CompletedChangeApprovalSnapshotPort) { super(); }

  public async sealExactVersion(subject: ChangeOrderApprovalSubject): Promise<ApprovalSubjectSnapshot> {
    const record = await this.requireExact(subject.changeOrderVersionId); this.assertPending(record); assertEmergencyEvidence(record);
    if (!record.sourceChangeRequestVersionId && record.releaseMode !== "EMERGENCY_RETROSPECTIVE") {
      fail("CHANGE_ORDER_SOURCE_ECR_REQUIRED", "A standard ECO requires an exact approved ECR version.");
    }
    return { subject, subjectVersion: record.subjectVersion, checksum: record.sealedSnapshotChecksum, sealedAt: record.sealedAt };
  }
  public async assertExactVersion(snapshot: ApprovalSubjectSnapshot): Promise<void> {
    const subject = requireChangeOrderSubject(snapshot.subject);
    const record = await this.requireExact(subject.changeOrderVersionId); this.assertSnapshot(record, snapshot); assertEmergencyEvidence(record);
  }
  public async assertResubmissionLineage(input: { readonly previous: ApprovalSubjectSnapshot; readonly current: ApprovalSubjectSnapshot }): Promise<void> {
    await this.assertExactVersion(input.previous); await this.assertExactVersion(input.current);
    const previousSubject = requireChangeOrderSubject(input.previous.subject);
    const currentSubject = requireChangeOrderSubject(input.current.subject);
    const previous = await this.requireExact(previousSubject.changeOrderVersionId);
    const current = await this.requireExact(currentSubject.changeOrderVersionId);
    const storedPrevious = await this.store.loadPrevious(current.changeOrderVersionId);
    if ((previous.approvalState !== "REJECTED" && previous.approvalState !== "RECALLED") ||
      current.approvalState !== "APPROVAL_PENDING" || previous.changeOrderId !== current.changeOrderId ||
      current.previousChangeOrderVersionId !== previous.changeOrderVersionId || storedPrevious?.changeOrderVersionId !== previous.changeOrderVersionId ||
      current.revisionNo <= previous.revisionNo || current.subjectVersion <= previous.subjectVersion) {
      fail("CHANGE_ORDER_RESUBMISSION_INVALID", "ECO resubmission requires a direct strictly newer same-root version after rejection or recall.");
    }
  }
  public async applyApprovalOutcome(input: ApprovalOutcomeInput): Promise<void> {
    await this.assertExactVersion(input.snapshot); assertTerminalProvenance(input);
    const subject = requireChangeOrderSubject(input.snapshot.subject);
    const exactVersion = await this.requireExact(subject.changeOrderVersionId);
    const completed = await completedApproval(input, subject, this.completedApprovals);
    const completedEmergency = input.outcome === "COMPLETED" && exactVersion.releaseMode === "EMERGENCY_RETROSPECTIVE";
    const decision: ChangeOrderApprovalDecision = input.outcome === "COMPLETED"
      ? completedEmergency ? "RETROSPECTIVE_APPROVAL_RECORDED" : "RELEASED"
      : input.outcome;
    const businessEffect: ChangeOrderApprovalBusinessEffect = input.outcome !== "COMPLETED"
      ? { kind: "RETAIN_NEGATIVE_APPROVAL_OUTCOME", releaseTransitionAllowed: false }
      : completedEmergency
        ? { kind: "APPEND_EMERGENCY_RETROSPECTIVE_APPROVAL", releaseTransitionAllowed: false }
        : { kind: "RELEASE_STANDARD_CHANGE_ORDER", releaseTransitionAllowed: true };
    const outcome = mintTrustedChangeApprovalOutcome({ ...input, decision, businessEffect, exactVersion,
      ...(exactVersion.emergencyEvidence ? { retrospectiveEvidence: exactVersion.emergencyEvidence } : {}),
      ...(completed ? { completedApproval: completed } : {}), obligations: CHANGE_APPROVAL_OBLIGATIONS });
    await this.outcomes.applyVerifiedOutcome(outcome);
  }
  private async requireExact(id: Uuid): Promise<ChangeOrderApprovalRecord> {
    const record = await this.store.loadExact(id);
    if (record === null) throw new ChangeApprovalContractError("CHANGE_ORDER_VERSION_NOT_FOUND" as StableCode, "ECO version was not found.");
    return record;
  }
}

function prefixEqual<T>(before: readonly T[], after: readonly T[], equals: (left: T, right: T) => boolean): boolean {
  return after.length >= before.length && before.every((value, index) => equals(value, after[index] as T));
}

function sameFileRef(left: OpaquePrivateFileRef, right: OpaquePrivateFileRef): boolean {
  return left.attachmentId === right.attachmentId && left.rowVersion === right.rowVersion && left.checksum === right.checksum;
}

export function assertChangeRequestApprovedIdentity(previous: ChangeRequestApprovalRecord, current: ChangeRequestApprovalRecord): void {
  const immutable = previous.approvalState === "APPROVED" && current.approvalState === previous.approvalState &&
    previous.changeRequestVersionId === current.changeRequestVersionId && previous.changeRequestId === current.changeRequestId &&
    previous.revisionNo === current.revisionNo && previous.previousChangeRequestVersionId === current.previousChangeRequestVersionId &&
    previous.subjectVersion === current.subjectVersion && previous.sealedSnapshotChecksum === current.sealedSnapshotChecksum &&
    previous.sealedAt === current.sealedAt && previous.impactAnalysisEvidenceIds.length === current.impactAnalysisEvidenceIds.length &&
    previous.impactAnalysisEvidenceIds.every((value, index) => value === current.impactAnalysisEvidenceIds[index]) &&
    previous.privateFileRefs.length === current.privateFileRefs.length &&
    previous.privateFileRefs.every((value, index) => sameFileRef(value, current.privateFileRefs[index] as OpaquePrivateFileRef));
  if (!immutable) fail("CHANGE_REQUEST_APPROVED_SUBJECT_MUTATED", "Approved ECR version, impact evidence and private-file identities are immutable.");
}

/** Operational implementation/verification evidence may append; approved ECO identity may never change. */
export function assertChangeOrderEvidenceAppend(previous: ChangeOrderApprovalRecord, current: ChangeOrderApprovalRecord): void {
  const sameEmergency = (left: EmergencyRetrospectiveApprovalEvidence | undefined, right: EmergencyRetrospectiveApprovalEvidence | undefined) =>
    left === undefined && right === undefined || Boolean(left && right && left.emergencyExceptionId === right.emergencyExceptionId &&
      left.policyVersionId === right.policyVersionId && left.authorityCode === right.authorityCode && left.reason === right.reason &&
      left.riskAssessment === right.riskAssessment && left.temporaryAuthorityAssignmentId === right.temporaryAuthorityAssignmentId &&
      left.temporaryAuthorityUserId === right.temporaryAuthorityUserId && left.authorizedByUserId === right.authorizedByUserId &&
      left.authorizedByPositionId === right.authorizedByPositionId && left.validFrom === right.validFrom && left.validUntil === right.validUntil &&
      left.retrospectiveApprovalDueAt === right.retrospectiveApprovalDueAt && left.recordedAt === right.recordedAt &&
      left.evidenceIds.length === right.evidenceIds.length && left.evidenceIds.every((value, index) => value === right.evidenceIds[index]) &&
      left.privateFileRefs.length === right.privateFileRefs.length && left.privateFileRefs.every((value, index) => sameFileRef(value, right.privateFileRefs[index] as OpaquePrivateFileRef)));
  const sameIdentity = previous.approvalState === "RELEASED" && current.approvalState === previous.approvalState &&
    previous.changeOrderVersionId === current.changeOrderVersionId && previous.changeOrderId === current.changeOrderId &&
    previous.revisionNo === current.revisionNo && previous.previousChangeOrderVersionId === current.previousChangeOrderVersionId &&
    previous.sourceChangeRequestVersionId === current.sourceChangeRequestVersionId && previous.subjectVersion === current.subjectVersion &&
    previous.sealedSnapshotChecksum === current.sealedSnapshotChecksum && previous.sealedAt === current.sealedAt &&
    previous.releaseMode === current.releaseMode && sameEmergency(previous.emergencyEvidence, current.emergencyEvidence);
  if (!sameIdentity || !prefixEqual(previous.implementationEvidenceIds, current.implementationEvidenceIds, (a, b) => a === b) ||
    !prefixEqual(previous.verificationEvidenceIds, current.verificationEvidenceIds, (a, b) => a === b) ||
    !prefixEqual(previous.privateFileRefs, current.privateFileRefs, sameFileRef)) {
    fail("CHANGE_ORDER_APPROVED_IDENTITY_OR_EVIDENCE_MUTATED", "Approved ECO identity is immutable and operational evidence is append-only.");
  }
}

export interface ChangeApprovalAuthorityPolicy {
  /** Organization-owned, versioned authority taxonomy; never inferred from a translated label. */
  isOfficialChangeApprover(positionId: StableCode, basis: ChangeApprovalPolicyEntry["basis"]): boolean;
}

export interface ChangeApprovalPolicyEntry {
  readonly policy: ApprovalPolicyVersion;
  readonly line: readonly ResolvedStep[];
  readonly selectionPriority: number;
  readonly basis: { readonly kind: "INTERNAL_PRESET" | "CONTRACT_OVERRIDE" | "GOVERNMENT_AGREEMENT" | "MANDATORY_LAW"; readonly referenceId: StableCode; readonly version: number };
}

export interface ChangeApprovalPolicyRequest {
  readonly subjectKind: ChangeApprovalSubject["kind"];
  readonly at: UtcInstant;
  readonly selection: ApprovalPolicySelectionInput;
}

export function validateChangeApprovalPolicy(entry: ChangeApprovalPolicyEntry, authority: ChangeApprovalAuthorityPolicy): void {
  const { policy, line } = entry;
  if (policy.selection.subjectKinds.length !== 1 || !["CHANGE_REQUEST_VERSION", "CHANGE_ORDER_VERSION"].includes(policy.selection.subjectKinds[0] ?? "") ||
    policy.steps.length !== line.length || policy.steps.length === 0 || !Number.isSafeInteger(entry.selectionPriority) || entry.selectionPriority < 0 ||
    !Number.isSafeInteger(entry.basis.version) || entry.basis.version < 1) fail("CHANGE_APPROVAL_POLICY_INVALID", "Change policy metadata and exact resolved line are required.");
  let approvalCount = 0;
  for (const [index, rule] of policy.steps.entries()) {
    const step = line[index];
    if (!step || step.ruleId !== rule.ruleId || step.sequenceNo !== rule.sequenceNo || step.role !== rule.role || step.required !== rule.required ||
      step.completionMode !== (rule.completionMode ?? "SEQUENTIAL") || step.participants.length === 0) {
      throw new ChangeApprovalContractError("CHANGE_APPROVAL_POLICY_INVALID" as StableCode, "Resolved change line must exactly match its immutable policy rules.");
    }
    const includesSenior = rule.allowedPositionIds.includes("POSITION_SENIOR_RESEARCHER" as StableCode) || step.participants.some((p) => p.positionId === "POSITION_SENIOR_RESEARCHER");
    if (rule.role === "APPROVAL") {
      approvalCount += 1;
      if (!rule.required || includesSenior || rule.allowedPositionIds.length === 0 || !rule.allowedPositionIds.every((id) => authority.isOfficialChangeApprover(id, entry.basis)) ||
        !step.participants.every((p) => rule.allowedPositionIds.includes(p.positionId) && authority.isOfficialChangeApprover(p.positionId, entry.basis))) fail("CHANGE_APPROVAL_OFFICIAL_AUTHORITY_INVALID", "Senior review is not approval; required official approvers must satisfy the versioned Lab-Director-or-above authority policy.");
    } else if (includesSenior && rule.role !== "REVIEW") {
      fail("CHANGE_APPROVAL_SENIOR_ROLE_INVALID", "Senior evidence is REVIEW only and never official approval/agreement.");
    }
  }
  if (approvalCount === 0) fail("CHANGE_APPROVAL_OFFICIAL_STEP_REQUIRED", "At least one required official approval step is required.");
}

/** Selects only effective versioned policy data; no threshold or statutory value is embedded. */
export function selectChangeApprovalPolicy(entries: readonly ChangeApprovalPolicyEntry[], request: ChangeApprovalPolicyRequest,
  authority: ChangeApprovalAuthorityPolicy): ChangeApprovalPolicyEntry {
  const matches = entries.filter((entry) => {
    if (entry.policy.state !== "PUBLISHED" || request.at < entry.policy.effectiveFrom ||
      (entry.policy.effectiveTo !== undefined && request.at >= entry.policy.effectiveTo)) return false;
    validateChangeApprovalPolicy(entry, authority);
    return policyMatches(entry.policy, { ...request.selection, subjectKind: request.subjectKind });
  }).sort((left, right) => right.selectionPriority - left.selectionPriority);
  const selected = matches[0];
  if (!selected) throw new ChangeApprovalContractError("CHANGE_APPROVAL_POLICY_NOT_FOUND" as StableCode, "No effective versioned policy matches the change subject and selection input.");
  if (matches[1]?.selectionPriority === selected.selectionPriority) fail("CHANGE_APPROVAL_POLICY_AMBIGUOUS", "Multiple change policies match at the same priority.");
  return selected;
}

export interface ChangeVendorProjection {
  readonly changeKind: "ECR" | "ECO";
  readonly recordId: Uuid;
  readonly revisionNo: number;
  readonly publicState: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED" | "CANCELLED";
  readonly vendorResponsibilityPreserved: true;
}

/** Explicit allowlist projection: no Approval line, internal deliberation, actor or private-file metadata. */
export function projectChangeForVendor(record: ChangeRequestApprovalRecord | ChangeOrderApprovalRecord): ChangeVendorProjection {
  const request = "changeRequestVersionId" in record;
  return { changeKind: request ? "ECR" : "ECO", recordId: request ? record.changeRequestVersionId : record.changeOrderVersionId,
    revisionNo: record.revisionNo, publicState: record.approvalState === "APPROVAL_PENDING" ? "PENDING" : record.approvalState === "RELEASED" ? "APPROVED" : record.approvalState,
    vendorResponsibilityPreserved: true };
}

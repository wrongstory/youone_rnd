import type { ApprovalOutcomeInput, ApprovalOutcomeProvenance, ApprovalPolicyVersion, ApprovalSubject, ApprovalSubjectSnapshot, ResolvedStep, TypedApprovalSubjectPort } from "@youone/core-approval/public";
import type { Sha256, StableCode, Uuid, Version } from "@youone/shared-kernel/public";
import type { ResearchApplicationCommand, ResearchApplicationMutation, ResearchProjectApplicationSnapshot, ResearchProjectDesignationSnapshot } from "../domain/designation.js";
import { FormalResearchDesignationError, ResearchProjectApplication } from "../domain/designation.js";

export type ResearchProjectApplicationSubject = Extract<ApprovalSubject, { kind: "RESEARCH_PROJECT_APPLICATION" }>;

export function validateFormalResearchApprovalPolicy(policy: ApprovalPolicyVersion, line: readonly ResolvedStep[]): void {
  const rule = policy.steps[0];
  const step = line[0];
  const invalidPolicy = policy.selection.subjectKinds.length !== 1 || policy.selection.subjectKinds[0] !== "RESEARCH_PROJECT_APPLICATION" || policy.steps.length !== 1 || !rule || !rule.required || rule.sequenceNo !== 1 || rule.role !== "APPROVAL" || (rule.completionMode ?? "SEQUENTIAL") !== "SEQUENTIAL" || rule.allowedPositionIds.length !== 1 || rule.allowedPositionIds[0] !== "POSITION_LAB_DIRECTOR" || rule.allowedRoleIds.length !== 0 || rule.specificUserId !== undefined;
  const invalidLine = line.length !== 1 || !step || !step.required || step.sequenceNo !== 1 || step.role !== "APPROVAL" || step.completionMode !== "SEQUENTIAL" || step.participants.length !== 1 || step.participants[0]?.positionId !== "POSITION_LAB_DIRECTOR";
  if (invalidPolicy || invalidLine) throw new FormalResearchDesignationError("RP_APPROVAL_POLICY_INVALID" as StableCode, "Designation requires exactly one required sequential Lab Director approval rule and participant; Senior and Representative are forbidden.");
}

export interface ResearchApplicationStore {
  loadExact(applicationVersionId: Uuid): Promise<ResearchProjectApplicationSnapshot | null>;
  loadPrevious(applicationVersionId: Uuid): Promise<ResearchProjectApplicationSnapshot | null>;
}
export interface VerifiedResearchApprovalOutcomePort {
  /** Re-loads the ApprovalInstance, terminal action and exact policy/line/action evidence in the same transaction before applying an outcome. */
  applyVerifiedOutcome(input: ApprovalOutcomeInput & { readonly decision: ResearchApprovalDecision }): Promise<void>;
}

export type ResearchApprovalDecision = "CONSENT" | "REJECT" | "RETURN" | "CANCEL";
export const RESEARCH_APPLICATION_RETURN_REASON_CODE = "RP-RETURNED-FOR-REVISION" as const;
export type ResearchApprovalTerminalProvenance = ApprovalOutcomeProvenance;
export interface ResearchApprovalTerminalProvenancePort {
  /** Must fail when return versus reject versus recall cannot be proven from immutable Approval actions. */
  loadVerifiedTerminal(input: { readonly approvalInstanceId: Uuid; readonly approvalVersion: Version }): Promise<ApprovalOutcomeProvenance>;
}

export class ResearchProjectApplicationApprovalSubjectAdapter implements TypedApprovalSubjectPort<ResearchProjectApplicationSubject> {
  public readonly kind = "RESEARCH_PROJECT_APPLICATION" as const;
  public constructor(private readonly store: ResearchApplicationStore, private readonly outcomes: VerifiedResearchApprovalOutcomePort) {}
  public async sealExactVersion(subject: ResearchProjectApplicationSubject): Promise<ApprovalSubjectSnapshot> {
    const application = await this.requireExact(subject.researchProjectApplicationVersionId);
    if (application.state !== "DIRECTOR_REVIEW_PENDING" || !application.sealedSnapshotChecksum || !application.sealedAt) throw new FormalResearchDesignationError("RP_EXACT_SEALED_VERSION_REQUIRED" as StableCode, "Only the exact sealed pending version may be submitted.");
    return { subject, subjectVersion: application.revisionNo as Version, checksum: application.sealedSnapshotChecksum, sealedAt: application.sealedAt };
  }
  public async assertExactVersion(snapshot: ApprovalSubjectSnapshot): Promise<void> {
    if (snapshot.subject.kind !== this.kind) throw new FormalResearchDesignationError("RP_APPROVAL_SUBJECT_KIND_INVALID" as StableCode, "Approval subject kind mismatch.");
    const application = await this.requireExact(snapshot.subject.researchProjectApplicationVersionId);
    if (application.revisionNo !== snapshot.subjectVersion || application.sealedSnapshotChecksum !== snapshot.checksum || application.sealedAt !== snapshot.sealedAt) throw new FormalResearchDesignationError("RP_APPROVAL_SUBJECT_MISMATCH" as StableCode, "Approval does not reference the exact immutable application version.");
  }
  public async assertResubmissionLineage(input: { readonly previous: ApprovalSubjectSnapshot; readonly current: ApprovalSubjectSnapshot }): Promise<void> {
    await this.assertExactVersion(input.previous); await this.assertExactVersion(input.current);
    if (input.previous.subject.kind !== this.kind || input.current.subject.kind !== this.kind) throw new FormalResearchDesignationError("RP_RESUBMISSION_LINEAGE_INVALID" as StableCode, "Subject kind mismatch.");
    const previous = await this.requireExact(input.previous.subject.researchProjectApplicationVersionId);
    const current = await this.requireExact(input.current.subject.researchProjectApplicationVersionId);
    const storedPrevious = await this.store.loadPrevious(current.applicationVersionId);
    if (previous.applicationRootId !== current.applicationRootId || previous.projectId !== current.projectId || current.previousApplicationVersionId !== previous.applicationVersionId || storedPrevious?.applicationVersionId !== previous.applicationVersionId || current.revisionNo <= previous.revisionNo) throw new FormalResearchDesignationError("RP_RESUBMISSION_LINEAGE_INVALID" as StableCode, "Resubmission must be the strict direct successor for the same Project and application root.");
  }
  public async applyApprovalOutcome(input: ApprovalOutcomeInput): Promise<void> {
    await this.assertExactVersion(input.snapshot);
    const expectedAction = { COMPLETED: "APPROVE", REJECTED: "REJECT", RECALLED: "RECALL", CANCELLED: "CANCEL" } as const;
    if (input.provenance.terminalAction.kind !== expectedAction[input.outcome]) throw new FormalResearchDesignationError("RP_APPROVAL_OUTCOME_PROVENANCE_INVALID" as StableCode, "Terminal Approval action does not match the research designation outcome.");
    const decision: ResearchApprovalDecision = input.outcome === "COMPLETED"
      ? "CONSENT"
      : input.outcome === "REJECTED"
        ? input.provenance.terminalReasonCode === RESEARCH_APPLICATION_RETURN_REASON_CODE ? "RETURN" : "REJECT"
        : input.outcome === "RECALLED" ? "RETURN" : "CANCEL";
    await this.outcomes.applyVerifiedOutcome({ ...input, decision });
  }
  private async requireExact(id: Uuid): Promise<ResearchProjectApplicationSnapshot> { const application = await this.store.loadExact(id); if (!application) throw new FormalResearchDesignationError("RP_APPLICATION_NOT_FOUND" as StableCode, "Research application version was not found."); return application; }
}

export interface ResearchApplicationRepository { loadForUpdate(applicationVersionId: Uuid): Promise<ResearchProjectApplicationSnapshot | null>; assertDirectNewerLineage(snapshot: ResearchProjectApplicationSnapshot): Promise<void>; insert(snapshot: ResearchProjectApplicationSnapshot): Promise<void>; save(snapshot: ResearchProjectApplicationSnapshot, expectedVersion: Version): Promise<boolean>; insertDesignation(snapshot: ResearchProjectDesignationSnapshot): Promise<boolean> }
export interface ResearchApplicationSnapshotHashPort { computeExactChecksum(snapshot: ResearchProjectApplicationSnapshot): Promise<Sha256> }
export interface ResearchProjectApplicationAuthorizationPort { assertMayCreateApplication(input: { readonly projectId: Uuid; readonly applicantUserId: Uuid }): Promise<void> }
export interface ResearchDesignationEvidencePort { appendTransition(mutation: ResearchApplicationMutation): Promise<void>; appendAudit(mutation: ResearchApplicationMutation): Promise<void>; enqueue(event: ResearchApplicationMutation["event"]): Promise<void> }
export interface ResearchDesignationTransactionContext { readonly applications: ResearchApplicationRepository; readonly projectAuthorization: ResearchProjectApplicationAuthorizationPort; readonly snapshotHashes: ResearchApplicationSnapshotHashPort; readonly evidence: ResearchDesignationEvidencePort }
export interface ResearchDesignationUnitOfWork { transact<T>(work: (context: ResearchDesignationTransactionContext) => Promise<T>): Promise<T> }
async function appendResearchEvidence(context: ResearchDesignationTransactionContext, mutation: ResearchApplicationMutation): Promise<void> { await context.evidence.appendTransition(mutation); await context.evidence.appendAudit(mutation); await context.evidence.enqueue(mutation.event); }
export async function persistResearchApplicationCreation(unitOfWork: ResearchDesignationUnitOfWork, mutation: ResearchApplicationMutation): Promise<void> { if (mutation.expectedVersion !== 0 || mutation.application.version !== 1 || mutation.event.eventType !== "EVT-RP-APPLICATION-CREATE") throw new FormalResearchDesignationError("RP_CREATE_MUTATION_INVALID" as StableCode, "Application creation must be the canonical version 0 to 1 transition."); await unitOfWork.transact(async (context) => { await context.projectAuthorization.assertMayCreateApplication({ projectId: mutation.application.projectId, applicantUserId: mutation.application.applicantUserId }); if (mutation.application.previousApplicationVersionId) await context.applications.assertDirectNewerLineage(mutation.application); await context.applications.insert(mutation.application); await appendResearchEvidence(context, mutation); }); }
export async function sealResearchApplication(unitOfWork: ResearchDesignationUnitOfWork, input: { readonly applicationVersionId: Uuid; readonly approvalInstanceId: Uuid; readonly command: ResearchApplicationCommand }): Promise<ResearchProjectApplicationSnapshot> { return unitOfWork.transact(async (context) => { const current = await context.applications.loadForUpdate(input.applicationVersionId); if (!current) throw new FormalResearchDesignationError("RP_APPLICATION_NOT_FOUND" as StableCode, "Research application version was not found."); const checksum = await context.snapshotHashes.computeExactChecksum(current); const mutation = ResearchProjectApplication.restore(current).sealAndSubmit(input.command, { checksum, approvalInstanceId: input.approvalInstanceId }); if (!await context.applications.save(mutation.application, mutation.expectedVersion)) throw new FormalResearchDesignationError("RP_STALE_VERSION" as StableCode, "Concurrent application seal lost optimistic lock."); await appendResearchEvidence(context, mutation); return mutation.application; }); }
export async function persistResearchApplicationMutation(unitOfWork: ResearchDesignationUnitOfWork, mutation: ResearchApplicationMutation): Promise<void> { if (mutation.expectedVersion === 0) throw new FormalResearchDesignationError("RP_CREATE_COMMIT_REQUIRED" as StableCode, "Application creation requires the explicit creation transaction function."); await unitOfWork.transact(async (context) => { if (!await context.applications.save(mutation.application, mutation.expectedVersion)) throw new FormalResearchDesignationError("RP_STALE_VERSION" as StableCode, "Concurrent application mutation lost optimistic lock."); if (mutation.designation && !await context.applications.insertDesignation(mutation.designation)) throw new FormalResearchDesignationError("RP_DESIGNATION_ALREADY_EXISTS" as StableCode, "The exact application version already has a designation."); await appendResearchEvidence(context, mutation); }); }

export interface FormalResearchStatusView { readonly projectId: string; readonly status: "ORDINARY_PROJECT" | "FORMAL_RESEARCH_PROJECT"; readonly designationId?: string; readonly applicationRevisionNo?: number; readonly validFrom?: string; readonly validUntil?: string }
export type FormalResearchStatusResult = { readonly availability: "AVAILABLE"; readonly status: FormalResearchStatusView } | { readonly availability: "UNAVAILABLE"; readonly status: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface FormalResearchDesignationQueryPort { getByProject(projectId: string): Promise<FormalResearchStatusResult> }

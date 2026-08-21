import type { StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import { approvalPermissionForAction, type ApprovalAuditObligation, type ApprovalDomainEvent, type ApprovalInstanceSnapshot, type ApprovalMutation, type ApprovalSubject, type ApprovalSubjectSnapshot } from "../domain/approval.js";

export interface TypedApprovalSubjectPort<S extends ApprovalSubject = ApprovalSubject> {
  readonly kind: S["kind"];
  sealExactVersion(subject: S): Promise<ApprovalSubjectSnapshot>;
  assertExactVersion(snapshot: ApprovalSubjectSnapshot): Promise<void>;
  /** Resolves both exact version IDs server-side and rejects different roots, non-new versions, or checksum mismatch. */
  assertResubmissionLineage(input: { readonly previous: ApprovalSubjectSnapshot; readonly current: ApprovalSubjectSnapshot }): Promise<void>;
  applyApprovalOutcome(input: { snapshot: ApprovalSubjectSnapshot; approvalInstanceId: Uuid; approvalVersion: Version; outcome: "COMPLETED"|"REJECTED"|"RECALLED"|"CANCELLED" }): Promise<void>;
}
export interface ApprovalSubjectPortRegistry { get<S extends ApprovalSubject>(kind: S["kind"]): TypedApprovalSubjectPort<S> }
export interface ActingAuthorityValidationPort {
  /** Revalidates existence, selection, non-revocation, time window, delegate, grantor and action at command time. */
  assertActive(input: { assignmentId: Uuid; evidenceId: Uuid; authenticatedUserId: Uuid; effectiveUserId: Uuid; action: StableCode; at: UtcInstant }): Promise<void>;
}
export interface ApprovalRepository {
  loadForUpdate(approvalInstanceId: Uuid): Promise<ApprovalInstanceSnapshot | null>;
  insert(snapshot: ApprovalInstanceSnapshot): Promise<void>;
  save(snapshot: ApprovalInstanceSnapshot, expectedVersion: Version): Promise<boolean>;
}
export interface ApprovalEvidencePort {
  appendAction(action: ApprovalMutation["appendedAction"]): Promise<void>;
  appendAudit(obligation: ApprovalAuditObligation): Promise<void>;
  enqueue(events: readonly ApprovalDomainEvent[]): Promise<void>;
}
export interface ApprovalTransactionContext { readonly approvals: ApprovalRepository; readonly evidence: ApprovalEvidencePort; readonly subjects: ApprovalSubjectPortRegistry; readonly actingAuthorities: ActingAuthorityValidationPort }
export interface ApprovalUnitOfWork { transact<T>(work: (context: ApprovalTransactionContext) => Promise<T>): Promise<T> }
export interface ApprovalInboxItem { readonly approvalInstanceId: Uuid; readonly state: ApprovalInstanceSnapshot["state"]; readonly subjectKind: ApprovalSubject["kind"]; readonly submitterDisplayName: string; readonly submittedAt: UtcInstant; readonly pendingRole: "REVIEW"|"AGREEMENT"|"APPROVAL"|"REFERENCE" }
export type ApprovalInboxResult = { readonly availability: "AVAILABLE"; readonly items: readonly ApprovalInboxItem[] } | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface ApprovalDetailView {
  readonly approvalInstanceId: Uuid; readonly generation: number; readonly previousInstanceId?: Uuid; readonly state: ApprovalInstanceSnapshot["state"];
  readonly subjectKind: ApprovalSubject["kind"]; readonly subjectVersion: Version; readonly subjectChecksum: string;
  readonly sealedLine: readonly { readonly stepId: Uuid; readonly role: "REVIEW"|"AGREEMENT"|"APPROVAL"|"REFERENCE"; readonly completionMode: "SEQUENTIAL"|"ANY_ONE"|"ALL"|"SPECIFIC"; readonly required: boolean; readonly participants: readonly { readonly participantId: Uuid; readonly displayName: string; readonly positionId: StableCode }[] }[];
  readonly timeline: readonly { readonly actionId: Uuid; readonly kind: string; readonly at: UtcInstant; readonly actorDisplayName: string }[];
  readonly actions: readonly { readonly actionId: StableCode; readonly label: string; readonly authorized: boolean; readonly commandAvailable: boolean; readonly decisionId: Uuid; readonly evaluatedAt: UtcInstant; readonly evidenceIds: readonly Uuid[]; readonly obligations: readonly StableCode[]; readonly denyReasonCode?: StableCode }[];
}
export type ApprovalDetailResult = { readonly availability: "AVAILABLE"; readonly detail: ApprovalDetailView } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface ApprovalInboxQueryPort { listMine(): Promise<ApprovalInboxResult>; getMine(approvalInstanceId: Uuid): Promise<ApprovalDetailResult> }
export interface ApprovalCommandPort { execute(input: { readonly approvalInstanceId: Uuid; readonly actionId: StableCode; readonly expectedVersion: Version; readonly idempotencyKey: string }): Promise<ApprovalInstanceSnapshot> }
export class ApprovalConcurrencyError extends Error { readonly code = "APPROVAL_STALE_VERSION" as StableCode; }
export class ApprovalSubjectLineageError extends Error { readonly code = "APPROVAL_RESUBMISSION_LINEAGE_INVALID" as StableCode; }
export async function persistApprovalMutation(context: ApprovalTransactionContext, mutation: ApprovalMutation): Promise<void> {
  if (!await context.approvals.save(mutation.instance, mutation.expectedVersion)) throw new ApprovalConcurrencyError("Concurrent approval action lost optimistic lock.");
  await context.evidence.appendAction(mutation.appendedAction);
  await context.evidence.appendAudit(mutation.audit);
  await context.evidence.enqueue(mutation.events);
}

/**
 * Required application transaction boundary. Adapters must bind this callback to one DB transaction;
 * partial subject/outbox/audit commits are forbidden.
 */
export async function commitApprovalMutation(unitOfWork: ApprovalUnitOfWork, mutation: ApprovalMutation): Promise<void> {
  await unitOfWork.transact(async (context) => {
    const actor = mutation.appendedAction.actor;
    const authority = actor.actingAuthority;
    if (authority && actor.authenticatedUserId && actor.effectiveUserId) {
      const action = approvalPermissionForAction(mutation.appendedAction.kind);
      await context.actingAuthorities.assertActive({ assignmentId: authority.assignmentId, evidenceId: authority.evidenceId, authenticatedUserId: actor.authenticatedUserId, effectiveUserId: actor.effectiveUserId, action: action as StableCode, at: mutation.appendedAction.at });
    }
    const submission = mutation.instance.submission;
    if (submission) {
      const port = context.subjects.get(submission.subject.subject.kind);
      await port.assertExactVersion(submission.subject);
      const previous = mutation.instance.resubmissionOfSubject;
      if (previous) {
        if (previous.subject.kind !== submission.subject.subject.kind || Number(submission.subject.subjectVersion) <= Number(previous.subjectVersion)) throw new ApprovalSubjectLineageError("Resubmission must keep the subject kind and advance its immutable version.");
        await port.assertResubmissionLineage({ previous, current: submission.subject });
      }
    }
    await persistApprovalMutation(context, mutation);
    if (submission && ["COMPLETED", "REJECTED", "RECALLED", "CANCELLED"].includes(mutation.instance.state)) {
      await context.subjects.get(submission.subject.subject.kind).applyApprovalOutcome({ snapshot: submission.subject, approvalInstanceId: mutation.instance.approvalInstanceId, approvalVersion: mutation.instance.version, outcome: mutation.instance.state as "COMPLETED"|"REJECTED"|"RECALLED"|"CANCELLED" });
    }
  });
}

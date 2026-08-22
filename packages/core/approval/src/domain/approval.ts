import type { CorrelationId, IdempotencyKey, Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";

export const APPROVAL_MACHINE_ID = "SM-APPROVAL-V1" as const;
export type ApprovalState = "DRAFT" | "SUBMITTED" | "IN_PROGRESS" | "REJECTED" | "RECALL_REQUESTED" | "RECALLED" | "COMPLETED" | "CANCELLED";
export type ApprovalStepState = "WAITING" | "ACTIVE" | "REVIEWED" | "AGREED" | "APPROVED" | "REJECTED" | "SKIPPED_BY_POLICY" | "CANCELLED";
export type ApprovalRole = "REVIEW" | "AGREEMENT" | "APPROVAL" | "REFERENCE";
export type CompletionMode = "SEQUENTIAL" | "ANY_ONE" | "ALL" | "SPECIFIC";
export type ApprovalActionKind = "SUBMIT" | "ACTIVATE" | "REVIEW" | "AGREE" | "APPROVE" | "REFERENCE_RECEIPT" | "REJECT" | "REQUEST_RECALL" | "RECALL" | "CANCEL" | "COMPLETE";
export type ApprovalSubject =
  | { kind: "DOCUMENT_VERSION"; documentVersionId: Uuid }
  | { kind: "RESEARCH_PROJECT_APPLICATION"; researchProjectApplicationVersionId: Uuid }
  | { kind: "PURCHASE_REQUEST_VERSION"; purchaseRequestVersionId: Uuid }
  | { kind: "CONTRACT_VERSION"; contractVersionId: Uuid }
  | { kind: "TECHNICAL_ACCESS_REQUEST"; technicalAccessRequestId: Uuid }
  | { kind: "TECHNICAL_COPY_REQUEST"; technicalCopyRequestId: Uuid }
  | { kind: "ACCEPTANCE_PAYMENT_DECISION"; acceptancePaymentDecisionId: Uuid }
  | { kind: "CHANGE_REQUEST_VERSION"; changeRequestVersionId: Uuid }
  | { kind: "CHANGE_ORDER_VERSION"; changeOrderVersionId: Uuid }
  | { kind: "APPROVAL_POLICY_VERSION"; approvalPolicyVersionId: Uuid };

/** Stable business event IDs. eventId remains the unique envelope/outbox UUID. */
export const APPROVAL_EVENT_IDS = {
  SUBMITTED: "EVT-APPROVAL-SUBMITTED", ACTIVATED: "EVT-APPROVAL-ACTIVATED", REVIEWED: "EVT-APPROVAL-REVIEWED",
  AGREED: "EVT-APPROVAL-AGREED", APPROVED: "EVT-APPROVAL-APPROVED", REFERENCE_RECEIVED: "EVT-APPROVAL-REFERENCE-RECEIVED", REJECTED: "EVT-APPROVAL-REJECTED",
  RECALL_REQUESTED: "EVT-APPROVAL-RECALL-REQUESTED", RECALLED: "EVT-APPROVAL-RECALLED", CANCELLED: "EVT-APPROVAL-CANCELLED", COMPLETED: "EVT-APPROVAL-COMPLETED"
} as const;

export interface ApprovalSubjectSnapshot { readonly subject: ApprovalSubject; readonly subjectVersion: Version; readonly checksum: Sha256; readonly sealedAt: UtcInstant }
export interface AmountBand { readonly currency: string; readonly minInclusive?: string; readonly maxExclusive?: string }
export interface PolicySelection {
  readonly subjectKinds: readonly ApprovalSubject["kind"][];
  readonly documentTypeIds: readonly StableCode[];
  readonly securityLevels: readonly ("L1" | "L2" | "L3" | "L4")[];
  readonly amountBand?: AmountBand;
  readonly strengthenedRisk: "ANY" | "REQUIRED" | "EXCLUDED";
}
export interface ApprovalPolicySelectionInput { readonly documentTypeId?: StableCode; readonly securityLevel?: "L1"|"L2"|"L3"|"L4"; readonly amount?: { readonly currency: string; readonly value: string }; readonly strengthenedRisk: boolean }
export interface ApprovalPolicyStepRule {
  readonly ruleId: Uuid; readonly sequenceNo: number; readonly role: ApprovalRole; readonly completionMode?: CompletionMode; readonly required: boolean;
  readonly allowedPositionIds: readonly StableCode[]; readonly allowedRoleIds: readonly StableCode[]; readonly specificUserId?: Uuid;
}
export interface ApprovalPolicyVersion {
  readonly policyVersionId: Uuid; readonly policyId: StableCode; readonly version: number; readonly checksum: Sha256;
  readonly state: "DRAFT" | "PUBLISHED" | "RETIRED"; readonly effectiveFrom: UtcInstant; readonly effectiveTo?: UtcInstant;
  readonly selection: PolicySelection; readonly recallAllowed: boolean; readonly steps: readonly ApprovalPolicyStepRule[];
}
export interface ActingAuthoritySnapshot {
  readonly assignmentId: Uuid; readonly evidenceId: Uuid; readonly grantorUserId: Uuid; readonly delegateUserId: Uuid;
  readonly representedPositionId: StableCode; readonly allowedActionIds: readonly StableCode[]; readonly validFrom: UtcInstant; readonly validTo: UtcInstant; readonly reason: string;
}
export interface ApprovalActorSnapshot {
  readonly actorType: "USER" | "SYSTEM"; readonly accountKind: "INTERNAL"|"VENDOR"|"SYSTEM"; readonly authenticatedUserId?: Uuid; readonly effectiveUserId?: Uuid;
  readonly positionIds: readonly StableCode[]; readonly roleIds: readonly StableCode[]; readonly actingAuthority?: ActingAuthoritySnapshot;
}
export interface ResolvedParticipant { readonly participantId: Uuid; readonly userId: Uuid; readonly positionId: StableCode; readonly roleIds: readonly StableCode[]; readonly order: number }
export interface ResolvedStep { readonly stepId: Uuid; readonly ruleId: Uuid; readonly sequenceNo: number; readonly role: ApprovalRole; readonly completionMode: CompletionMode; readonly required: boolean; readonly participants: readonly ResolvedParticipant[] }
export interface ApprovalSubmissionSnapshot { readonly submittedAt: UtcInstant; readonly submittedBy: ApprovalActorSnapshot; readonly subject: ApprovalSubjectSnapshot; readonly policy: ApprovalPolicyVersion; readonly policySelectionInput: ApprovalPolicySelectionInput; readonly line: readonly ResolvedStep[] }
export interface ApprovalAction { readonly actionId: Uuid; readonly kind: ApprovalActionKind; readonly at: UtcInstant; readonly actor: ApprovalActorSnapshot; readonly stepId?: Uuid; readonly participantId?: Uuid; readonly reasonCode?: StableCode; readonly comment?: string }
export interface ApprovalDomainEvent { readonly eventId: Uuid; readonly eventType: StableCode; readonly aggregateId: Uuid; readonly aggregateVersion: Version; readonly occurredAt: UtcInstant; readonly correlationId: CorrelationId; readonly idempotencyKey: IdempotencyKey; readonly payload: Readonly<Record<string, string | number | boolean | null>> }
export interface ApprovalAuditObligation { readonly eventType: StableCode; readonly actor: ApprovalActorSnapshot; readonly aggregateId: Uuid; readonly actionId: Uuid; readonly occurredAt: UtcInstant; readonly correlationId: CorrelationId; readonly metadata: Readonly<Record<string, string | number | boolean | null>> }
export interface ApprovalMutation { readonly expectedVersion: Version; readonly instance: ApprovalInstanceSnapshot; readonly appendedAction: ApprovalAction; readonly events: readonly ApprovalDomainEvent[]; readonly audit: ApprovalAuditObligation }
export interface ApprovalInstanceSnapshot {
  readonly approvalInstanceId: Uuid; readonly generation: number; readonly previousInstanceId?: Uuid; readonly submitterUserId: Uuid;
  readonly state: ApprovalState; readonly version: Version; readonly resubmissionOfSubject?: ApprovalSubjectSnapshot; readonly submission?: ApprovalSubmissionSnapshot; readonly steps: readonly ApprovalRuntimeStep[]; readonly actions: readonly ApprovalAction[];
}
export interface ApprovalRuntimeParticipant extends ResolvedParticipant { state: "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED" }
export interface ApprovalRuntimeStep extends Omit<ResolvedStep, "participants"> { state: ApprovalStepState; readonly participants: readonly ApprovalRuntimeParticipant[] }

export class ApprovalDomainError extends Error { constructor(readonly code: StableCode, message: string) { super(message); this.name = "ApprovalDomainError"; } }
const fail = (code: string, message: string): never => { throw new ApprovalDomainError(code as StableCode, message); };
function present<T>(value: T | undefined, code: string, message: string): T { if (value === undefined) return fail(code, message); return value; }
const copy = <T>(value: T): T => structuredClone(value);
const officialPositions = new Set(["POSITION_LAB_DIRECTOR", "POSITION_REPRESENTATIVE"]);
const seniorPositions = new Set(["POSITION_SENIOR_RESEARCHER"]);

export function approvalPermissionForAction(kind: ApprovalActionKind): StableCode {
  const permissions: Partial<Record<ApprovalActionKind, string>> = {
    REVIEW: "approval.step.review",
    AGREE: "approval.step.agree",
    APPROVE: "approval.step.approve",
    REFERENCE_RECEIPT: "approval.step.reference",
    REJECT: "approval.step.reject"
  };
  const permission = permissions[kind];
  if (!permission) fail("APPROVAL_STEP_PERMISSION_UNDEFINED", `No step permission for approval action ${kind}.`);
  return permission as StableCode;
}

export function normalizePolicy(policy: ApprovalPolicyVersion): ApprovalPolicyVersion {
  if (policy.state !== "PUBLISHED" || policy.steps.length === 0) fail("APPROVAL_POLICY_NOT_ACTIVE", "A published policy with steps is required.");
  const steps = policy.steps.map((rule) => {
    if (!Number.isInteger(rule.sequenceNo) || rule.sequenceNo < 1) fail("APPROVAL_POLICY_SEQUENCE_INVALID", "sequenceNo must be a positive integer.");
    if (rule.role === "APPROVAL" && rule.allowedPositionIds.some((p) => seniorPositions.has(p))) fail("APPROVAL_SENIOR_OFFICIAL_AUTHORITY_FORBIDDEN", "Senior Researcher cannot hold official approval authority.");
    const completionMode = rule.completionMode ?? (rule.allowedPositionIds.includes("POSITION_REPRESENTATIVE" as StableCode) ? "ANY_ONE" : "SEQUENTIAL");
    if (completionMode === "SPECIFIC" && !rule.specificUserId) fail("APPROVAL_SPECIFIC_USER_REQUIRED", "SPECIFIC mode requires a user.");
    return { ...rule, completionMode };
  });
  return copy({ ...policy, steps });
}

function decimalUnits(value: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) fail("APPROVAL_AMOUNT_INVALID", "Amounts must be non-negative decimals with at most six fraction digits.");
  const [whole, fraction = ""] = value.split("."); return BigInt(whole ?? "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}
export function policyMatches(policy: ApprovalPolicyVersion, input: ApprovalPolicySelectionInput & { subjectKind: ApprovalSubject["kind"] }): boolean {
  const s = policy.selection;
  if (!s.subjectKinds.includes(input.subjectKind)) return false;
  if (s.documentTypeIds.length && (!input.documentTypeId || !s.documentTypeIds.includes(input.documentTypeId))) return false;
  if (s.securityLevels.length && (!input.securityLevel || !s.securityLevels.includes(input.securityLevel))) return false;
  if (s.strengthenedRisk === "REQUIRED" && !input.strengthenedRisk || s.strengthenedRisk === "EXCLUDED" && input.strengthenedRisk) return false;
  if (s.amountBand) {
    if (!input.amount || input.amount.currency !== s.amountBand.currency) return false;
    const v = decimalUnits(input.amount.value);
    if (s.amountBand.minInclusive && v < decimalUnits(s.amountBand.minInclusive)) return false;
    if (s.amountBand.maxExclusive && v >= decimalUnits(s.amountBand.maxExclusive)) return false;
  }
  return true;
}

export function validateResolvedLine(policy: ApprovalPolicyVersion, line: readonly ResolvedStep[]): void {
  if (line.length !== policy.steps.length) fail("APPROVAL_LINE_POLICY_MISMATCH", "Each policy rule must resolve to exactly one step.");
  const ids = new Set<string>();
  for (const rule of policy.steps) {
    const step = present(line.find((s) => s.ruleId === rule.ruleId), "APPROVAL_LINE_POLICY_MISMATCH", "A policy rule has no resolved step.");
    if (step.role !== rule.role || step.sequenceNo !== rule.sequenceNo) fail("APPROVAL_LINE_POLICY_MISMATCH", "Resolved step differs from its policy rule.");
    const expectedMode = rule.completionMode ?? (rule.allowedPositionIds.includes("POSITION_REPRESENTATIVE" as StableCode) ? "ANY_ONE" : "SEQUENTIAL");
    if (step.required !== rule.required || step.completionMode !== expectedMode) fail("APPROVAL_LINE_POLICY_MISMATCH", "Required and completion mode are policy-owned.");
    if (ids.has(step.stepId)) fail("APPROVAL_LINE_DUPLICATE_ID", "Step ids must be unique."); ids.add(step.stepId);
    if (step.required && step.participants.length === 0) fail("APPROVAL_LINE_PARTICIPANT_REQUIRED", "Required step needs participants.");
    for (const p of step.participants) {
      if (ids.has(p.participantId)) fail("APPROVAL_LINE_DUPLICATE_ID", "Participant ids must be unique."); ids.add(p.participantId);
      if (rule.specificUserId && p.userId !== rule.specificUserId) fail("APPROVAL_LINE_SPECIFIC_USER_MISMATCH", "SPECIFIC participant mismatch.");
      if (!rule.allowedPositionIds.includes(p.positionId)) fail("APPROVAL_LINE_POSITION_FORBIDDEN", "Participant position is outside the policy rule.");
      if (rule.allowedRoleIds.length && !p.roleIds.some((r) => rule.allowedRoleIds.includes(r))) fail("APPROVAL_LINE_ROLE_FORBIDDEN", "Participant role is outside the policy rule.");
      if (rule.role === "APPROVAL" && (!officialPositions.has(p.positionId) || seniorPositions.has(p.positionId))) fail("APPROVAL_OFFICIAL_AUTHORITY_INVALID", "Only Director or Representative may approve.");
    }
  }
}
export function validateResearchProjectDesignationLine(line: readonly ResolvedStep[]): void {
  if (line.length !== 1) fail("APPROVAL_RESEARCH_DESIGNATION_LINE_INVALID", "Formal research designation requires exactly one step.");
  const step = present(line[0], "APPROVAL_RESEARCH_DESIGNATION_LINE_INVALID", "Formal research designation requires one step.");
  if (!step.required || step.role !== "APPROVAL" || step.completionMode !== "SEQUENTIAL" || step.participants.length !== 1) fail("APPROVAL_RESEARCH_DESIGNATION_LINE_INVALID", "Formal research designation is Lab Director-only.");
  const participant = present(step.participants[0], "APPROVAL_RESEARCH_DESIGNATION_LINE_INVALID", "Lab Director participant is required.");
  if (participant.positionId !== "POSITION_LAB_DIRECTOR") fail("APPROVAL_RESEARCH_DESIGNATION_LINE_INVALID", "Senior and Representative are not part of designation.");
}

/**
 * Subject-specific policy guard for formal-research designation. The resolved
 * line alone is insufficient because a generic policy could resolve only its
 * Director candidate while retaining Senior or Representative candidates in
 * the immutable policy snapshot.
 */
export function validateResearchProjectDesignationPolicy(policy: ApprovalPolicyVersion, line: readonly ResolvedStep[]): void {
  if (policy.selection.subjectKinds.length !== 1 || policy.selection.subjectKinds[0] !== "RESEARCH_PROJECT_APPLICATION") {
    fail("APPROVAL_RESEARCH_DESIGNATION_POLICY_INVALID", "Formal research designation requires a dedicated subject policy.");
  }
  if (policy.steps.length !== 1) fail("APPROVAL_RESEARCH_DESIGNATION_POLICY_INVALID", "Formal research designation requires exactly one policy step.");
  const step = present(policy.steps[0], "APPROVAL_RESEARCH_DESIGNATION_POLICY_INVALID", "Formal research designation requires one policy step.");
  if (!step.required || step.sequenceNo !== 1 || step.role !== "APPROVAL" || step.completionMode !== "SEQUENTIAL") {
    fail("APPROVAL_RESEARCH_DESIGNATION_POLICY_INVALID", "The Lab Director consent step must be required, first, APPROVAL, and SEQUENTIAL.");
  }
  if (step.allowedPositionIds.length !== 1 || step.allowedPositionIds[0] !== "POSITION_LAB_DIRECTOR" || step.allowedRoleIds.length !== 0 || step.specificUserId !== undefined) {
    fail("APPROVAL_RESEARCH_DESIGNATION_POLICY_INVALID", "Only the Lab Director position may be selected; Senior, Representative, role, and specific-user selectors are forbidden.");
  }
  validateResearchProjectDesignationLine(line);
}

export interface ApprovalCommand { readonly actor: ApprovalActorSnapshot; readonly at: UtcInstant; readonly expectedVersion: Version; readonly actionId: Uuid; readonly eventId: Uuid; readonly completionEventId?: Uuid; readonly correlationId: CorrelationId; readonly idempotencyKey: IdempotencyKey }
export interface ParticipantCommand extends ApprovalCommand { readonly stepId: Uuid; readonly participantId: Uuid; readonly kind: "REVIEW"|"AGREE"|"APPROVE"|"REFERENCE_RECEIPT"; readonly comment?: string }
export interface RejectCommand extends ApprovalCommand { readonly stepId: Uuid; readonly participantId: Uuid; readonly reasonCode: StableCode; readonly comment?: string }

export class ApprovalInstance {
  private constructor(private value: ApprovalInstanceSnapshot) {}
  static create(input: { approvalInstanceId: Uuid; submitterUserId: Uuid }): ApprovalInstance {
    return new ApprovalInstance({ approvalInstanceId: input.approvalInstanceId, submitterUserId: input.submitterUserId, generation: 1, state: "DRAFT", version: 0 as Version, steps: [], actions: [] });
  }
  static restore(snapshot: ApprovalInstanceSnapshot): ApprovalInstance { return new ApprovalInstance(copy(snapshot)); }
  snapshot(): ApprovalInstanceSnapshot { return copy(this.value); }
  submit(command: ApprovalCommand, subject: ApprovalSubjectSnapshot, policyInput: ApprovalPolicyVersion, line: readonly ResolvedStep[], selectionInput: ApprovalPolicySelectionInput): ApprovalMutation {
    this.guard(command.expectedVersion, "DRAFT");
    this.guardDirectSubmitter(command.actor);
    if (this.value.resubmissionOfSubject && this.value.resubmissionOfSubject.subjectVersion === subject.subjectVersion && this.value.resubmissionOfSubject.checksum === subject.checksum) fail("APPROVAL_RESUBMISSION_EXACT_VERSION_REQUIRED", "Resubmission requires a new immutable subject version.");
    const policy = normalizePolicy(policyInput); if (command.at < policy.effectiveFrom || policy.effectiveTo && command.at >= policy.effectiveTo) fail("APPROVAL_POLICY_NOT_EFFECTIVE", "The policy is not effective at submission time."); if (!policyMatches(policy, { ...selectionInput, subjectKind: subject.subject.kind })) fail("APPROVAL_POLICY_SELECTION_MISMATCH", "The exact subject does not match the policy conditions."); validateResolvedLine(policy, line);
    if (subject.subject.kind === "RESEARCH_PROJECT_APPLICATION") validateResearchProjectDesignationPolicy(policy, line);
    const submission = copy({ submittedAt: command.at, submittedBy: command.actor, subject, policy, policySelectionInput: selectionInput, line });
    this.value = { ...this.value, submission, state: "SUBMITTED", steps: line.map((s) => ({ ...copy(s), state: "WAITING", participants: s.participants.map((p) => ({ ...copy(p), state: "PENDING" })) })), version: this.next() };
    return this.record(command, { kind: "SUBMIT" }, "APPROVAL_SUBMITTED");
  }
  activate(command: ApprovalCommand): ApprovalMutation { this.guard(command.expectedVersion, "SUBMITTED"); if (command.actor.actorType !== "SYSTEM" || command.actor.accountKind !== "SYSTEM") fail("APPROVAL_SYSTEM_ACTOR_REQUIRED", "Activation is a system transition."); this.value = { ...this.value, state: "IN_PROGRESS", version: this.next() }; this.activateNext(); return this.record(command, { kind: "ACTIVATE" }, "APPROVAL_ACTIVATED"); }
  act(command: ParticipantCommand): ApprovalMutation {
    this.guard(command.expectedVersion, "IN_PROGRESS"); const step = this.step(command.stepId); const participant = present(step.participants.find((p) => p.participantId === command.participantId), "APPROVAL_PARTICIPANT_NOT_ACTIVE", "Participant is not active.");
    if (step.state !== "ACTIVE" || participant.state !== "ACTIVE") fail("APPROVAL_PARTICIPANT_NOT_ACTIVE", "Participant is not active.");
    const expected = { REVIEW: "REVIEW", AGREEMENT: "AGREE", APPROVAL: "APPROVE", REFERENCE: "REFERENCE_RECEIPT" }[step.role]; if (command.kind !== expected) fail("APPROVAL_ACTION_ROLE_MISMATCH", "Action does not match step role.");
    this.guardActor(command.actor, participant, command.kind, command.at);
    participant.state = "COMPLETED";
    if (step.completionMode === "ANY_ONE") step.participants.forEach((p) => { if (p.state !== "COMPLETED") p.state = "CANCELLED"; });
    if (this.stepComplete(step)) { step.state = step.role === "REVIEW" ? "REVIEWED" : step.role === "AGREEMENT" ? "AGREED" : step.role === "APPROVAL" ? "APPROVED" : "REVIEWED"; this.activateNext(); }
    else if (step.completionMode === "SEQUENTIAL") { const next = step.participants.filter((p) => p.state === "PENDING").sort((a,b) => a.order-b.order)[0]; if (next) next.state = "ACTIVE"; }
    this.value = { ...this.value, version: this.next() };
    return this.record(command, { kind: command.kind, stepId: step.stepId, participantId: participant.participantId, comment: command.comment }, `APPROVAL_${command.kind}`);
  }
  reject(command: RejectCommand): ApprovalMutation {
    this.guard(command.expectedVersion, "IN_PROGRESS"); const step = this.step(command.stepId); const participant = present(step.participants.find((p) => p.participantId === command.participantId), "APPROVAL_PARTICIPANT_NOT_ACTIVE", "Participant is not active.");
    if (step.state !== "ACTIVE" || participant.state !== "ACTIVE") fail("APPROVAL_PARTICIPANT_NOT_ACTIVE", "Participant is not active.");
    this.guardActor(command.actor, participant, "REJECT", command.at); step.state = "REJECTED"; participant.state = "COMPLETED";
    this.value.steps.forEach((s) => { if (s.state === "WAITING" || s.state === "ACTIVE") { s.state = "CANCELLED"; s.participants.forEach((p) => { if (p.state !== "COMPLETED") p.state = "CANCELLED"; }); } });
    this.value = { ...this.value, state: "REJECTED", version: this.next() };
    return this.record(command, { kind: "REJECT", stepId: step.stepId, participantId: participant.participantId, reasonCode: command.reasonCode, comment: command.comment }, "APPROVAL_REJECTED");
  }
  requestRecall(command: ApprovalCommand): ApprovalMutation { this.guard(command.expectedVersion, "SUBMITTED", "IN_PROGRESS"); if (!this.value.submission?.policy.recallAllowed) fail("APPROVAL_RECALL_POLICY_FORBIDDEN", "The submitted policy snapshot forbids recall."); this.guardDirectSubmitter(command.actor); this.value = { ...this.value, state: "RECALL_REQUESTED", version: this.next() }; return this.record(command, { kind: "REQUEST_RECALL" }, "APPROVAL_RECALL_REQUESTED"); }
  confirmRecall(command: ApprovalCommand): ApprovalMutation { this.guard(command.expectedVersion, "RECALL_REQUESTED"); if (command.actor.actorType !== "SYSTEM" || command.actor.accountKind !== "SYSTEM") fail("APPROVAL_SYSTEM_ACTOR_REQUIRED", "Recall confirmation is a system transition."); this.value.steps.forEach((s) => { if (s.state === "WAITING" || s.state === "ACTIVE") s.state = "CANCELLED"; }); this.value = { ...this.value, state: "RECALLED", version: this.next() }; return this.record(command, { kind: "RECALL" }, "APPROVAL_RECALLED"); }
  cancel(command: ApprovalCommand): ApprovalMutation { this.guard(command.expectedVersion, "DRAFT", "REJECTED", "RECALLED"); this.guardDirectSubmitter(command.actor); this.value = { ...this.value, state: "CANCELLED", version: this.next() }; return this.record(command, { kind: "CANCEL" }, "APPROVAL_CANCELLED"); }
  createResubmission(input: { approvalInstanceId: Uuid; submitterUserId: Uuid }): ApprovalInstance { if (this.value.state !== "REJECTED" && this.value.state !== "RECALLED") fail("APPROVAL_RESUBMISSION_FORBIDDEN", "Only rejected or recalled instances may be resubmitted."); const prior = present(this.value.submission?.subject, "APPROVAL_RESUBMISSION_SUBJECT_MISSING", "The previous exact subject snapshot is required."); return new ApprovalInstance({ approvalInstanceId: input.approvalInstanceId, submitterUserId: input.submitterUserId, generation: this.value.generation + 1, previousInstanceId: this.value.approvalInstanceId, resubmissionOfSubject: copy(prior), state: "DRAFT", version: 0 as Version, steps: [], actions: [] }); }
  private guard(expected: Version, ...states: ApprovalState[]): void { if (expected !== this.value.version) fail("APPROVAL_STALE_VERSION", "Optimistic version mismatch."); if (!states.includes(this.value.state)) fail("APPROVAL_STATE_INVALID", `Operation is not allowed from ${this.value.state}.`); }
  private next(): Version { return (Number(this.value.version) + 1) as Version; }
  private step(id: Uuid): ApprovalRuntimeStep { const found = this.value.steps.find((s) => s.stepId === id); if (!found) return fail("APPROVAL_STEP_NOT_FOUND", "Unknown step."); return found; }
  private stepComplete(step: ApprovalRuntimeStep): boolean { const done = step.participants.filter((p) => p.state === "COMPLETED"); return step.completionMode === "ANY_ONE" || step.completionMode === "SPECIFIC" ? done.length >= 1 : done.length === step.participants.length; }
  private guardDirectSubmitter(actor: ApprovalActorSnapshot): void { if (actor.actorType !== "USER" || actor.accountKind !== "INTERNAL" || !actor.authenticatedUserId || actor.authenticatedUserId !== actor.effectiveUserId || actor.effectiveUserId !== this.value.submitterUserId || actor.actingAuthority) fail("APPROVAL_DIRECT_SUBMITTER_REQUIRED", "A direct internal submitter actor is required."); }
  private activateNext(): void {
    if (this.value.steps.some((s) => s.state === "ACTIVE")) return;
    const pending = this.value.steps.filter((s) => s.state === "WAITING");
    if (!pending.length) { this.value = { ...this.value, state: "COMPLETED" }; return; }
    const seq = Math.min(...pending.map((s) => s.sequenceNo));
    for (const step of pending.filter((s) => s.sequenceNo === seq)) { if (!step.required && !step.participants.length) { step.state = "SKIPPED_BY_POLICY"; continue; } step.state = "ACTIVE"; if (step.completionMode === "SEQUENTIAL") { const first = [...step.participants].sort((a,b) => a.order-b.order)[0]; if (first) first.state = "ACTIVE"; } else step.participants.forEach((p) => p.state = "ACTIVE"); }
    if (!this.value.steps.some((s) => s.state === "ACTIVE")) this.activateNext();
  }
  private guardActor(actor: ApprovalActorSnapshot, participant: ApprovalRuntimeParticipant, action: ParticipantCommand["kind"] | "REJECT", at: UtcInstant): void {
    if (actor.actorType !== "USER" || actor.accountKind !== "INTERNAL" || !actor.authenticatedUserId) fail("APPROVAL_USER_ACTOR_REQUIRED", "A trusted internal user actor is required.");
    if (actor.authenticatedUserId === actor.effectiveUserId && actor.effectiveUserId === participant.userId) { if (!actor.positionIds.includes(participant.positionId) || !participant.roleIds.every((r) => actor.roleIds.includes(r))) fail("APPROVAL_ACTOR_ASSIGNMENT_MISMATCH", "Actor assignments differ from participant snapshot."); if (action === "APPROVE" && (!officialPositions.has(participant.positionId) || seniorPositions.has(participant.positionId))) fail("APPROVAL_OFFICIAL_AUTHORITY_INVALID", "Official approval authority is invalid."); return; }
    const a = present(actor.actingAuthority, "APPROVAL_ACTING_AUTHORITY_INVALID", "No snapshotted acting authority.");
    if (a.delegateUserId !== actor.authenticatedUserId || a.grantorUserId !== participant.userId || at < a.validFrom || at >= a.validTo) fail("APPROVAL_ACTING_AUTHORITY_INVALID", "No active snapshotted acting authority.");
    const permission = approvalPermissionForAction(action); if (!a.allowedActionIds.includes(permission)) fail("APPROVAL_ACTING_ACTION_FORBIDDEN", "Acting authority does not grant this action.");
    if (action === "APPROVE" && !officialPositions.has(a.representedPositionId)) fail("APPROVAL_OFFICIAL_AUTHORITY_INVALID", "Acting authority must represent Director or Representative.");
  }
  private record(command: ApprovalCommand, input: Omit<ApprovalAction,"actionId"|"at"|"actor">, eventType: string): ApprovalMutation {
    const action: ApprovalAction = copy({ actionId: command.actionId, at: command.at, actor: command.actor, ...input }); this.value = { ...this.value, actions: [...this.value.actions, action] };
    const payload = { machineId: APPROVAL_MACHINE_ID, state: this.value.state, generation: this.value.generation, actionId: action.actionId } as const;
    const mapping: Readonly<Record<string, string>> = { APPROVAL_SUBMITTED: APPROVAL_EVENT_IDS.SUBMITTED, APPROVAL_ACTIVATED: APPROVAL_EVENT_IDS.ACTIVATED, APPROVAL_REVIEW: APPROVAL_EVENT_IDS.REVIEWED, APPROVAL_AGREE: APPROVAL_EVENT_IDS.AGREED, APPROVAL_APPROVE: APPROVAL_EVENT_IDS.APPROVED, APPROVAL_REFERENCE_RECEIPT: APPROVAL_EVENT_IDS.REFERENCE_RECEIVED, APPROVAL_REJECTED: APPROVAL_EVENT_IDS.REJECTED, APPROVAL_RECALL_REQUESTED: APPROVAL_EVENT_IDS.RECALL_REQUESTED, APPROVAL_RECALLED: APPROVAL_EVENT_IDS.RECALLED, APPROVAL_CANCELLED: APPROVAL_EVENT_IDS.CANCELLED };
    const emittedType = mapping[eventType] ?? eventType;
    const event: ApprovalDomainEvent = { eventId: command.eventId, eventType: emittedType as StableCode, aggregateId: this.value.approvalInstanceId, aggregateVersion: this.value.version, occurredAt: command.at, correlationId: command.correlationId, idempotencyKey: command.idempotencyKey, payload };
    const events = [event];
    if (this.value.state === "COMPLETED") { const completionEventId = present(command.completionEventId, "APPROVAL_COMPLETION_EVENT_ID_REQUIRED", "A distinct completion envelope id is required."); events.push({ ...event, eventId: completionEventId, eventType: APPROVAL_EVENT_IDS.COMPLETED as StableCode }); }
    const audit: ApprovalAuditObligation = { eventType: emittedType as StableCode, actor: copy(command.actor), aggregateId: this.value.approvalInstanceId, actionId: action.actionId, occurredAt: command.at, correlationId: command.correlationId, metadata: payload };
    return { expectedVersion: command.expectedVersion, instance: this.snapshot(), appendedAction: copy(action), events, audit };
  }
}

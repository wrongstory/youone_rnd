import type { ApprovalActorSnapshot } from "@youone/core-approval/public";
import type { CorrelationId, IdempotencyKey, Money, Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import { nextVersion } from "@youone/shared-kernel/public";

export const RESEARCH_DESIGNATION_MACHINE_ID = "SM-RESEARCH-PROJECT-DESIGNATION-V1" as const;
export const RESEARCH_DESIGNATION_EVENT_IDS = {
  APPLICATION_CREATED: "EVT-RP-APPLICATION-CREATE",
  APPLICATION_SUBMITTED: "EVT-RP-APPLICATION-SUBMIT",
  DIRECTOR_CONSENTED: "EVT-RP-DIRECTOR-CONSENT",
  RETURNED: "EVT-RP-RETURN",
  REJECTED: "EVT-RP-REJECT",
} as const;

export type ResearchApplicationState = "APPLICATION_DRAFT" | "DIRECTOR_REVIEW_PENDING" | "APPROVED" | "RETURNED" | "REJECTED";
export interface ResearchTeamMemberSnapshot { readonly userId: Uuid; readonly projectRoleId: StableCode; readonly participationPercent?: number }
export interface ResearchOutputSnapshot { readonly outputId: Uuid; readonly outputTypeId: StableCode; readonly title: string; readonly dueDate?: string }
export interface ResearchProjectApplicationContent {
  readonly purpose: string;
  readonly objective: string;
  readonly researchPlan: string;
  readonly method: string;
  readonly teamLeadUserId: Uuid;
  readonly team: readonly ResearchTeamMemberSnapshot[];
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly budget: Money;
  readonly outputs: readonly ResearchOutputSnapshot[];
  readonly securityLevel: "L1" | "L2" | "L3" | "L4";
  readonly safetyApplicable: boolean;
  readonly allowanceApplicable: boolean;
  readonly evidenceAttachmentIds: readonly Uuid[];
}
export interface ResearchProjectApplicationSnapshot {
  readonly applicationVersionId: Uuid;
  readonly applicationRootId: Uuid;
  readonly projectId: Uuid;
  readonly revisionNo: number;
  readonly previousApplicationVersionId?: Uuid;
  readonly applicantUserId: Uuid;
  readonly content: ResearchProjectApplicationContent;
  readonly state: ResearchApplicationState;
  readonly sealedSnapshotChecksum?: Sha256;
  readonly sealedAt?: UtcInstant;
  readonly approvalInstanceId?: Uuid;
  readonly version: Version;
  readonly createdAt: UtcInstant;
  readonly updatedAt: UtcInstant;
}
export interface ResearchProjectDesignationSnapshot {
  readonly designationId: Uuid;
  readonly projectId: Uuid;
  readonly applicationVersionId: Uuid;
  readonly applicationRevisionNo: number;
  readonly sealedSnapshotChecksum: Sha256;
  readonly approvalInstanceId: Uuid;
  readonly approvalVersion: Version;
  readonly directorUserId: Uuid;
  readonly consentedAt: UtcInstant;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly state: "APPROVED";
}
export interface ResearchApplicationCommand {
  readonly actor: ApprovalActorSnapshot;
  readonly at: UtcInstant;
  readonly expectedVersion: Version;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
  readonly eventId: Uuid;
}
export interface ResearchApplicationEvent {
  readonly eventId: Uuid;
  readonly eventType: StableCode;
  readonly aggregateId: Uuid;
  readonly aggregateVersion: Version;
  readonly occurredAt: UtcInstant;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
}
export interface ResearchApplicationMutation {
  readonly expectedVersion: Version;
  readonly application: ResearchProjectApplicationSnapshot;
  readonly designation?: ResearchProjectDesignationSnapshot;
  readonly event: ResearchApplicationEvent;
  readonly audit: { readonly eventType: StableCode; readonly actor: ApprovalActorSnapshot; readonly aggregateId: Uuid; readonly occurredAt: UtcInstant; readonly correlationId: CorrelationId; readonly reason?: string };
}

export class FormalResearchDesignationError extends Error {
  public constructor(public readonly code: StableCode, message: string) { super(message); this.name = "FormalResearchDesignationError"; }
}
const fail = (code: string, message: string): never => { throw new FormalResearchDesignationError(code as StableCode, message); };
const clone = <T>(value: T): T => structuredClone(value);
function requireText(value: string, code: string): void { if (!value.trim()) fail(code, "A non-empty value is required."); }
function directActiveInternal(actor: ApprovalActorSnapshot): Uuid {
  if (actor.actorType !== "USER" || actor.accountKind !== "INTERNAL" || !actor.authenticatedUserId || actor.authenticatedUserId !== actor.effectiveUserId || actor.actingAuthority) return fail("RP_DIRECT_INTERNAL_ACTOR_REQUIRED", "A direct active internal actor is required.");
  return actor.authenticatedUserId;
}

export class ResearchProjectApplication {
  private constructor(private value: ResearchProjectApplicationSnapshot) {}
  public static create(input: Omit<ResearchProjectApplicationSnapshot, "state" | "version" | "createdAt" | "updatedAt" | "sealedSnapshotChecksum" | "sealedAt" | "approvalInstanceId"> & { readonly previous?: ResearchProjectApplicationSnapshot }, command: Omit<ResearchApplicationCommand, "expectedVersion">): ResearchApplicationMutation {
    const actorId = directActiveInternal(command.actor);
    if (actorId !== input.applicantUserId) fail("RP_APPLICANT_MISMATCH", "The direct applicant must create the application version.");
    if (!Number.isSafeInteger(input.revisionNo) || input.revisionNo < 1) fail("RP_REVISION_INVALID", "revisionNo must be a positive integer.");
    if (input.previous) {
      if (input.previous.applicationRootId !== input.applicationRootId || input.previous.projectId !== input.projectId || input.previous.applicationVersionId !== input.previousApplicationVersionId) fail("RP_RESUBMISSION_LINEAGE_INVALID", "Resubmission must directly follow the same application root and Project.");
      if (!["RETURNED", "REJECTED"].includes(input.previous.state) || input.revisionNo <= input.previous.revisionNo) fail("RP_STRICTLY_NEWER_VERSION_REQUIRED", "Returned or rejected applications require a strictly newer version.");
    } else if (input.revisionNo !== 1 || input.previousApplicationVersionId) fail("RP_INITIAL_VERSION_INVALID", "An initial application must be revision 1 without a predecessor.");
    ResearchProjectApplication.validateContent(input.content);
    const { previous, ...base } = input;
    void previous;
    const snapshot: ResearchProjectApplicationSnapshot = { ...clone(base), state: "APPLICATION_DRAFT", version: 1 as Version, createdAt: command.at, updatedAt: command.at };
    return ResearchProjectApplication.mutation(snapshot, command, 0 as Version, RESEARCH_DESIGNATION_EVENT_IDS.APPLICATION_CREATED);
  }
  public static restore(snapshot: ResearchProjectApplicationSnapshot): ResearchProjectApplication { ResearchProjectApplication.validateRestored(snapshot); return new ResearchProjectApplication(clone(snapshot)); }
  public snapshot(): ResearchProjectApplicationSnapshot { return clone(this.value); }
  public sealAndSubmit(command: ResearchApplicationCommand, input: { readonly checksum: Sha256; readonly approvalInstanceId: Uuid }): ResearchApplicationMutation {
    this.guard(command, "APPLICATION_DRAFT");
    const actorId = directActiveInternal(command.actor);
    if (actorId !== this.value.applicantUserId) fail("RP_APPLICANT_MISMATCH", "Only the direct applicant may submit this version.");
    const expectedVersion = this.value.version;
    this.value = { ...this.value, state: "DIRECTOR_REVIEW_PENDING", sealedSnapshotChecksum: input.checksum, sealedAt: command.at, approvalInstanceId: input.approvalInstanceId, version: nextVersion(this.value.version), updatedAt: command.at };
    return ResearchProjectApplication.mutation(this.value, command, expectedVersion, RESEARCH_DESIGNATION_EVENT_IDS.APPLICATION_SUBMITTED);
  }
  public applyDirectorConsent(command: ResearchApplicationCommand, input: { readonly designationId: Uuid; readonly approvalInstanceId: Uuid; readonly approvalVersion: Version }): ResearchApplicationMutation {
    this.guard(command, "DIRECTOR_REVIEW_PENDING");
    const directorUserId = ResearchProjectApplication.requireDirector(command.actor);
    const sealedSnapshotChecksum = this.value.sealedSnapshotChecksum ?? fail("RP_EXACT_APPROVAL_SUBJECT_REQUIRED", "Consent must bind the exact sealed application checksum.");
    if (!this.value.sealedAt || this.value.approvalInstanceId !== input.approvalInstanceId) fail("RP_EXACT_APPROVAL_SUBJECT_REQUIRED", "Consent must bind the exact sealed application and ApprovalInstance.");
    const expectedVersion = this.value.version;
    const designation: ResearchProjectDesignationSnapshot = { designationId: input.designationId, projectId: this.value.projectId, applicationVersionId: this.value.applicationVersionId, applicationRevisionNo: this.value.revisionNo, sealedSnapshotChecksum, approvalInstanceId: input.approvalInstanceId, approvalVersion: input.approvalVersion, directorUserId, consentedAt: command.at, validFrom: this.value.content.periodStart, validUntil: this.value.content.periodEnd, state: "APPROVED" };
    this.value = { ...this.value, state: "APPROVED", version: nextVersion(this.value.version), updatedAt: command.at };
    return ResearchProjectApplication.mutation(this.value, command, expectedVersion, RESEARCH_DESIGNATION_EVENT_IDS.DIRECTOR_CONSENTED, designation);
  }
  public returnForRevision(command: ResearchApplicationCommand, reason: string): ResearchApplicationMutation { return this.directorDecision(command, "RETURNED", RESEARCH_DESIGNATION_EVENT_IDS.RETURNED, reason); }
  public reject(command: ResearchApplicationCommand, reason: string): ResearchApplicationMutation { return this.directorDecision(command, "REJECTED", RESEARCH_DESIGNATION_EVENT_IDS.REJECTED, reason); }
  private directorDecision(command: ResearchApplicationCommand, state: "RETURNED" | "REJECTED", event: string, reason: string): ResearchApplicationMutation { this.guard(command, "DIRECTOR_REVIEW_PENDING"); ResearchProjectApplication.requireDirector(command.actor); requireText(reason, "RP_DECISION_REASON_REQUIRED"); const expectedVersion = this.value.version; this.value = { ...this.value, state, version: nextVersion(this.value.version), updatedAt: command.at }; return ResearchProjectApplication.mutation(this.value, command, expectedVersion, event, undefined, reason); }
  private guard(command: ResearchApplicationCommand, state: ResearchApplicationState): void { if (command.expectedVersion !== this.value.version) fail("RP_STALE_VERSION", "Optimistic version mismatch."); if (this.value.state !== state) fail("RP_STATE_INVALID", `Operation is not allowed from ${this.value.state}.`); }
  private static requireDirector(actor: ApprovalActorSnapshot): Uuid {
    if (actor.actorType !== "USER" || actor.accountKind !== "INTERNAL" || !actor.authenticatedUserId || !actor.effectiveUserId) return fail("RP_LAB_DIRECTOR_ONLY", "Only a trusted Lab Director decision may designate a research Project.");
    const directDirector = actor.authenticatedUserId === actor.effectiveUserId && actor.positionIds.includes("POSITION_LAB_DIRECTOR" as StableCode);
    const explicitDirectorActing = actor.actingAuthority?.delegateUserId === actor.authenticatedUserId && actor.actingAuthority.grantorUserId === actor.effectiveUserId && actor.actingAuthority.representedPositionId === "POSITION_LAB_DIRECTOR";
    if (!directDirector && !explicitDirectorActing) return fail("RP_LAB_DIRECTOR_ONLY", "Senior and Representative are not designation steps; only Lab Director or verified explicit Lab Director acting authority is accepted.");
    return actor.effectiveUserId;
  }
  private static validateContent(content: ResearchProjectApplicationContent): void { requireText(content.purpose, "RP_PURPOSE_REQUIRED"); requireText(content.objective, "RP_OBJECTIVE_REQUIRED"); requireText(content.researchPlan, "RP_PLAN_REQUIRED"); requireText(content.method, "RP_METHOD_REQUIRED"); if (content.periodStart > content.periodEnd) fail("RP_PERIOD_INVALID", "Research period is invalid."); if (content.team.length === 0 || !content.team.some((member) => member.userId === content.teamLeadUserId)) fail("RP_TEAM_LEAD_REQUIRED", "The team lead must be included in the sealed team."); if (content.outputs.length === 0) fail("RP_OUTPUT_REQUIRED", "At least one expected output is required."); }
  private static validateRestored(snapshot: ResearchProjectApplicationSnapshot): void { ResearchProjectApplication.validateContent(snapshot.content); if (snapshot.state !== "APPLICATION_DRAFT" && (!snapshot.sealedSnapshotChecksum || !snapshot.sealedAt || !snapshot.approvalInstanceId)) fail("RP_SEALED_SNAPSHOT_REQUIRED", "A non-draft application must retain its exact sealed snapshot."); }
  private static mutation(application: ResearchProjectApplicationSnapshot, command: Omit<ResearchApplicationCommand, "expectedVersion">, expectedVersion: Version, eventType: string, designation?: ResearchProjectDesignationSnapshot, reason?: string): ResearchApplicationMutation { return { expectedVersion, application: clone(application), ...(designation ? { designation: clone(designation) } : {}), event: { eventId: command.eventId, eventType: eventType as StableCode, aggregateId: application.applicationVersionId, aggregateVersion: application.version, occurredAt: command.at, correlationId: command.correlationId, idempotencyKey: command.idempotencyKey, payload: { projectId: application.projectId, applicationVersionId: application.applicationVersionId, revisionNo: application.revisionNo, state: application.state } }, audit: { eventType: eventType as StableCode, actor: clone(command.actor), aggregateId: application.applicationVersionId, occurredAt: command.at, correlationId: command.correlationId, ...(reason ? { reason } : {}) } }; }
}

/** Designation records are immutable evidence; restore returns a defensive snapshot only. */
export function restoreResearchProjectDesignation(snapshot: ResearchProjectDesignationSnapshot): Readonly<ResearchProjectDesignationSnapshot> { return Object.freeze(clone(snapshot)); }

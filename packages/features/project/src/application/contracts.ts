import type { StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import type { ProjectMember, ProjectMutation, ProjectProductLink, ProjectRndProgramLink, ProjectSnapshot, WbsNodeSnapshot } from "../domain/project.js";

export interface ProjectListItemView {
  readonly projectId: string;
  readonly projectCode: string;
  readonly name: string;
  readonly state: ProjectSnapshot["state"];
  readonly ownerDisplayName: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly formalResearch: boolean;
  readonly version: number;
}
export interface ProjectDetailView extends ProjectListItemView {
  readonly objective: string;
  readonly visibilityCode: string;
  readonly members: readonly { readonly userId: string; readonly displayName: string; readonly projectRoleId: string; readonly state: ProjectMember["state"] }[];
  readonly productLinks: readonly { readonly productId: string; readonly relationType: string }[];
  readonly rndProgramLinks: readonly { readonly rndProgramId: string; readonly relationType: string }[];
  readonly wbs: readonly { readonly wbsNodeId: string; readonly parentId?: string; readonly nodeKind: WbsNodeSnapshot["nodeKind"]; readonly title: string; readonly state: WbsNodeSnapshot["state"]; readonly progressPercent: number; readonly version: number }[];
}
export type ProjectListResult = { readonly availability: "AVAILABLE"; readonly items: readonly ProjectListItemView[] } | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type ProjectDetailResult = { readonly availability: "AVAILABLE"; readonly detail: ProjectDetailView } | { readonly availability: "NOT_FOUND" | "FORBIDDEN"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface ProjectQueryPort { listMine(): Promise<ProjectListResult>; getMine(projectId: string): Promise<ProjectDetailResult> }

export interface CreateProjectCommandDto {
  readonly projectCode: string;
  readonly name: string;
  readonly objective: string;
  readonly ownerUserId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly visibilityCode: string;
}
export type ProjectTransitionEventId = "EVT-PROJECT-PLAN" | "EVT-PROJECT-START" | "EVT-PROJECT-HOLD" | "EVT-PROJECT-RESUME" | "EVT-PROJECT-CANCEL";
export type WbsTransitionEventId = "EVT-WBS-READY" | "EVT-WBS-START" | "EVT-WBS-BLOCK" | "EVT-WBS-UNBLOCK" | "EVT-WBS-SUBMIT-REVIEW" | "EVT-WBS-ACCEPT" | "EVT-WBS-REWORK" | "EVT-WBS-CANCEL";
export type ProjectCommandRequest =
  | { readonly commandId: "PROJECT_CREATE"; readonly payload: CreateProjectCommandDto; readonly idempotencyKey: string }
  | { readonly commandId: "PROJECT_TRANSITION"; readonly projectId: string; readonly eventId: ProjectTransitionEventId; readonly expectedVersion: number; readonly reason?: string; readonly idempotencyKey: string }
  | { readonly commandId: "WBS_TRANSITION"; readonly projectId: string; readonly wbsNodeId: string; readonly eventId: WbsTransitionEventId; readonly expectedVersion: number; readonly reason?: string; readonly idempotencyKey: string };
export type ProjectCommandResult = { readonly availability: "AVAILABLE"; readonly accepted: true; readonly aggregateId: string; readonly version: number; readonly occurredAt: string } | { readonly availability: "AVAILABLE"; readonly accepted: false; readonly errorCode: string } | { readonly availability: "UNAVAILABLE"; readonly accepted: false; readonly reason: "COMMAND_ADAPTER_NOT_CONFIGURED" };
export interface ProjectCommandPort { execute(command: ProjectCommandRequest): Promise<ProjectCommandResult> }

export interface ProjectRepository {
  loadForUpdate(projectId: Uuid): Promise<ProjectSnapshot | null>;
  insert(snapshot: ProjectSnapshot): Promise<void>;
  save(snapshot: ProjectSnapshot, expectedVersion: Version): Promise<boolean>;
  appendMember(member: ProjectMember): Promise<void>;
  appendProductLink(link: ProjectProductLink): Promise<void>;
  appendRndProgramLink(link: ProjectRndProgramLink): Promise<void>;
}
export interface ProjectIdentityPort { assertActiveInternalUser(userId: Uuid): Promise<void> }
export interface WbsRepository {
  loadForUpdate(wbsNodeId: Uuid): Promise<WbsNodeSnapshot | null>;
  insert(snapshot: WbsNodeSnapshot): Promise<void>;
  save(snapshot: WbsNodeSnapshot, expectedVersion: Version): Promise<boolean>;
  assertParentInProject(parentId: Uuid, projectId: Uuid): Promise<void>;
  assertNoCycle(wbsNodeId: Uuid, proposedParentId: Uuid): Promise<void>;
}
export interface ProjectEvidencePort { appendTransition(input: { readonly aggregateId: Uuid; readonly fromVersion: Version; readonly toVersion: Version; readonly eventType: StableCode; readonly occurredAt: UtcInstant }): Promise<void>; appendAudit(mutation: ProjectMutation<ProjectSnapshot | WbsNodeSnapshot>["audit"]): Promise<void>; enqueue(event: ProjectMutation<ProjectSnapshot | WbsNodeSnapshot>["event"]): Promise<void> }
export interface ProjectTransactionContext { readonly projects: ProjectRepository; readonly wbs: WbsRepository; readonly identities: ProjectIdentityPort; readonly evidence: ProjectEvidencePort }
export interface ProjectUnitOfWork { transact<T>(work: (context: ProjectTransactionContext) => Promise<T>): Promise<T> }
export class ProjectConcurrencyError extends Error { public readonly code = "PROJECT_STALE_VERSION" as StableCode; }

async function appendProjectEvidence(context: ProjectTransactionContext, mutation: ProjectMutation<ProjectSnapshot | WbsNodeSnapshot>): Promise<void> {
  await context.evidence.appendTransition({ aggregateId: mutation.event.aggregateId, fromVersion: mutation.expectedVersion, toVersion: mutation.event.aggregateVersion, eventType: mutation.event.eventType, occurredAt: mutation.event.occurredAt });
  await context.evidence.appendAudit(mutation.audit);
  await context.evidence.enqueue(mutation.event);
}

export async function persistProjectCreation(unitOfWork: ProjectUnitOfWork, mutation: ProjectMutation<ProjectSnapshot>): Promise<void> {
  if (mutation.expectedVersion !== 0 || mutation.snapshot.version !== 1 || mutation.event.eventType !== "EVT-PROJECT-CREATE") throw new ProjectConcurrencyError("Project creation must be the canonical version 0 to 1 transition.");
  await unitOfWork.transact(async (context) => {
    await context.identities.assertActiveInternalUser(mutation.snapshot.ownerUserId);
    await context.projects.insert(mutation.snapshot);
    await appendProjectEvidence(context, mutation);
  });
}

export async function persistWbsCreation(unitOfWork: ProjectUnitOfWork, mutation: ProjectMutation<WbsNodeSnapshot>): Promise<void> {
  if (mutation.expectedVersion !== 0 || mutation.snapshot.version !== 1 || mutation.event.eventType !== "EVT-WBS-CREATE") throw new ProjectConcurrencyError("WBS creation must be the canonical version 0 to 1 transition.");
  await unitOfWork.transact(async (context) => {
    if (mutation.snapshot.parentId) {
      await context.wbs.assertParentInProject(mutation.snapshot.parentId, mutation.snapshot.projectId);
      await context.wbs.assertNoCycle(mutation.snapshot.wbsNodeId, mutation.snapshot.parentId);
    }
    await context.wbs.insert(mutation.snapshot);
    await appendProjectEvidence(context, mutation);
  });
}

export async function persistProjectMutation(unitOfWork: ProjectUnitOfWork, mutation: ProjectMutation<ProjectSnapshot | WbsNodeSnapshot>): Promise<void> {
  if (mutation.expectedVersion === 0) throw new ProjectConcurrencyError("Create mutations require the explicit creation transaction function.");
  await unitOfWork.transact(async (context) => {
    const saved = "wbsNodeId" in mutation.snapshot
      ? await context.wbs.save(mutation.snapshot, mutation.expectedVersion)
      : await context.projects.save(mutation.snapshot, mutation.expectedVersion);
    if (!saved) throw new ProjectConcurrencyError("Concurrent mutation lost optimistic lock.");
    await appendProjectEvidence(context, mutation);
  });
}

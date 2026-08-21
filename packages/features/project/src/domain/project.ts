import type {
  CorrelationId,
  IdempotencyKey,
  StableCode,
  UtcInstant,
  Uuid,
  Version,
} from "@youone/shared-kernel/public";
import { nextVersion } from "@youone/shared-kernel/public";

export const PROJECT_MACHINE_ID = "SM-PROJECT-V1" as const;
export const WBS_MACHINE_ID = "SM-WBS-V1" as const;

export const PROJECT_EVENT_IDS = {
  CREATED: "EVT-PROJECT-CREATE",
  PLANNED: "EVT-PROJECT-PLAN",
  STARTED: "EVT-PROJECT-START",
  HELD: "EVT-PROJECT-HOLD",
  RESUMED: "EVT-PROJECT-RESUME",
  CANCELLED: "EVT-PROJECT-CANCEL",
} as const;

export const WBS_EVENT_IDS = {
  CREATED: "EVT-WBS-CREATE",
  READIED: "EVT-WBS-READY",
  STARTED: "EVT-WBS-START",
  BLOCKED: "EVT-WBS-BLOCK",
  UNBLOCKED: "EVT-WBS-UNBLOCK",
  SUBMITTED_REVIEW: "EVT-WBS-SUBMIT-REVIEW",
  ACCEPTED: "EVT-WBS-ACCEPT",
  REWORKED: "EVT-WBS-REWORK",
  CANCELLED: "EVT-WBS-CANCEL",
} as const;

export type ProjectState =
  | "DRAFT"
  | "PLANNED"
  | "ACTIVE"
  | "ON_HOLD"
  | "CLOSING"
  | "CLOSED"
  | "CANCELLED";
export type WbsState =
  | "BACKLOG"
  | "READY"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "REVIEW_REQUIRED"
  | "DONE"
  | "CANCELLED";
export type WbsNodeKind = "PROJECT" | "MILESTONE" | "TASK" | "GROUP";
export type ProjectActorKind = "INTERNAL" | "VENDOR" | "SYSTEM";
export type ProjectAuthority =
  | "MEMBER"
  | "OWNER"
  | "PM"
  | "DIRECTOR"
  | "POLICY_APPROVER"
  | "INTERNAL_REVIEWER"
  | "VENDOR_ASSIGNEE";

export interface ProjectActorSnapshot {
  readonly actorKind: ProjectActorKind;
  readonly userId?: Uuid;
  readonly vendorId?: Uuid;
  readonly active: boolean;
  readonly authorities: readonly ProjectAuthority[];
  readonly projectScopeId?: Uuid;
}

export interface ProjectCommand {
  readonly actor: ProjectActorSnapshot;
  readonly at: UtcInstant;
  readonly expectedVersion: Version;
  readonly eventId: Uuid;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
  readonly reason?: string;
}

export interface ProjectSnapshot {
  readonly projectId: Uuid;
  readonly projectCode: string;
  readonly name: string;
  readonly objective: string;
  readonly ownerUserId: Uuid;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly visibilityCode: StableCode;
  readonly state: ProjectState;
  readonly version: Version;
  readonly createdAt: UtcInstant;
  readonly updatedAt: UtcInstant;
}

export interface ProjectMember {
  readonly projectMemberId: Uuid;
  readonly projectId: Uuid;
  readonly userId: Uuid;
  readonly projectRoleId: StableCode;
  readonly state: "ACTIVE" | "INACTIVE";
  readonly validFrom: UtcInstant;
  readonly validTo?: UtcInstant;
}

export interface ProjectProductLink {
  readonly projectId: Uuid;
  readonly productId: Uuid;
  readonly relationType: StableCode;
  readonly effectiveFrom: UtcInstant;
  readonly effectiveTo?: UtcInstant;
}

export interface ProjectRndProgramLink {
  readonly projectId: Uuid;
  readonly rndProgramId: Uuid;
  readonly relationType: StableCode;
  readonly effectiveFrom: UtcInstant;
  readonly effectiveTo?: UtcInstant;
}

export interface ProjectDomainEvent {
  readonly eventId: Uuid;
  readonly eventType: StableCode;
  readonly machineId: typeof PROJECT_MACHINE_ID | typeof WBS_MACHINE_ID;
  readonly aggregateId: Uuid;
  readonly aggregateVersion: Version;
  readonly occurredAt: UtcInstant;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ProjectAuditObligation {
  readonly eventType: StableCode;
  readonly actor: ProjectActorSnapshot;
  readonly aggregateId: Uuid;
  readonly occurredAt: UtcInstant;
  readonly correlationId: CorrelationId;
  readonly reason?: string;
}

export interface ProjectMutation<T> {
  readonly expectedVersion: Version;
  readonly snapshot: T;
  readonly event: ProjectDomainEvent;
  readonly audit: ProjectAuditObligation;
}

export class ProjectDomainError extends Error {
  public constructor(public readonly code: StableCode, message: string) {
    super(message);
    this.name = "ProjectDomainError";
  }
}

function fail(code: string, message: string): never {
  throw new ProjectDomainError(code as StableCode, message);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requireText(value: string, code: string): void {
  if (value.trim().length === 0) fail(code, "A non-empty value is required.");
}

function requireActiveInternal(actor: ProjectActorSnapshot): Uuid {
  if (actor.actorKind !== "INTERNAL" || !actor.active || !actor.userId) {
    return fail("PROJECT_ACTIVE_INTERNAL_REQUIRED", "Only an active internal user may create a Project.");
  }
  return actor.userId;
}

function hasAuthority(actor: ProjectActorSnapshot, ...allowed: readonly ProjectAuthority[]): boolean {
  return actor.active && allowed.some((authority) => actor.authorities.includes(authority));
}

export class Project {
  private constructor(private value: ProjectSnapshot) {}

  public static create(input: Omit<ProjectSnapshot, "state" | "version" | "createdAt" | "updatedAt">, command: Omit<ProjectCommand, "expectedVersion">): ProjectMutation<ProjectSnapshot> {
    requireActiveInternal(command.actor);
    requireText(input.projectCode, "PROJECT_CODE_REQUIRED");
    requireText(input.name, "PROJECT_NAME_REQUIRED");
    requireText(input.objective, "PROJECT_OBJECTIVE_REQUIRED");
    if (input.periodStart > input.periodEnd) fail("PROJECT_PERIOD_INVALID", "Project period is invalid.");
    const snapshot: ProjectSnapshot = { ...clone(input), state: "DRAFT", version: 1 as Version, createdAt: command.at, updatedAt: command.at };
    return Project.mutation(snapshot, command, 0 as Version, PROJECT_EVENT_IDS.CREATED);
  }

  public static restore(snapshot: ProjectSnapshot): Project {
    return new Project(clone(snapshot));
  }

  public snapshot(): ProjectSnapshot {
    return clone(this.value);
  }

  public plan(command: ProjectCommand): ProjectMutation<ProjectSnapshot> {
    this.guard(command, "DRAFT");
    this.requireOwnerOrPm(command.actor);
    return this.transition(command, "PLANNED", PROJECT_EVENT_IDS.PLANNED);
  }

  public start(command: ProjectCommand): ProjectMutation<ProjectSnapshot> {
    this.guard(command, "PLANNED");
    this.requirePmOrDirector(command.actor);
    return this.transition(command, "ACTIVE", PROJECT_EVENT_IDS.STARTED);
  }

  public hold(command: ProjectCommand): ProjectMutation<ProjectSnapshot> {
    this.guard(command, "ACTIVE");
    this.requirePmOrDirector(command.actor);
    requireText(command.reason ?? "", "PROJECT_HOLD_REASON_REQUIRED");
    return this.transition(command, "ON_HOLD", PROJECT_EVENT_IDS.HELD);
  }

  public resume(command: ProjectCommand): ProjectMutation<ProjectSnapshot> {
    this.guard(command, "ON_HOLD");
    this.requirePmOrDirector(command.actor);
    requireText(command.reason ?? "", "PROJECT_RESUME_REASON_REQUIRED");
    return this.transition(command, "ACTIVE", PROJECT_EVENT_IDS.RESUMED);
  }

  public cancel(command: ProjectCommand): ProjectMutation<ProjectSnapshot> {
    this.guard(command, "DRAFT", "PLANNED", "ACTIVE", "ON_HOLD");
    if (!hasAuthority(command.actor, "DIRECTOR", "POLICY_APPROVER")) fail("PROJECT_CANCEL_AUTHORITY_REQUIRED", "Director or a separately configured policy approver is required.");
    requireText(command.reason ?? "", "PROJECT_CANCEL_REASON_REQUIRED");
    return this.transition(command, "CANCELLED", PROJECT_EVENT_IDS.CANCELLED);
  }

  public beginClose(command: ProjectCommand): never {
    void command;
    return fail("OD-014-PROJECT-CLOSE", "Project closing is disabled until the close checklist policy is approved.");
  }

  public close(command: ProjectCommand): never {
    void command;
    return fail("OD-014-PROJECT-CLOSE", "Project close is disabled until the close checklist policy is approved.");
  }

  public reopen(command: ProjectCommand): never {
    void command;
    return fail("OD-014-PROJECT-CLOSE", "No reviewed Project reopen policy exists.");
  }

  private guard(command: ProjectCommand, ...states: readonly ProjectState[]): void {
    if (command.expectedVersion !== this.value.version) fail("PROJECT_STALE_VERSION", "Optimistic version mismatch.");
    if (!states.includes(this.value.state)) fail("PROJECT_STATE_INVALID", `Operation is not allowed from ${this.value.state}.`);
    if (!command.actor.active) fail("PROJECT_ACTOR_INACTIVE", "Inactive actors cannot change a Project.");
  }

  private requireOwnerOrPm(actor: ProjectActorSnapshot): void {
    if (actor.actorKind !== "INTERNAL" || !actor.userId || (actor.userId !== this.value.ownerUserId && !hasAuthority(actor, "PM"))) {
      fail("PROJECT_OWNER_OR_PM_REQUIRED", "Project owner or PM authority is required.");
    }
  }

  private requirePmOrDirector(actor: ProjectActorSnapshot): void {
    if (actor.actorKind !== "INTERNAL" || !hasAuthority(actor, "PM", "DIRECTOR")) fail("PROJECT_PM_OR_DIRECTOR_REQUIRED", "PM or Director authority is required.");
  }

  private transition(command: ProjectCommand, state: ProjectState, eventType: string): ProjectMutation<ProjectSnapshot> {
    const expectedVersion = this.value.version;
    this.value = { ...this.value, state, version: nextVersion(this.value.version), updatedAt: command.at };
    return Project.mutation(this.value, command, expectedVersion, eventType);
  }

  private static mutation(snapshot: ProjectSnapshot, command: Omit<ProjectCommand, "expectedVersion">, expectedVersion: Version, eventType: string): ProjectMutation<ProjectSnapshot> {
    const payload = { state: snapshot.state, projectId: snapshot.projectId } as const;
    return {
      expectedVersion,
      snapshot: clone(snapshot),
      event: { eventId: command.eventId, eventType: eventType as StableCode, machineId: PROJECT_MACHINE_ID, aggregateId: snapshot.projectId, aggregateVersion: snapshot.version, occurredAt: command.at, correlationId: command.correlationId, idempotencyKey: command.idempotencyKey, payload },
      audit: { eventType: eventType as StableCode, actor: clone(command.actor), aggregateId: snapshot.projectId, occurredAt: command.at, correlationId: command.correlationId, ...(command.reason ? { reason: command.reason } : {}) },
    };
  }
}

export interface WbsNodeSnapshot {
  readonly wbsNodeId: Uuid;
  readonly projectId: Uuid;
  readonly parentId?: Uuid;
  readonly nodeKind: WbsNodeKind;
  readonly title: string;
  readonly sortOrder: number;
  readonly ownerUserId: Uuid;
  readonly assigneeUserId?: Uuid;
  readonly assignedVendorId?: Uuid;
  readonly scheduleStart?: string;
  readonly scheduleEnd?: string;
  readonly progressPercent: number;
  readonly state: WbsState;
  readonly version: Version;
  readonly updatedAt: UtcInstant;
}

export interface WbsCommand extends ProjectCommand {
  readonly projectIsActive: boolean;
  readonly dependenciesSatisfied?: boolean;
  readonly evidenceSatisfied?: boolean;
}

export class WbsNode {
  private constructor(private value: WbsNodeSnapshot) {}

  public static create(input: Omit<WbsNodeSnapshot, "state" | "version" | "updatedAt"> & { readonly parent?: Pick<WbsNodeSnapshot, "wbsNodeId" | "projectId">; readonly proposedAncestorIds?: readonly Uuid[] }, command: Omit<WbsCommand, "expectedVersion">): ProjectMutation<WbsNodeSnapshot> {
    if (command.actor.actorKind !== "INTERNAL" || !hasAuthority(command.actor, "PM")) fail("WBS_PM_REQUIRED", "An active internal PM must create WBS nodes.");
    requireText(input.title, "WBS_TITLE_REQUIRED");
    if (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0) fail("WBS_SORT_ORDER_INVALID", "sortOrder must be a non-negative integer.");
    if (input.parentId) {
      if (!input.parent || input.parent.wbsNodeId !== input.parentId || input.parent.projectId !== input.projectId) fail("WBS_PARENT_PROJECT_MISMATCH", "Parent must belong to the same Project.");
      if (input.parentId === input.wbsNodeId || input.proposedAncestorIds?.includes(input.wbsNodeId)) fail("WBS_CYCLE_FORBIDDEN", "A WBS hierarchy cannot contain a cycle.");
    }
    const { parent, proposedAncestorIds, ...base } = input;
    void parent;
    void proposedAncestorIds;
    const snapshot: WbsNodeSnapshot = { ...clone(base), progressPercent: 0, state: "BACKLOG", version: 1 as Version, updatedAt: command.at };
    return WbsNode.mutation(snapshot, command, 0 as Version, WBS_EVENT_IDS.CREATED);
  }

  public static restore(snapshot: WbsNodeSnapshot): WbsNode { return new WbsNode(clone(snapshot)); }
  public snapshot(): WbsNodeSnapshot { return clone(this.value); }

  public ready(command: WbsCommand): ProjectMutation<WbsNodeSnapshot> { this.guard(command, "BACKLOG"); this.requireInternal(command.actor, "PM"); if (!this.value.assigneeUserId && !this.value.assignedVendorId) fail("WBS_ASSIGNMENT_REQUIRED", "A user or Vendor assignment is required before READY."); if (command.dependenciesSatisfied === false) fail("WBS_DEPENDENCY_BLOCKED", "WBS dependencies are not satisfied."); return this.transition(command, "READY", WBS_EVENT_IDS.READIED); }
  public start(command: WbsCommand): ProjectMutation<WbsNodeSnapshot> { this.guard(command, "READY"); this.requireAssigneePmOrScopedVendor(command.actor); if (!command.projectIsActive) fail("WBS_PROJECT_NOT_ACTIVE", "WBS work may start only while Project is active."); return this.transition(command, "IN_PROGRESS", WBS_EVENT_IDS.STARTED); }
  public block(command: WbsCommand): ProjectMutation<WbsNodeSnapshot> { this.guard(command, "IN_PROGRESS"); this.requireAssigneePmOrScopedVendor(command.actor); requireText(command.reason ?? "", "WBS_BLOCK_REASON_REQUIRED"); return this.transition(command, "BLOCKED", WBS_EVENT_IDS.BLOCKED); }
  public unblock(command: WbsCommand): ProjectMutation<WbsNodeSnapshot> { this.guard(command, "BLOCKED"); if (command.actor.actorKind === "VENDOR") fail("WBS_VENDOR_UNBLOCK_FORBIDDEN", "Vendor cannot unblock work without internal review."); if (!command.actor.userId || (command.actor.userId !== this.value.assigneeUserId && !hasAuthority(command.actor, "PM"))) fail("WBS_ASSIGNEE_OR_PM_REQUIRED", "Only the assignee or PM may unblock work."); requireText(command.reason ?? "", "WBS_UNBLOCK_NOTE_REQUIRED"); return this.transition(command, "IN_PROGRESS", WBS_EVENT_IDS.UNBLOCKED); }
  public submitReview(command: WbsCommand): ProjectMutation<WbsNodeSnapshot> { this.guard(command, "IN_PROGRESS"); this.requireAssigneeOrScopedVendor(command.actor); if (command.evidenceSatisfied === false) fail("WBS_EVIDENCE_REQUIRED", "Required evidence or deliverable is missing."); return this.transition(command, "REVIEW_REQUIRED", WBS_EVENT_IDS.SUBMITTED_REVIEW); }
  public accept(command: WbsCommand): ProjectMutation<WbsNodeSnapshot> { this.guard(command, "REVIEW_REQUIRED"); if (command.actor.actorKind !== "INTERNAL" || !hasAuthority(command.actor, "INTERNAL_REVIEWER")) fail("WBS_INTERNAL_REVIEWER_REQUIRED", "Only an internal reviewer may accept vendor or internal work."); this.value = { ...this.value, progressPercent: 100 }; return this.transition(command, "DONE", WBS_EVENT_IDS.ACCEPTED); }
  public rework(command: WbsCommand): ProjectMutation<WbsNodeSnapshot> { this.guard(command, "REVIEW_REQUIRED"); this.requireInternal(command.actor, "INTERNAL_REVIEWER"); requireText(command.reason ?? "", "WBS_REWORK_REASON_REQUIRED"); return this.transition(command, "IN_PROGRESS", WBS_EVENT_IDS.REWORKED); }
  public cancel(command: WbsCommand): ProjectMutation<WbsNodeSnapshot> { this.guard(command, "BACKLOG", "READY", "IN_PROGRESS", "BLOCKED", "REVIEW_REQUIRED"); this.requireInternal(command.actor, "PM", "DIRECTOR"); requireText(command.reason ?? "", "WBS_CANCEL_REASON_REQUIRED"); return this.transition(command, "CANCELLED", WBS_EVENT_IDS.CANCELLED); }

  private guard(command: WbsCommand, ...states: readonly WbsState[]): void { if (command.expectedVersion !== this.value.version) fail("WBS_STALE_VERSION", "Optimistic version mismatch."); if (!states.includes(this.value.state)) fail("WBS_STATE_INVALID", `Operation is not allowed from ${this.value.state}.`); if (!command.actor.active) fail("WBS_ACTOR_INACTIVE", "Inactive actors cannot change WBS work."); }
  private requireInternal(actor: ProjectActorSnapshot, ...authorities: readonly ProjectAuthority[]): void { if (actor.actorKind !== "INTERNAL" || !hasAuthority(actor, ...authorities)) fail("WBS_INTERNAL_AUTHORITY_REQUIRED", "Required internal authority is missing."); }
  private requireAssigneePmOrScopedVendor(actor: ProjectActorSnapshot): void {
    if (actor.actorKind === "VENDOR") { if (!actor.projectScopeId || !actor.vendorId || actor.vendorId !== this.value.assignedVendorId || !hasAuthority(actor, "VENDOR_ASSIGNEE")) fail("WBS_VENDOR_SCOPE_REQUIRED", "Exact active ProjectScope and assignment are required."); return; }
    if (!actor.userId || (actor.userId !== this.value.assigneeUserId && !hasAuthority(actor, "PM"))) fail("WBS_ASSIGNEE_OR_PM_REQUIRED", "Assignee or PM authority is required.");
  }
  private requireAssigneeOrScopedVendor(actor: ProjectActorSnapshot): void { if (actor.actorKind === "VENDOR") return this.requireAssigneePmOrScopedVendor(actor); if (!actor.userId || actor.userId !== this.value.assigneeUserId) fail("WBS_ASSIGNEE_REQUIRED", "Assigned user is required."); }
  private transition(command: WbsCommand, state: WbsState, eventType: string): ProjectMutation<WbsNodeSnapshot> { const expectedVersion = this.value.version; this.value = { ...this.value, state, version: nextVersion(this.value.version), updatedAt: command.at }; return WbsNode.mutation(this.value, command, expectedVersion, eventType); }
  private static mutation(snapshot: WbsNodeSnapshot, command: Omit<WbsCommand, "expectedVersion">, expectedVersion: Version, eventType: string): ProjectMutation<WbsNodeSnapshot> { const payload = { state: snapshot.state, projectId: snapshot.projectId, wbsNodeId: snapshot.wbsNodeId } as const; return { expectedVersion, snapshot: clone(snapshot), event: { eventId: command.eventId, eventType: eventType as StableCode, machineId: WBS_MACHINE_ID, aggregateId: snapshot.wbsNodeId, aggregateVersion: snapshot.version, occurredAt: command.at, correlationId: command.correlationId, idempotencyKey: command.idempotencyKey, payload }, audit: { eventType: eventType as StableCode, actor: clone(command.actor), aggregateId: snapshot.wbsNodeId, occurredAt: command.at, correlationId: command.correlationId, ...(command.reason ? { reason: command.reason } : {}) } }; }
}

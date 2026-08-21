import type { CorrelationId, IdempotencyKey, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import { nextVersion } from "@youone/shared-kernel/public";

export const VENDOR_EVENT_IDS = {
  CREATED: "EVT-VENDOR-CREATE",
  PROFILE_UPDATED: "EVT-VENDOR-PROFILE-UPDATE",
  SUSPENDED: "EVT-VENDOR-SUSPEND",
  ACTIVATED: "EVT-VENDOR-ACTIVATE",
  INACTIVATED: "EVT-VENDOR-INACTIVATE",
  EVALUATED: "EVT-VENDOR-EVALUATE",
} as const;

export type VendorState = "ACTIVE" | "SUSPENDED" | "INACTIVE";
export type VendorAuthority = "VENDOR_MANAGER" | "VENDOR_EVALUATOR";

export interface VendorActorSnapshot {
  readonly actorKind: "INTERNAL" | "VENDOR" | "SYSTEM";
  readonly userId?: Uuid;
  readonly active: boolean;
  readonly authorities: readonly VendorAuthority[];
}

export interface VendorProfileSnapshot {
  readonly vendorId: Uuid;
  readonly vendorCode: string;
  readonly legalName: string;
  readonly businessRegistrationNumber: string;
  readonly representativeName: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly state: VendorState;
  readonly version: Version;
  readonly createdAt: UtcInstant;
  readonly updatedAt: UtcInstant;
}

export interface VendorEvaluationSnapshot {
  readonly vendorEvaluationId: Uuid;
  readonly vendorId: Uuid;
  readonly evaluatorUserId: Uuid;
  readonly evaluationCode: StableCode;
  readonly riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly score?: number;
  readonly internalOpinion: string;
  readonly evaluatedAt: UtcInstant;
}

export interface VendorCommand {
  readonly actor: VendorActorSnapshot;
  readonly at: UtcInstant;
  readonly expectedVersion: Version;
  readonly eventId: Uuid;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
  readonly reason?: string;
}

export interface VendorDomainEvent {
  readonly eventId: Uuid;
  readonly eventType: StableCode;
  readonly aggregateId: Uuid;
  readonly aggregateVersion: Version;
  readonly occurredAt: UtcInstant;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
}

export interface VendorMutation {
  readonly expectedVersion: Version;
  readonly snapshot: VendorProfileSnapshot;
  readonly event: VendorDomainEvent;
  readonly audit: {
    readonly actionId: StableCode;
    readonly actor: VendorActorSnapshot;
    readonly vendorId: Uuid;
    readonly occurredAt: UtcInstant;
    readonly correlationId: CorrelationId;
    readonly reason?: string;
  };
}

export interface VendorEvaluationMutation {
  readonly expectedVendorVersion: Version;
  readonly snapshot: VendorEvaluationSnapshot;
  readonly event: VendorDomainEvent;
  readonly audit: VendorMutation["audit"];
}

export class VendorDomainError extends Error {
  public constructor(public readonly code: StableCode, message: string) {
    super(message);
    this.name = "VendorDomainError";
  }
}

function fail(code: string, message: string): never {
  throw new VendorDomainError(code as StableCode, message);
}

function requireText(value: string, code: string): void {
  if (value.trim().length === 0) fail(code, "A non-empty value is required.");
}

function requireInternal(actor: VendorActorSnapshot, authority: VendorAuthority): Uuid {
  if (actor.actorKind !== "INTERNAL" || !actor.active || !actor.userId || !actor.authorities.includes(authority)) {
    return fail("VENDOR_INTERNAL_AUTHORITY_REQUIRED", "An active internal actor with the required authority is required.");
  }
  return actor.userId;
}

function clone<T>(value: T): T { return structuredClone(value); }

export class VendorProfile {
  private constructor(private value: VendorProfileSnapshot) {}

  public static create(input: Omit<VendorProfileSnapshot, "state" | "version" | "createdAt" | "updatedAt">, command: Omit<VendorCommand, "expectedVersion">): VendorMutation {
    requireInternal(command.actor, "VENDOR_MANAGER");
    requireText(input.vendorCode, "VENDOR_CODE_REQUIRED");
    requireText(input.legalName, "VENDOR_LEGAL_NAME_REQUIRED");
    requireText(input.businessRegistrationNumber, "VENDOR_REGISTRATION_NUMBER_REQUIRED");
    requireText(input.representativeName, "VENDOR_REPRESENTATIVE_REQUIRED");
    const snapshot: VendorProfileSnapshot = { ...clone(input), state: "ACTIVE", version: 1 as Version, createdAt: command.at, updatedAt: command.at };
    return VendorProfile.mutation(snapshot, command, 0 as Version, VENDOR_EVENT_IDS.CREATED);
  }

  public static restore(snapshot: VendorProfileSnapshot): VendorProfile { return new VendorProfile(clone(snapshot)); }
  public snapshot(): VendorProfileSnapshot { return clone(this.value); }

  public updateProfile(input: Pick<VendorProfileSnapshot, "legalName" | "representativeName" | "contactEmail" | "contactPhone">, command: VendorCommand): VendorMutation {
    this.guard(command, "ACTIVE", "SUSPENDED");
    requireInternal(command.actor, "VENDOR_MANAGER");
    requireText(input.legalName, "VENDOR_LEGAL_NAME_REQUIRED");
    requireText(input.representativeName, "VENDOR_REPRESENTATIVE_REQUIRED");
    this.value = { ...this.value, ...clone(input) };
    return this.transition(command, this.value.state, VENDOR_EVENT_IDS.PROFILE_UPDATED);
  }

  public suspend(command: VendorCommand): VendorMutation {
    this.guard(command, "ACTIVE"); requireInternal(command.actor, "VENDOR_MANAGER"); requireText(command.reason ?? "", "VENDOR_SUSPEND_REASON_REQUIRED");
    return this.transition(command, "SUSPENDED", VENDOR_EVENT_IDS.SUSPENDED);
  }
  public activate(command: VendorCommand): VendorMutation {
    this.guard(command, "SUSPENDED"); requireInternal(command.actor, "VENDOR_MANAGER"); requireText(command.reason ?? "", "VENDOR_ACTIVATE_REASON_REQUIRED");
    return this.transition(command, "ACTIVE", VENDOR_EVENT_IDS.ACTIVATED);
  }
  public inactivate(command: VendorCommand): VendorMutation {
    this.guard(command, "ACTIVE", "SUSPENDED"); requireInternal(command.actor, "VENDOR_MANAGER"); requireText(command.reason ?? "", "VENDOR_INACTIVATE_REASON_REQUIRED");
    return this.transition(command, "INACTIVE", VENDOR_EVENT_IDS.INACTIVATED);
  }

  public evaluate(input: Omit<VendorEvaluationSnapshot, "vendorId" | "evaluatorUserId" | "evaluatedAt">, command: VendorCommand): VendorEvaluationMutation {
    this.guard(command, "ACTIVE", "SUSPENDED");
    const evaluatorUserId = requireInternal(command.actor, "VENDOR_EVALUATOR");
    requireText(input.internalOpinion, "VENDOR_EVALUATION_OPINION_REQUIRED");
    if (input.score !== undefined && (!Number.isFinite(input.score) || input.score < 0 || input.score > 100)) fail("VENDOR_EVALUATION_SCORE_INVALID", "score must be between 0 and 100.");
    const snapshot = Object.freeze({ ...clone(input), vendorId: this.value.vendorId, evaluatorUserId, evaluatedAt: command.at });
    return {
      expectedVendorVersion: this.value.version,
      snapshot,
      event: { eventId: command.eventId, eventType: VENDOR_EVENT_IDS.EVALUATED as StableCode, aggregateId: this.value.vendorId, aggregateVersion: this.value.version, occurredAt: command.at, correlationId: command.correlationId, idempotencyKey: command.idempotencyKey },
      audit: { actionId: VENDOR_EVENT_IDS.EVALUATED as StableCode, actor: clone(command.actor), vendorId: this.value.vendorId, occurredAt: command.at, correlationId: command.correlationId, ...(command.reason ? { reason: command.reason } : {}) },
    };
  }

  private guard(command: VendorCommand, ...states: readonly VendorState[]): void {
    if (command.expectedVersion !== this.value.version) fail("VENDOR_STALE_VERSION", "Optimistic version mismatch.");
    if (!states.includes(this.value.state)) fail("VENDOR_STATE_INVALID", `Operation is not allowed from ${this.value.state}.`);
  }

  private transition(command: VendorCommand, state: VendorState, eventType: string): VendorMutation {
    const expectedVersion = this.value.version;
    this.value = { ...this.value, state, version: nextVersion(this.value.version), updatedAt: command.at };
    return VendorProfile.mutation(this.value, command, expectedVersion, eventType);
  }

  private static mutation(snapshot: VendorProfileSnapshot, command: Omit<VendorCommand, "expectedVersion">, expectedVersion: Version, eventType: string): VendorMutation {
    return {
      expectedVersion,
      snapshot: clone(snapshot),
      event: { eventId: command.eventId, eventType: eventType as StableCode, aggregateId: snapshot.vendorId, aggregateVersion: snapshot.version, occurredAt: command.at, correlationId: command.correlationId, idempotencyKey: command.idempotencyKey },
      audit: { actionId: eventType as StableCode, actor: clone(command.actor), vendorId: snapshot.vendorId, occurredAt: command.at, correlationId: command.correlationId, ...(command.reason ? { reason: command.reason } : {}) },
    };
  }
}

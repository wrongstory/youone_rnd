/** Public cross-module contracts for @youone/application-kernel. */

import type {
  CausationId,
  CorrelationId,
  IdempotencyKey,
  SafeEventPayload,
  Sha256,
  StableCode,
  UtcInstant,
  Uuid,
  Version
} from "@youone/shared-kernel/public";

export type ActorEnvelope = Readonly<{
  actorKind: "ANONYMOUS" | "SYSTEM" | "USER";
  authenticatedActorId?: Uuid;
  effectiveActorId?: Uuid;
  anonymousSubjectFingerprint?: Sha256;
  systemActorId?: StableCode;
  correlationId: CorrelationId;
  causationId?: CausationId;
}>;

export type AuditResult = "DENIED" | "FAILED" | "SUCCEEDED";

export type AuditEnvelope = Readonly<{
  id: Uuid;
  actor: ActorEnvelope;
  actionId: StableCode;
  resourceType: StableCode;
  resourceId?: Uuid;
  resourceVersion?: Version;
  result: AuditResult;
  reasonCode?: StableCode;
  reasonRecordRef?: Uuid;
  beforeHash?: Sha256;
  afterHash?: Sha256;
  occurredAt: UtcInstant;
}>;

export type TransitionEnvelope = Readonly<{
  id: Uuid;
  auditId: Uuid;
  actor: ActorEnvelope;
  aggregateType: StableCode;
  aggregateId: Uuid;
  machineId: StableCode;
  eventId: StableCode;
  fromState?: StableCode;
  toState: StableCode;
  fromVersion: Version;
  toVersion: Version;
  reasonCode?: StableCode;
  reasonRecordRef?: Uuid;
  correlationId: CorrelationId;
  causationId?: CausationId;
  occurredAt: UtcInstant;
}>;

export type OutboxEnvelope = Readonly<{
  id: Uuid;
  initiatingAuditId: Uuid;
  actor: ActorEnvelope;
  eventId: StableCode;
  aggregateType: StableCode;
  aggregateId: Uuid;
  resourceVersion: Version;
  correlationId: CorrelationId;
  causationId?: CausationId;
  payloadSchemaId: StableCode;
  payloadSchemaVersion: Version;
  payload: SafeEventPayload;
  idempotencyKey: IdempotencyKey;
  occurredAt: UtcInstant;
  availableAt: UtcInstant;
}>;

export interface AuditWriterPort {
  append(entry: AuditEnvelope): Promise<void>;
}

export interface TransitionWriterPort {
  append(entry: TransitionEnvelope): Promise<void>;
}

export interface OutboxWriterPort {
  enqueue(entry: OutboxEnvelope): Promise<void>;
}

export interface TransactionScope {
  readonly audit: AuditWriterPort;
  readonly transitions: TransitionWriterPort;
  readonly outbox: OutboxWriterPort;
}

export interface UnitOfWork<Scope extends TransactionScope = TransactionScope> {
  execute<Result>(
    actor: ActorEnvelope,
    operation: (transaction: Scope) => Promise<Result>
  ): Promise<Result>;
}

export interface Clock {
  now(): UtcInstant;
}

export interface IdGenerator {
  next(): Uuid;
}

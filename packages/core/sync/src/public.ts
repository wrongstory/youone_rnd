/** Public cross-module contracts for @youone/core-sync. */

import {
  safeEventPayload,
  sha256,
  stableCode,
  utcInstant,
  uuid,
  version,
  type JsonObject,
  type JsonValue,
  type Sha256,
  type StableCode,
  type UtcInstant,
  type Uuid,
  type Version
} from "@youone/shared-kernel/public";
import {
  assertTrustedActorContext,
  type TrustedActorContext
} from "@youone/core-authorization/public";

/** ADR-007 low-risk commands. New members require a reviewed schema and conflict fixture. */
export const OFFLINE_COMMAND_TYPES = [
  "CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT",
  "CMD-OFFLINE-INSPECTION-DRAFT-UPSERT",
  "CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT",
  "CMD-OFFLINE-WORK-ITEM-PROGRESS-UPDATE",
  "CMD-OFFLINE-FIELD-RECORD-DRAFT-UPSERT"
] as const;

/** Explicit deny registry. These operations must be issued from a live online session. */
export const ONLINE_ONLY_COMMAND_TYPES = [
  "CMD-APPROVAL-ACTION",
  "CMD-AUTHORIZATION-ASSIGNMENT-CHANGE",
  "CMD-SCOPE-GRANT-CHANGE",
  "CMD-TECHNICAL-DOCUMENT-L2-L4-ACCESS",
  "CMD-TECHNICAL-DOCUMENT-DELETE-APPROVAL",
  "CMD-TECHNICAL-DOCUMENT-CONTROLLED-COPY",
  "CMD-CONTRACT-SIGN",
  "CMD-CONTRACT-TERMINATE",
  "CMD-PAYMENT-CONFIRM"
] as const;

export type OfflineCommandType = (typeof OFFLINE_COMMAND_TYPES)[number];
export type OnlineOnlyCommandType = (typeof ONLINE_ONLY_COMMAND_TYPES)[number];
export type SyncResultCode = "APPLIED" | "IDEMPOTENT_REPLAY" | "REJECTED" | "SYNC_CONFLICT";
export type SyncConflictState = "OPEN" | "RESOLVED_DISCARD_LOCAL" | "RESOLVED_RETRY_AS_NEW";

export type OfflineCommandEnvelope = Readonly<{
  commandId: Uuid;
  commandType: OfflineCommandType;
  actorBinding: Readonly<{
    authenticatedActorId: Uuid;
    effectiveActorId: Uuid;
    /** SHA-256 over a server-defined actor/session binding; never a bearer token or raw session ID. */
    sessionBindingHash: Sha256;
  }>;
  aggregate: Readonly<{ aggregateType: StableCode; aggregateId: Uuid }>;
  baseVersion: Version;
  schemaVersion: number;
  createdAt: UtcInstant;
  payloadHash: Sha256;
  payload: JsonObject;
}>;

export type SyncConflictRecord = Readonly<{
  conflictId: Uuid;
  commandId: Uuid;
  commandType: OfflineCommandType;
  aggregateType: StableCode;
  aggregateId: Uuid;
  baseVersion: Version;
  serverVersion: Version;
  localPayload: JsonObject;
  localPayloadHash: Sha256;
  safeServerProjection: JsonObject;
  safeServerProjectionHash: Sha256;
  state: SyncConflictState;
  detectedAt: UtcInstant;
}>;

export type TerminalSyncCommandResult =
  | Readonly<{ result: "APPLIED"; commandId: Uuid; aggregateVersion: Version }>
  | Readonly<{ result: "SYNC_CONFLICT"; commandId: Uuid; conflict: SyncConflictRecord }>
  | Readonly<{ result: "REJECTED"; commandId: Uuid; reasonCode: StableCode }>;
export type SyncCommandResult = TerminalSyncCommandResult
  | Readonly<{ result: "IDEMPOTENT_REPLAY"; commandId: Uuid; original: TerminalSyncCommandResult }>;

export type OfflineApplicationCommandResult =
  | Readonly<{ result: "APPLIED"; aggregateVersion: Version }>
  | Readonly<{
      result: "STALE_BASE_VERSION";
      serverVersion: Version;
      safeServerProjection: JsonObject;
      safeServerProjectionHash: Sha256;
    }>
  | Readonly<{ result: "REJECTED"; reasonCode: StableCode }>;

export interface OfflineCommandHandler {
  readonly commandType: OfflineCommandType;
  /**
   * This must be the normal trusted application command path. It rechecks live authorization,
   * scope, aggregate state, command preconditions and optimistic version in this transaction.
   */
  execute(input: Readonly<{ actor: TrustedActorContext; command: OfflineCommandEnvelope }>): Promise<OfflineApplicationCommandResult>;
}

export interface OfflineCommandIntegrityPort {
  payloadHash(payload: JsonObject): Promise<Sha256>;
  actorSessionBindingHash(actor: TrustedActorContext): Promise<Sha256>;
}

export interface OfflineSyncTransaction {
  findRecordedCommand(commandId: Uuid): Promise<Readonly<{ payloadHash: Sha256; result: TerminalSyncCommandResult }> | null>;
  recordCommand(command: OfflineCommandEnvelope, actor: TrustedActorContext): Promise<void>;
  recordResult(result: TerminalSyncCommandResult): Promise<void>;
  recordConflict(conflict: SyncConflictRecord): Promise<void>;
}

export interface OfflineSyncUnitOfWork {
  transact<T>(work: (transaction: OfflineSyncTransaction) => Promise<T>): Promise<T>;
}

export interface SyncConflictIdPort { next(): Uuid }

export class OfflineCommandValidationError extends Error {
  readonly code = "OFFLINE_COMMAND_INVALID" as StableCode;
}
export class OfflineCommandOnlineOnlyError extends Error {
  readonly code = "OFFLINE_COMMAND_ONLINE_ONLY" as StableCode;
}
export class OfflineCommandBindingError extends Error {
  readonly code = "OFFLINE_COMMAND_ACTOR_SESSION_MISMATCH" as StableCode;
}
export class OfflineCommandIntegrityError extends Error {
  readonly code = "OFFLINE_COMMAND_PAYLOAD_HASH_MISMATCH" as StableCode;
}
export class OfflineCommandIdempotencyError extends Error {
  readonly code = "OFFLINE_COMMAND_IDEMPOTENCY_MISMATCH" as StableCode;
}

const offlineTypes = new Set<string>(OFFLINE_COMMAND_TYPES);
const onlineOnlyTypes = new Set<string>(ONLINE_ONLY_COMMAND_TYPES);

function object(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new OfflineCommandValidationError(`${field} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new OfflineCommandValidationError(`${field} must be a string`);
  return value;
}
function integer(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) throw new OfflineCommandValidationError(`${field} must be a safe integer`);
  return value as number;
}
function jsonObject(value: unknown, field: string): JsonObject {
  const validate = (item: unknown, path: string): JsonValue => {
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return item.map((child,index)=>validate(child,`${path}[${index}]`));
    if (item !== null && typeof item === "object" && (Object.getPrototypeOf(item)===Object.prototype || Object.getPrototypeOf(item)===null)) {
      return Object.fromEntries(Object.entries(item).map(([key,child])=>[key,validate(child,`${path}.${key}`)]));
    }
    throw new OfflineCommandValidationError(`${path} contains a non-JSON value`);
  };
  return validate(object(value,field),field) as JsonObject;
}

/** Sorts object keys recursively so every adapter hashes the same compact JSON bytes. */
export function minimizedJson(value: JsonValue): string {
  const normalize = (item: JsonValue): JsonValue => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item !== null && typeof item === "object") {
      const record = item as Readonly<Record<string, JsonValue>>;
      return Object.fromEntries(Object.keys(record).sort().map((key) => [key, normalize(record[key] as JsonValue)]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

/** Structural parser only. Cryptographic payload/session verification is performed by OfflineSyncService. */
export function parseOfflineCommand(value: unknown): OfflineCommandEnvelope {
  const input = object(value, "command");
  const type = text(input.commandType, "commandType");
  if (onlineOnlyTypes.has(type)) throw new OfflineCommandOnlineOnlyError(`${type} cannot be replayed offline`);
  if (!offlineTypes.has(type)) throw new OfflineCommandValidationError("commandType is not registered in the offline allowlist");
  const actor = object(input.actorBinding, "actorBinding");
  const aggregate = object(input.aggregate, "aggregate");
  const schemaVersion = integer(input.schemaVersion, "schemaVersion");
  if (schemaVersion <= 0) throw new OfflineCommandValidationError("schemaVersion must be positive");
  const payload = safeEventPayload(jsonObject(input.payload, "payload"));
  return Object.freeze({
    commandId: uuid(text(input.commandId, "commandId")),
    commandType: type as OfflineCommandType,
    actorBinding: Object.freeze({
      authenticatedActorId: uuid(text(actor.authenticatedActorId, "actorBinding.authenticatedActorId")),
      effectiveActorId: uuid(text(actor.effectiveActorId, "actorBinding.effectiveActorId")),
      sessionBindingHash: sha256(text(actor.sessionBindingHash, "actorBinding.sessionBindingHash"))
    }),
    aggregate: Object.freeze({
      aggregateType: stableCode(text(aggregate.aggregateType, "aggregate.aggregateType")),
      aggregateId: uuid(text(aggregate.aggregateId, "aggregate.aggregateId"))
    }),
    baseVersion: version(integer(input.baseVersion, "baseVersion")),
    schemaVersion,
    createdAt: utcInstant(text(input.createdAt, "createdAt")),
    payloadHash: sha256(text(input.payloadHash, "payloadHash")),
    payload
  });
}

export class OfflineSyncService {
  private readonly handlers = new Map<OfflineCommandType, OfflineCommandHandler>();
  constructor(
    private readonly unitOfWork: OfflineSyncUnitOfWork,
    handlers: readonly OfflineCommandHandler[],
    private readonly integrity: OfflineCommandIntegrityPort,
    private readonly conflictIds: SyncConflictIdPort
  ) {
    for (const handler of handlers) {
      if (this.handlers.has(handler.commandType)) throw new Error(`duplicate offline handler: ${handler.commandType}`);
      this.handlers.set(handler.commandType, handler);
    }
  }

  async execute(actor: TrustedActorContext, command: OfflineCommandEnvelope): Promise<SyncCommandResult> {
    assertTrustedActorContext(actor);
    if (!offlineTypes.has(command.commandType) || onlineOnlyTypes.has(command.commandType)) throw new OfflineCommandOnlineOnlyError("command is not offline-enabled");
    if (actor.authenticatedActorId !== command.actorBinding.authenticatedActorId || actor.effectiveActorId !== command.actorBinding.effectiveActorId || await this.integrity.actorSessionBindingHash(actor) !== command.actorBinding.sessionBindingHash) {
      throw new OfflineCommandBindingError("offline actor/session binding no longer matches the authenticated request");
    }
    if (await this.integrity.payloadHash(command.payload) !== command.payloadHash) throw new OfflineCommandIntegrityError("offline payload digest differs from the envelope");
    if (Date.parse(command.createdAt)>Date.parse(actor.requestTime)+300_000) throw new OfflineCommandValidationError("offline command creation time is in the future");
    const handler = this.handlers.get(command.commandType);
    if (!handler) throw new OfflineCommandOnlineOnlyError("no reviewed offline handler is registered");

    return this.unitOfWork.transact(async (transaction) => {
      const recorded = await transaction.findRecordedCommand(command.commandId);
      if (recorded) {
        if (recorded.payloadHash !== command.payloadHash) throw new OfflineCommandIdempotencyError("commandId was already used for different content");
        return Object.freeze({ result: "IDEMPOTENT_REPLAY", commandId: command.commandId, original: recorded.result });
      }
      await transaction.recordCommand(command, actor);
      const outcome = await handler.execute({ actor, command });
      let result: TerminalSyncCommandResult;
      if (outcome.result === "APPLIED") result = Object.freeze({ result: "APPLIED", commandId: command.commandId, aggregateVersion: outcome.aggregateVersion });
      else if (outcome.result === "REJECTED") result = Object.freeze({ result: "REJECTED", commandId: command.commandId, reasonCode: outcome.reasonCode });
      else {
        if (Number(outcome.serverVersion)<=Number(command.baseVersion)) throw new OfflineCommandValidationError("server version must advance beyond the stale base version");
        const conflict: SyncConflictRecord = Object.freeze({
          conflictId: this.conflictIds.next(), commandId: command.commandId, commandType: command.commandType,
          aggregateType: command.aggregate.aggregateType, aggregateId: command.aggregate.aggregateId,
          baseVersion: command.baseVersion, serverVersion: outcome.serverVersion,
          localPayload: command.payload, localPayloadHash: command.payloadHash,
          safeServerProjection: outcome.safeServerProjection, safeServerProjectionHash: outcome.safeServerProjectionHash,
          state: "OPEN", detectedAt: actor.requestTime
        });
        await transaction.recordConflict(conflict);
        result = Object.freeze({ result: "SYNC_CONFLICT", commandId: command.commandId, conflict });
      }
      await transaction.recordResult(result);
      return result;
    });
  }
}

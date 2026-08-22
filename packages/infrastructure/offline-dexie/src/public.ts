/** Browser-only IndexedDB adapter for the ADR-007 allowlisted offline boundary. */

import Dexie, { type Table } from "dexie";

import {
  parseOfflineCommand,
  type OfflineCommandEnvelope,
  type SyncCommandResult,
  type SyncConflictRecord
} from "@youone/core-sync/public";
import {
  safeEventPayload,
  sha256,
  utcInstant,
  uuid,
  version,
  type JsonObject,
  type Sha256,
  type UtcInstant,
  type Uuid,
  type Version
} from "@youone/shared-kernel/public";

export const OFFLINE_CACHE_TYPES = [
  "CACHE-PROJECT-LIST-SAFE",
  "CACHE-WBS-LIST-SAFE",
  "CACHE-SAFETY-CHECKLIST-TEMPLATE"
] as const;

export type OfflineCacheType = (typeof OFFLINE_CACHE_TYPES)[number];
export type LocalCommandState = "PENDING" | "SYNCING" | "APPLIED" | "CONFLICT" | "REJECTED";
export type AttachmentStagingState = "LOCAL_ONLY" | "QUEUED" | "UPLOADED" | "REJECTED";

export type StoredOfflineCommand = Readonly<{
  commandId: string;
  actorUserId: string;
  sessionBindingHash: string;
  commandType: string;
  createdAt: string;
  state: LocalCommandState;
  envelope: OfflineCommandEnvelope;
  lastAttemptAt?: UtcInstant;
  rejectionReason?: string;
}>;

export type LocalDraftRecord = Readonly<{
  draftId: Uuid;
  draftType: "PROJECT" | "RESEARCH_NOTE" | "SAFETY_INSPECTION";
  actorUserId: Uuid;
  sessionBindingHash: Sha256;
  aggregateId: Uuid;
  baseVersion: Version;
  updatedAt: UtcInstant;
  payloadHash: Sha256;
  payload: JsonObject;
}>;

export type OfflineCacheRecord = Readonly<{
  cacheKey: string;
  cacheType: OfflineCacheType;
  actorUserId: Uuid;
  sessionBindingHash: Sha256;
  cachedAt: UtcInstant;
  expiresAt: UtcInstant;
  payload: JsonObject;
}>;

export type AttachmentStagingMetadata = Readonly<{
  stagingId: Uuid;
  commandId: Uuid;
  actorUserId: Uuid;
  sessionBindingHash: Sha256;
  fileName: string;
  mediaType: string;
  byteSize: number;
  sha256: Sha256;
  state: AttachmentStagingState;
  createdAt: UtcInstant;
}>;

type StoredConflict = SyncConflictRecord & Readonly<{ conflictId: string; commandId: string }>;

export type OfflineQueueCounts = Readonly<{
  pending: number;
  syncing: number;
  conflicts: number;
  rejected: number;
}>;

const cacheTypes = new Set<string>(OFFLINE_CACHE_TYPES);

export class OfflineCachePolicyError extends Error {
  readonly code = "OFFLINE_CACHE_TYPE_DENIED";
}

export class OfflineQueueIntegrityError extends Error {
  readonly code = "OFFLINE_QUEUE_COMMAND_ID_REUSED";
}

export class YouoneOfflineDatabase extends Dexie {
  declare readonly outbox: Table<StoredOfflineCommand, string>;
  declare readonly conflicts: Table<StoredConflict, string>;
  declare readonly drafts: Table<LocalDraftRecord, string>;
  declare readonly cacheEntries: Table<OfflineCacheRecord, string>;
  declare readonly attachmentStaging: Table<AttachmentStagingMetadata, string>;

  constructor(name = "youone-rnd-offline-v1") {
    super(name);
    this.version(1).stores({
      outbox: "commandId,state,commandType,[actorUserId+sessionBindingHash],createdAt",
      conflicts: "conflictId,commandId,state,detectedAt",
      drafts: "draftId,draftType,[actorUserId+sessionBindingHash],aggregateId,updatedAt",
      cacheEntries: "cacheKey,cacheType,[actorUserId+sessionBindingHash],expiresAt",
      attachmentStaging: "stagingId,commandId,[actorUserId+sessionBindingHash],state,createdAt"
    });
  }
}

export class DexieOfflineStore {
  constructor(private readonly database: YouoneOfflineDatabase) {}

  async enqueue(commandInput: unknown): Promise<"QUEUED" | "ALREADY_QUEUED"> {
    const command = parseOfflineCommand(commandInput);
    return this.database.transaction("rw", this.database.outbox, async () => {
      const existing = await this.database.outbox.get(command.commandId);
      if (existing !== undefined) {
        if (existing.envelope.payloadHash !== command.payloadHash) {
          throw new OfflineQueueIntegrityError("commandId is already bound to different content");
        }
        return "ALREADY_QUEUED";
      }
      await this.database.outbox.add({
        commandId: command.commandId,
        actorUserId: command.actorBinding.authenticatedActorId,
        sessionBindingHash: command.actorBinding.sessionBindingHash,
        commandType: command.commandType,
        createdAt: command.createdAt,
        state: "PENDING",
        envelope: command
      });
      return "QUEUED";
    });
  }

  async pendingFor(actorUserId: Uuid, sessionBindingHash: Sha256, limit = 20): Promise<readonly OfflineCommandEnvelope[]> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
    const rows = await this.database.outbox
      .where("[actorUserId+sessionBindingHash]")
      .equals([actorUserId, sessionBindingHash])
      .filter((row) => row.state === "PENDING")
      .sortBy("createdAt");
    return Object.freeze(rows.slice(0, safeLimit).map((row) => structuredClone(row.envelope)));
  }

  async markSyncing(commandId: Uuid, attemptedAt: UtcInstant): Promise<void> {
    const changed = await this.database.outbox.where({ commandId, state: "PENDING" }).modify({ state: "SYNCING", lastAttemptAt: attemptedAt });
    if (changed !== 1) throw new Error("only one pending command can enter synchronization");
  }

  async retryAfterTransportFailure(commandId: Uuid): Promise<void> {
    const changed = await this.database.outbox.where({ commandId, state: "SYNCING" }).modify({ state: "PENDING" });
    if (changed !== 1) throw new Error("only a syncing command can return to pending");
  }

  async applyResult(result: SyncCommandResult, attemptedAt: UtcInstant): Promise<void> {
    const effective = result.result === "IDEMPOTENT_REPLAY" ? result.original : result;
    if (effective.commandId !== result.commandId) throw new OfflineQueueIntegrityError("sync result command identity differs from the request");
    if (effective.result === "SYNC_CONFLICT" && effective.conflict.commandId !== result.commandId) {
      throw new OfflineQueueIntegrityError("conflict command identity differs from the request");
    }
    const state: LocalCommandState = effective.result === "APPLIED"
      ? "APPLIED"
      : effective.result === "SYNC_CONFLICT"
        ? "CONFLICT"
        : "REJECTED";
    await this.database.transaction("rw", this.database.outbox, this.database.conflicts, async () => {
      const current = await this.database.outbox.get(result.commandId);
      if (current === undefined) throw new Error("offline result references an unknown local command");
      if (["APPLIED", "CONFLICT", "REJECTED"].includes(current.state)) {
        if (current.state === state) return;
        throw new OfflineQueueIntegrityError("a terminal local result cannot be replaced");
      }
      const changed = await this.database.outbox.update(result.commandId, {
        state,
        lastAttemptAt: attemptedAt,
        ...(effective.result === "REJECTED" ? { rejectionReason: effective.reasonCode } : {})
      });
      if (changed !== 1) throw new Error("offline result references an unknown local command");
      if (effective.result === "SYNC_CONFLICT") await this.database.conflicts.put(effective.conflict as StoredConflict);
    });
  }

  async listOpenConflicts(): Promise<readonly SyncConflictRecord[]> {
    const conflicts = await this.database.conflicts.where("state").equals("OPEN").sortBy("detectedAt");
    return Object.freeze(conflicts.map((conflict) => structuredClone(conflict)));
  }

  async counts(): Promise<OfflineQueueCounts> {
    const [pending, syncing, conflicts, rejected] = await Promise.all([
      this.database.outbox.where("state").equals("PENDING").count(),
      this.database.outbox.where("state").equals("SYNCING").count(),
      this.database.outbox.where("state").equals("CONFLICT").count(),
      this.database.outbox.where("state").equals("REJECTED").count()
    ]);
    return Object.freeze({ pending, syncing, conflicts, rejected });
  }

  async putCache(record: OfflineCacheRecord): Promise<void> {
    if (!cacheTypes.has(record.cacheType)) throw new OfflineCachePolicyError(`${record.cacheType} is not cacheable`);
    const normalized: OfflineCacheRecord = {
      ...structuredClone(record),
      actorUserId: uuid(record.actorUserId),
      sessionBindingHash: sha256(record.sessionBindingHash),
      cachedAt: utcInstant(record.cachedAt),
      expiresAt: utcInstant(record.expiresAt),
      payload: safeEventPayload(record.payload)
    };
    if (normalized.expiresAt <= normalized.cachedAt) throw new Error("offline cache expiry must be after its creation time");
    await this.database.cacheEntries.put(normalized);
  }

  async putDraft(record: LocalDraftRecord): Promise<void> {
    await this.database.drafts.put({
      ...structuredClone(record),
      draftId: uuid(record.draftId),
      actorUserId: uuid(record.actorUserId),
      sessionBindingHash: sha256(record.sessionBindingHash),
      aggregateId: uuid(record.aggregateId),
      baseVersion: version(record.baseVersion),
      updatedAt: utcInstant(record.updatedAt),
      payloadHash: sha256(record.payloadHash),
      payload: safeEventPayload(record.payload)
    });
  }

  async stageAttachment(metadata: AttachmentStagingMetadata): Promise<void> {
    if (!Number.isSafeInteger(metadata.byteSize) || metadata.byteSize < 0) throw new Error("attachment byteSize must be a non-negative integer");
    await this.database.transaction("rw", this.database.outbox, this.database.attachmentStaging, async () => {
      const command = await this.database.outbox.get(uuid(metadata.commandId));
      if (command === undefined || command.actorUserId !== metadata.actorUserId || command.sessionBindingHash !== metadata.sessionBindingHash) {
        throw new OfflineQueueIntegrityError("attachment metadata must match an exact queued actor/session command");
      }
      await this.database.attachmentStaging.put({
        ...structuredClone(metadata),
        stagingId: uuid(metadata.stagingId),
        commandId: uuid(metadata.commandId),
        actorUserId: uuid(metadata.actorUserId),
        sessionBindingHash: sha256(metadata.sessionBindingHash),
        sha256: sha256(metadata.sha256),
        createdAt: utcInstant(metadata.createdAt)
      });
    });
  }

  /** Purges every local payload bound to a signed-out or replaced session. Server conflict evidence remains canonical. */
  async purgeBinding(actorUserId: Uuid, sessionBindingHash: Sha256): Promise<void> {
    await this.database.transaction(
      "rw",
      this.database.outbox,
      this.database.conflicts,
      this.database.drafts,
      this.database.cacheEntries,
      this.database.attachmentStaging,
      async () => {
        const binding: [Uuid, Sha256] = [actorUserId, sessionBindingHash];
        const commands = await this.database.outbox.where("[actorUserId+sessionBindingHash]").equals(binding).primaryKeys();
        if (commands.length > 0) {
          await this.database.conflicts.where("commandId").anyOf(commands).delete();
          await this.database.attachmentStaging.where("commandId").anyOf(commands).delete();
          await this.database.outbox.bulkDelete(commands);
        }
        await this.database.drafts.where("[actorUserId+sessionBindingHash]").equals(binding).delete();
        await this.database.cacheEntries.where("[actorUserId+sessionBindingHash]").equals(binding).delete();
      }
    );
  }
}

let singleton: DexieOfflineStore | undefined;

/** Call only from a browser composition root; importing this module does not open IndexedDB. */
export function browserOfflineStore(): DexieOfflineStore {
  if (!("indexedDB" in globalThis)) throw new Error("IndexedDB is available only in a browser runtime");
  singleton ??= new DexieOfflineStore(new YouoneOfflineDatabase());
  return singleton;
}

import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { parseOfflineCommand, type SyncCommandResult } from "../../packages/core/sync/src/public.js";
import { DexieOfflineStore, OfflineCachePolicyError, OfflineQueueIntegrityError, YouoneOfflineDatabase } from "../../packages/infrastructure/offline-dexie/src/public.js";
import { sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const databases: YouoneOfflineDatabase[] = [];
const actorId = uuid("11111111-1111-4111-8111-111111111111");
const aggregateId = uuid("22222222-2222-4222-8222-222222222222");
const commandId = uuid("33333333-3333-4333-8333-333333333333");
const binding = sha256("a".repeat(64));
const payloadHash = sha256("b".repeat(64));
const serverHash = sha256("c".repeat(64));
const now = utcInstant("2026-08-23T02:00:00Z");

function fixture() {
  const database = new YouoneOfflineDatabase(`m15-${crypto.randomUUID()}`);
  databases.push(database);
  return { database, store: new DexieOfflineStore(database) };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    commandId,
    commandType: "CMD-OFFLINE-INSPECTION-DRAFT-UPSERT",
    actorBinding: { authenticatedActorId: actorId, effectiveActorId: actorId, sessionBindingHash: binding },
    aggregate: { aggregateType: "SAFETY_INSPECTION", aggregateId },
    baseVersion: 2,
    schemaVersion: 1,
    createdAt: now,
    payloadHash,
    payload: { checklistVersion: 3, completion: 40 },
    ...overrides
  };
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => {
    database.close();
    await database.delete();
  }));
});

describe("M15 Dexie offline adapter", () => {
  it("queues only an allowlisted, actor/session-bound command and returns it to the same binding", async () => {
    const { store } = fixture();
    await expect(store.enqueue(command())).resolves.toBe("QUEUED");
    await expect(store.enqueue(command())).resolves.toBe("ALREADY_QUEUED");
    await expect(store.pendingFor(actorId, binding)).resolves.toEqual([parseOfflineCommand(command())]);
    await expect(store.pendingFor(actorId, sha256("d".repeat(64)))).resolves.toEqual([]);
  });

  it("rejects online-only types and command-id reuse with changed content", async () => {
    const { store } = fixture();
    await expect(store.enqueue({ ...command(), commandType: "CMD-APPROVAL-ACTION" })).rejects.toThrow("cannot be replayed offline");
    await store.enqueue(command());
    await expect(store.enqueue(command({ payloadHash: sha256("e".repeat(64)) }))).rejects.toBeInstanceOf(OfflineQueueIntegrityError);
  });

  it("records a stale-base conflict while preserving the local envelope", async () => {
    const { database, store } = fixture();
    const parsed = parseOfflineCommand(command());
    await store.enqueue(parsed);
    const result: SyncCommandResult = {
      result: "SYNC_CONFLICT",
      commandId,
      conflict: {
        conflictId: uuid("44444444-4444-4444-8444-444444444444"),
        commandId,
        commandType: parsed.commandType,
        aggregateType: stableCode("SAFETY_INSPECTION"),
        aggregateId,
        baseVersion: version(2),
        serverVersion: version(3),
        localPayload: parsed.payload,
        localPayloadHash: payloadHash,
        safeServerProjection: { checklistVersion: 3, completion: 70 },
        safeServerProjectionHash: serverHash,
        state: "OPEN",
        detectedAt: now
      }
    };
    await store.applyResult(result, now);

    await expect(store.counts()).resolves.toMatchObject({ pending: 0, conflicts: 1 });
    await expect(store.listOpenConflicts()).resolves.toHaveLength(1);
    await expect(database.outbox.get(commandId)).resolves.toMatchObject({
      state: "CONFLICT",
      envelope: { payload: { checklistVersion: 3, completion: 40 } }
    });
  });

  it("enforces the cache allowlist and purges all payloads for a replaced session", async () => {
    const { database, store } = fixture();
    await store.enqueue(command());
    await store.putDraft({ draftId: uuid("55555555-5555-4555-8555-555555555555"), draftType: "SAFETY_INSPECTION", actorUserId: actorId, sessionBindingHash: binding, aggregateId, baseVersion: version(2), updatedAt: now, payloadHash, payload: { completion: 40 } });
    await store.putCache({ cacheKey: "projects-safe", cacheType: "CACHE-PROJECT-LIST-SAFE", actorUserId: actorId, sessionBindingHash: binding, cachedAt: now, expiresAt: utcInstant("2026-08-23T03:00:00Z"), payload: { count: 2 } });
    await expect(store.putCache({ cacheKey: "documents", cacheType: "CACHE-TECHNICAL-DOCUMENT" as never, actorUserId: actorId, sessionBindingHash: binding, cachedAt: now, expiresAt: now, payload: {} })).rejects.toBeInstanceOf(OfflineCachePolicyError);

    await store.purgeBinding(actorId, binding);
    await expect(database.outbox.count()).resolves.toBe(0);
    await expect(database.drafts.count()).resolves.toBe(0);
    await expect(database.cacheEntries.count()).resolves.toBe(0);
  });

  it("does not attach staging metadata to another actor/session and does not replace a terminal result", async () => {
    const { store } = fixture();
    await store.enqueue(command());
    await expect(store.stageAttachment({ stagingId: uuid("66666666-6666-4666-8666-666666666666"), commandId, actorUserId: uuid("77777777-7777-4777-8777-777777777777"), sessionBindingHash: binding, fileName: "현장.jpg", mediaType: "image/jpeg", byteSize: 12, sha256: serverHash, state: "LOCAL_ONLY", createdAt: now })).rejects.toBeInstanceOf(OfflineQueueIntegrityError);

    const applied: SyncCommandResult = { result: "APPLIED", commandId, aggregateVersion: version(3) };
    await store.applyResult(applied, now);
    await expect(store.applyResult({ result: "REJECTED", commandId, reasonCode: stableCode("LATE_REJECTION") }, now)).rejects.toBeInstanceOf(OfflineQueueIntegrityError);
  });
});

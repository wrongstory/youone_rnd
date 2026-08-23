import { describe, expect, it } from "vitest";

import type { Clock } from "../../packages/application-kernel/src/public.js";
import { TrustedActorContextFactory, type ActorContextSource, type TrustedActorContext } from "../../packages/core/authorization/src/public.js";
import type { AuthSessionVerifier, IdentitySnapshot } from "../../packages/core/identity/src/public.js";
import {
  OFFLINE_COMMAND_TYPES, ONLINE_ONLY_COMMAND_TYPES, OfflineCommandBindingError, OfflineCommandIdempotencyError,
  OfflineCommandOnlineOnlyError, OfflineCommandValidationError, OfflineSyncService, createOfflineCommandHandlers, minimizedJson, parseOfflineCommand,
  type OfflineApplicationCommandResult, type OfflineCommandEnvelope, type OfflineSyncTransaction, type SyncCommandResult,
  type SyncConflictRecord, type TerminalSyncCommandResult
} from "../../packages/core/sync/src/public.js";
import { correlationId, sha256, utcInstant, uuid, version, type Sha256, type Uuid } from "../../packages/shared-kernel/src/public.js";

const now = utcInstant("2026-08-23T09:00:00Z");
const actorId = uuid("15000000-0000-4000-8000-000000000001");
const commandId = uuid("15000000-0000-4000-8000-000000000002");
const aggregateId = uuid("15000000-0000-4000-8000-000000000003");
const conflictId = uuid("15000000-0000-4000-8000-000000000004");
const payloadHash = sha256("a".repeat(64));
const sessionHash = sha256("b".repeat(64));
const serverHash = sha256("c".repeat(64));

async function trustedActor(): Promise<TrustedActorContext> {
  const identity: IdentitySnapshot = {
    userId: actorId, authSubject: "m15-user", accountKind: "INTERNAL", accountStatus: "ACTIVE",
    accountValidFrom: utcInstant("2026-01-01T00:00:00Z"), accountVersion: version(1),
    organizations: [], departments: [], positions: [], roles: [], permissions: [], vendorMemberships: [], actingAuthorities: [], evidenceIds: []
  };
  const verifier: AuthSessionVerifier = { verify: async () => ({ authSubject: "m15-user", sessionId: "session-m15", expiresAt: utcInstant("2026-09-01T00:00:00Z"), assuranceLevel: "AAL2" }) };
  const source: ActorContextSource = { load: async () => ({ identity, scopeGrants: [], securityEntitlements: [] }) };
  const clock: Clock = { now: () => now };
  return new TrustedActorContextFactory(verifier, source, clock).create("verified-token", correlationId("request:m15"));
}

function command(overrides: Record<string, unknown> = {}): OfflineCommandEnvelope {
  return parseOfflineCommand({
    commandId, commandType: "CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT",
    actorBinding: { authenticatedActorId: actorId, effectiveActorId: actorId, sessionBindingHash: sessionHash },
    aggregate: { aggregateType: "SAFETY_CHECKLIST_DRAFT", aggregateId }, baseVersion: 3, schemaVersion: 1,
    createdAt: now, payloadHash, payload: { safetyInspectionId: aggregateId, note: "현장 점검", items: [{ itemId: conflictId, sequenceNo: 1, criterionCode: "SAFETY.CABLE", criterionText: "케이블 상태", verdict: "PASS", observation: "정상" }] }, ...overrides
  });
}

class MemoryTransaction implements OfflineSyncTransaction {
  readonly commands = new Map<Uuid, { payloadHash: Sha256; result?: TerminalSyncCommandResult }>();
  readonly conflicts: SyncConflictRecord[] = [];
  outcome: OfflineApplicationCommandResult = { result: "APPLIED", aggregateVersion: version(4) };
  applicationExecutions = 0;
  async findRecordedCommand(id: Uuid) { const row=this.commands.get(id); return row?.result ? { payloadHash: row.payloadHash, result: row.result } : null; }
  async recordCommand(input: OfflineCommandEnvelope) { this.commands.set(input.commandId,{ payloadHash: input.payloadHash }); }
  async recordResult(result: TerminalSyncCommandResult) { const row=this.commands.get(result.commandId); if(!row) throw new Error("missing command"); row.result=result; }
  async recordConflict(conflict: SyncConflictRecord) { this.conflicts.push(conflict); }
  async upsertSafetyChecklistDraft() { this.applicationExecutions++; return this.outcome; }
  async upsertInspectionAttemptDraft() { this.applicationExecutions++; return this.outcome; }
  async upsertFieldNoteDraft() { this.applicationExecutions++; return this.outcome; }
  async updateWbsNodeProgress() { this.applicationExecutions++; return this.outcome; }
  async upsertFieldRecordDraft() { this.applicationExecutions++; return this.outcome; }
}

function service(transaction: MemoryTransaction, verifiedPayloadHash: Sha256=payloadHash) {
  return new OfflineSyncService(
    { transact: async (_actor, work) => work(transaction) }, createOfflineCommandHandlers(),
    { payloadHash: async () => verifiedPayloadHash, actorSessionBindingHash: async () => sessionHash },
    { next: () => conflictId }
  );
}

describe("M15 offline sync core", () => {
  it("uses explicit offline and online-only stable registries", () => {
    expect(OFFLINE_COMMAND_TYPES).toContain("CMD-OFFLINE-INSPECTION-DRAFT-UPSERT");
    for (const sensitive of ["CMD-APPROVAL-ACTION", "CMD-AUTHORIZATION-ASSIGNMENT-CHANGE", "CMD-SCOPE-GRANT-CHANGE", "CMD-TECHNICAL-DOCUMENT-L2-L4-ACCESS", "CMD-TECHNICAL-DOCUMENT-CONTROLLED-COPY", "CMD-CONTRACT-SIGN", "CMD-CONTRACT-TERMINATE", "CMD-PAYMENT-CONFIRM"])
      expect(ONLINE_ONLY_COMMAND_TYPES).toContain(sensitive);
    expect(() => parseOfflineCommand({ ...command(), commandType: "CMD-APPROVAL-ACTION" })).toThrow(OfflineCommandOnlineOnlyError);
    expect(() => parseOfflineCommand({ ...command(), commandType: "CMD-GUESSED" })).toThrow(/not registered/);
  });

  it("parses a safe envelope and emits deterministic compact JSON", () => {
    expect(command()).toMatchObject({ commandId, baseVersion: 3, schemaVersion: 1 });
    expect(minimizedJson({ z: 1, a: { y: true, x: "값" } })).toBe('{"a":{"x":"값","y":true},"z":1}');
    expect(() => parseOfflineCommand({ ...command(), payload: { ...command().payload, accessToken: "forbidden" } })).toThrow(OfflineCommandValidationError);
    expect(() => parseOfflineCommand({ ...command(), commandId: "bad" })).toThrow(OfflineCommandValidationError);
  });

  it("rebinds the current trusted actor and current session before dispatch", async () => {
    const actor = await trustedActor(); const transaction = new MemoryTransaction();
    const result = await service(transaction).execute(actor,command());
    expect(result).toEqual({ result: "APPLIED", commandId, aggregateVersion: 4 });
    await expect(service(new MemoryTransaction()).execute(actor,command({ actorBinding: { authenticatedActorId: actorId, effectiveActorId: actorId, sessionBindingHash: sha256("d".repeat(64)) } }))).rejects.toBeInstanceOf(OfflineCommandBindingError);
  });

  it("returns an idempotent replay without executing the handler twice", async () => {
    const actor=await trustedActor(); const transaction=new MemoryTransaction();
    const sync=service(transaction);
    await sync.execute(actor,command());
    const duplicate=await sync.execute(actor,command());
    expect(duplicate).toMatchObject({result:"IDEMPOTENT_REPLAY",original:{result:"APPLIED",aggregateVersion:4}});
    expect(transaction.applicationExecutions).toBe(1);
    const changedHash=sha256("e".repeat(64));
    await expect(service(transaction,changedHash).execute(actor,command({payloadHash:changedHash,payload:{ safetyInspectionId: aggregateId, note:"다른 내용", items: [] }}))).rejects.toBeInstanceOf(OfflineCommandIdempotencyError);
  });

  it("preserves local and safe server versions as an open conflict without applying", async () => {
    const actor=await trustedActor(); const transaction=new MemoryTransaction();
    transaction.outcome={result:"STALE_BASE_VERSION",serverVersion:version(5),safeServerProjection:{checklistState:"IN_PROGRESS"},safeServerProjectionHash:serverHash};
    const result: SyncCommandResult=await service(transaction).execute(actor,command());
    if(result.result!=="SYNC_CONFLICT") throw new Error("expected conflict");
    expect(result.conflict).toMatchObject({baseVersion:3,serverVersion:5,state:"OPEN",localPayload:{note:"현장 점검"},safeServerProjection:{checklistState:"IN_PROGRESS"}});
    expect(transaction.conflicts).toHaveLength(1);
    expect(transaction.commands.get(commandId)?.result?.result).toBe("SYNC_CONFLICT");
  });
});

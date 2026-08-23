import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../../packages/application-kernel/src/public.js";
import { TrustedActorContextFactory, type ActorContextSource } from "../../packages/core/authorization/src/public.js";
import type { AuthSessionVerifier, IdentitySnapshot } from "../../packages/core/identity/src/public.js";
import {
  OFFLINE_COMMAND_TYPES, OfflineCommandValidationError, createOfflineCommandHandlerRegistry,
  createOfflineCommandHandlers, parseOfflineCommand, type OfflineSyncTransaction
} from "../../packages/core/sync/src/public.js";
import { correlationId, sha256, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const ids = Array.from({ length: 8 }, (_, index) => uuid(`73000000-0000-4000-8000-00000000000${index}`));
const [actorId, aggregateId, itemId, projectId, wbsNodeId, measurementId, inspectionId, criterionId] = ids;
const now = utcInstant("2026-08-23T09:00:00Z");
const hash = sha256("a".repeat(64));

function raw(commandType: (typeof OFFLINE_COMMAND_TYPES)[number], aggregateType: string, payload: unknown): Record<string, unknown> {
  return { commandId: aggregateId, commandType, actorBinding: { authenticatedActorId: actorId, effectiveActorId: actorId, sessionBindingHash: hash }, aggregate: { aggregateType, aggregateId }, baseVersion: 0, schemaVersion: 1, createdAt: now, payloadHash: hash, payload };
}
const fixtures: readonly [typeof OFFLINE_COMMAND_TYPES[number], string, Record<string, unknown>, keyof OfflineSyncTransaction][] = [
  [OFFLINE_COMMAND_TYPES[0], "SAFETY_CHECKLIST_DRAFT", { safetyInspectionId: inspectionId, note: "점검", items: [{ itemId, sequenceNo: 1, criterionCode: "SAFE.CABLE", criterionText: "케이블", verdict: "PASS", observation: "정상" }] }, "upsertSafetyChecklistDraft"],
  [OFFLINE_COMMAND_TYPES[1], "INSPECTION_ATTEMPT_DRAFT", { inspectionAttemptId: inspectionId, summary: "검수", results: [{ criterionId, verdict: "PARTIAL", achievedPercent: 70.5, observedValue: "70.5" }] }, "upsertInspectionAttemptDraft"],
  [OFFLINE_COMMAND_TYPES[2], "FIELD_NOTE_DRAFT", { projectId, wbsNodeId, observedAt: now, note: "현장 기록" }, "upsertFieldNoteDraft"],
  [OFFLINE_COMMAND_TYPES[3], "WBS_NODE", { progressPercent: 99 }, "updateWbsNodeProgress"],
  [OFFLINE_COMMAND_TYPES[4], "FIELD_RECORD_DRAFT", { projectId, wbsNodeId, observedAt: now, recordType: "MEASUREMENT", summary: "측정", location: "현장", measurements: [{ measurementId, metricCode: "TEMP", value: "21.5", unitCode: "CELSIUS", note: "정상" }] }, "upsertFieldRecordDraft"]
];

async function actor() {
  const identity: IdentitySnapshot = { userId: actorId, authSubject: "r03", accountKind: "INTERNAL", accountStatus: "ACTIVE", accountValidFrom: utcInstant("2026-01-01T00:00:00Z"), accountVersion: version(1), organizations: [], departments: [], positions: [], roles: [], permissions: [], vendorMemberships: [], actingAuthorities: [], evidenceIds: [] };
  const verifier: AuthSessionVerifier = { verify: async () => ({ authSubject: "r03", sessionId: "r03-session", expiresAt: utcInstant("2026-09-01T00:00:00Z"), assuranceLevel: "AAL2" }) };
  const source: ActorContextSource = { load: async () => ({ identity, scopeGrants: [], securityEntitlements: [] }) };
  const clock: Clock = { now: () => now };
  return new TrustedActorContextFactory(verifier, source, clock).create("token", correlationId("request:r03"));
}

function transaction(): OfflineSyncTransaction {
  const applied = async () => ({ result: "APPLIED" as const, aggregateVersion: version(1) });
  return {
    findRecordedCommand: vi.fn(async () => null), recordCommand: vi.fn(async () => undefined), recordResult: vi.fn(async () => undefined), recordConflict: vi.fn(async () => undefined),
    upsertSafetyChecklistDraft: vi.fn(applied), upsertInspectionAttemptDraft: vi.fn(applied), upsertFieldNoteDraft: vi.fn(applied), updateWbsNodeProgress: vi.fn(applied), upsertFieldRecordDraft: vi.fn(applied)
  };
}

describe("R03 reviewed offline command handlers", () => {
  it("registers exactly the five allowlisted handlers and fails when one is missing or duplicated", () => {
    const handlers = createOfflineCommandHandlers();
    expect([...createOfflineCommandHandlerRegistry(handlers).keys()]).toEqual(OFFLINE_COMMAND_TYPES);
    expect(() => createOfflineCommandHandlerRegistry(handlers.slice(0, 4))).toThrow(/missing offline handler/);
    expect(() => createOfflineCommandHandlerRegistry([...handlers, handlers[0]!])).toThrow(/duplicate offline handler/);
  });

  it("dispatches every command to its distinct application method with the same transaction", async () => {
    const trusted = await actor();
    for (const [commandType, aggregateType, payload, method] of fixtures) {
      const command = parseOfflineCommand(raw(commandType, aggregateType, payload));
      const tx = transaction();
      const handler = createOfflineCommandHandlers().find((candidate) => candidate.commandType === commandType)!;
      await handler.execute({ actor: trusted, command, transaction: tx });
      expect(tx[method]).toHaveBeenCalledTimes(1);
      expect(tx[method]).toHaveBeenCalledWith(trusted, command);
    }
  });

  it("rejects aggregate/schema mismatches, extra keys, invalid ranges and branded values uniformly", () => {
    const [commandType, aggregateType, payload] = fixtures[0]!;
    expect(() => parseOfflineCommand(raw(commandType, "INSPECTION_ATTEMPT_DRAFT", payload))).toThrow(OfflineCommandValidationError);
    expect(() => parseOfflineCommand({ ...raw(commandType, aggregateType, payload), schemaVersion: 2 })).toThrow(OfflineCommandValidationError);
    expect(() => parseOfflineCommand({ ...raw(commandType, aggregateType, payload), extra: true })).toThrow(OfflineCommandValidationError);
    expect(() => parseOfflineCommand(raw(commandType, aggregateType, { ...payload, extra: true }))).toThrow(OfflineCommandValidationError);
    const checklist = payload as { items: readonly Record<string, unknown>[] };
    expect(() => parseOfflineCommand(raw(commandType, aggregateType, { ...payload, items: [{ ...checklist.items[0], extra: true }] }))).toThrow(OfflineCommandValidationError);
    expect(() => parseOfflineCommand(raw(OFFLINE_COMMAND_TYPES[3], "WBS_NODE", { progressPercent: 100 }))).toThrow(OfflineCommandValidationError);
    expect(() => parseOfflineCommand({ ...raw(commandType, aggregateType, payload), commandId: "not-a-uuid" })).toThrow(OfflineCommandValidationError);
  });

  it("enforces nested collection limits", () => {
    const [commandType, aggregateType, payload] = fixtures[0]!;
    const item = (payload as { items: readonly Record<string, unknown>[] }).items[0]!;
    expect(() => parseOfflineCommand(raw(commandType, aggregateType, { ...payload, items: Array.from({ length: 201 }, () => item) }))).toThrow(OfflineCommandValidationError);
  });
});

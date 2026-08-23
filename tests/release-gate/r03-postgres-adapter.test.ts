import { describe, expect, it } from "vitest";

import type { Clock } from "../../packages/application-kernel/src/public.js";
import { TrustedActorContextFactory, type ActorContextSource } from "../../packages/core/authorization/src/public.js";
import type { AuthSessionVerifier, IdentitySnapshot } from "../../packages/core/identity/src/public.js";
import { parseOfflineCommand } from "../../packages/core/sync/src/public.js";
import { createPostgresOfflineSyncUnitOfWork } from "../../packages/infrastructure/postgres/src/offline-sync.js";
import { correlationId, sha256, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const now = utcInstant("2026-08-23T12:00:00Z");
const actorId = uuid("18000000-0000-4000-8000-000000000001");
const aggregateId = uuid("18000000-0000-4000-8000-000000000002");
const sourceId = uuid("18000000-0000-4000-8000-000000000003");
const itemId = uuid("18000000-0000-4000-8000-000000000004");

async function actor() {
  const identity: IdentitySnapshot = {
    userId: actorId,
    authSubject: "r03-adapter-user",
    accountKind: "INTERNAL",
    accountStatus: "ACTIVE",
    accountValidFrom: utcInstant("2026-01-01T00:00:00Z"),
    accountVersion: version(1),
    organizations: [], departments: [], positions: [], roles: [], permissions: [],
    vendorMemberships: [], actingAuthorities: [], evidenceIds: []
  };
  const verifier: AuthSessionVerifier = {
    verify: async () => ({
      authSubject: identity.authSubject,
      sessionId: "r03-adapter-session",
      expiresAt: utcInstant("2026-09-01T00:00:00Z"),
      assuranceLevel: "AAL2"
    })
  };
  const source: ActorContextSource = {
    load: async () => ({ identity, scopeGrants: [], securityEntitlements: [] })
  };
  const clock: Clock = { now: () => now };
  return new TrustedActorContextFactory(verifier, source, clock)
    .create("token", correlationId("request:r03-adapter"));
}

function checklistCommand() {
  return parseOfflineCommand({
    commandId: uuid("18000000-0000-4000-8000-000000000010"),
    commandType: "CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT",
    actorBinding: {
      authenticatedActorId: actorId,
      effectiveActorId: actorId,
      sessionBindingHash: sha256("a".repeat(64))
    },
    aggregate: { aggregateType: "SAFETY_CHECKLIST_DRAFT", aggregateId },
    baseVersion: 0,
    schemaVersion: 1,
    createdAt: now,
    payloadHash: sha256("b".repeat(64)),
    payload: {
      safetyInspectionId: sourceId,
      note: "현장 안전점검",
      items: [{
        itemId,
        sequenceNo: 1,
        criterionCode: "SAFETY.CABLE",
        criterionText: "케이블 상태",
        verdict: "PASS"
      }]
    }
  });
}

describe("R03 PostgreSQL offline adapter", () => {
  it("claims the command identity before reading its terminal replay", async () => {
    const sql: string[] = [];
    const command = checklistCommand();
    const trusted = await actor();
    const requestUnit = {
      execute: async (_actor: unknown, operation: (transaction: unknown) => Promise<unknown>) => operation({
        audit: {}, transitions: {}, outbox: {},
        query: async (statement: string) => {
          sql.push(statement);
          if (statement.includes("from public.offline_command c")) {
            return { rowCount: 1, rows: [{
              payload_hash: command.payloadHash,
              result_code: "APPLIED",
              aggregate_version: 1,
              reason_code: null,
              conflict_id: null,
              command_type: command.commandType,
              aggregate_type: command.aggregate.aggregateType,
              aggregate_id: command.aggregate.aggregateId,
              base_version: 0,
              server_version: null,
              local_payload: null,
              local_payload_hash: null,
              safe_server_projection: null,
              safe_server_projection_hash: null,
              detected_at: null
            }] };
          }
          return { rowCount: 1, rows: [{}] };
        },
        optimisticUpdate: async () => version(1)
      })
    };
    const unit = createPostgresOfflineSyncUnitOfWork(requestUnit as never);

    const recorded = await unit.transact(trusted, (transaction) =>
      transaction.findRecordedCommand(command.commandId)
    );

    expect(sql[0]).toContain("pg_advisory_xact_lock");
    expect(sql[1]).toContain("offline_command_result");
    expect(recorded?.result).toEqual({
      result: "APPLIED",
      commandId: command.commandId,
      aggregateVersion: 1
    });
  });

  it("routes the typed checklist payload to its only reviewed SQL function", async () => {
    const calls: Readonly<{ sql: string; parameters: readonly unknown[] }>[] = [];
    const command = checklistCommand();
    const trusted = await actor();
    const requestUnit = {
      execute: async (_actor: unknown, operation: (transaction: unknown) => Promise<unknown>) => operation({
        audit: {}, transitions: {}, outbox: {},
        query: async (sql: string, parameters: readonly unknown[] = []) => {
          calls.push({ sql, parameters });
          return { rowCount: 1, rows: [{
            result_code: "APPLIED",
            aggregate_version: 1,
            server_version: null,
            safe_server_projection: null,
            reason_code: null
          }] };
        },
        optimisticUpdate: async () => version(1)
      })
    };
    const unit = createPostgresOfflineSyncUnitOfWork(requestUnit as never);

    const result = await unit.transact(trusted, (transaction) =>
      transaction.upsertSafetyChecklistDraft(trusted, command)
    );

    expect(result).toEqual({ result: "APPLIED", aggregateVersion: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("r03_upsert_safety_checklist_draft");
    expect(calls[0]?.parameters).toEqual([
      command.commandId,
      aggregateId,
      sourceId,
      0,
      "현장 안전점검",
      JSON.stringify(command.payload.items),
      now
    ]);
  });
});

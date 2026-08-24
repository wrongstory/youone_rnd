import { describe, expect, it, vi } from "vitest";

import { TrustedActorContextFactory } from "../../packages/core/authorization/src/public.js";
import {
  PostgresAuthSessionPresenceSource,
  PostgresAuthSessionRevocationEvidenceStore
} from "../../packages/infrastructure/postgres/src/auth-session.js";
import {
  correlationId,
  sha256,
  utcInstant,
  uuid
} from "../../packages/shared-kernel/src/public.js";

const authSubject = "59000000-0000-4000-8000-000000000001";
const sessionId = "59000000-0000-4000-8000-000000000002";
const userAccountId = "59000000-0000-4000-8000-000000000003";

describe("#58 Postgres auth session revocation adapters", () => {
  it("uses a read-only resolver transaction for the exact subject/session presence probe", async () => {
    const calls: Readonly<{ sql: string; parameters: readonly unknown[] }>[] = [];
    const release = vi.fn();
    const source = new PostgresAuthSessionPresenceSource({
      connect: vi.fn(async () => ({
        query: vi.fn(async (sql: string, parameters: readonly unknown[] = []) => {
          calls.push({ sql, parameters });
          return sql.includes("auth_session_exists")
            ? { rowCount: 1, rows: [{ session_exists: false }] }
            : { rowCount: 0, rows: [] };
        }),
        release
      }))
    });

    await expect(source.exists(authSubject, sessionId)).resolves.toBe(false);
    expect(calls.map(({ sql }) => sql)).toEqual([
      "begin read only",
      "set local role youone_identity_resolver",
      "set local row_security = on",
      "select app_private.auth_session_exists($1, $2) as session_exists",
      "commit"
    ]);
    expect(calls[3]?.parameters).toEqual([authSubject, sessionId]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("rolls back and emits no provider details when the presence capability fails", async () => {
    const calls: string[] = [];
    const release = vi.fn();
    const source = new PostgresAuthSessionPresenceSource({
      connect: vi.fn(async () => ({
        query: vi.fn(async (sql: string) => {
          calls.push(sql);
          if (sql.includes("auth_session_exists")) throw new Error("raw database detail");
          return { rowCount: 0, rows: [] };
        }),
        release
      }))
    });

    await expect(source.exists(authSubject, sessionId)).rejects.toThrow("AUTH_SESSION_PRESENCE_UNAVAILABLE");
    expect(calls.at(-1)).toBe("rollback");
    expect(release).toHaveBeenCalledWith(false);
  });

  it("records reconciliation audit and typed outbox in one trusted transaction", async () => {
    const actor = await trustedActor();
    const auditAppend = vi.fn(async () => undefined);
    const outboxEnqueue = vi.fn(async () => undefined);
    const execute = vi.fn(async (receivedActor, operation) => operation({
      audit: { append: auditAppend },
      transitions: { append: vi.fn() },
      outbox: { enqueue: outboxEnqueue },
      query: vi.fn(),
      optimisticUpdate: vi.fn()
    }));
    const store = new PostgresAuthSessionRevocationEvidenceStore({ execute } as never);

    await store.record(actor, {
      outcome: "RECONCILIATION_SCHEDULED",
      auditId: uuid("59000000-0000-4000-8000-000000000010"),
      bindingHash: sha256("a".repeat(64)),
      occurredAt: utcInstant("2026-08-24T12:00:00Z"),
      operationId: uuid("59000000-0000-4000-8000-000000000011"),
      outboxEventId: uuid("59000000-0000-4000-8000-000000000012"),
      reconciliationAt: utcInstant("2026-08-24T12:15:00Z")
    });

    expect(execute).toHaveBeenCalledWith(actor, expect.any(Function));
    expect(auditAppend).toHaveBeenCalledWith(expect.objectContaining({
      actionId: "auth.session.global_sign_out.reconcile",
      resourceType: "AUTH_SESSION_REVOCATION",
      result: "FAILED",
      reasonCode: "AUTH_SESSION_RECONCILIATION_SCHEDULED"
    }));
    expect(outboxEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "AUTH_SESSION_REVOCATION_RECONCILIATION_REQUESTED",
      availableAt: "2026-08-24T12:15:00.000Z",
      payload: {
        authSubjectId: authSubject,
        providerSessionId: sessionId,
        retryAttempts: 3,
        reconciliationIntervalMinutes: 15
      }
    }));
    const serialized = JSON.stringify(outboxEnqueue.mock.calls);
    expect(serialized).not.toMatch(/access.?token|refresh.?token|password|cookie|authorization/i);
  });
});

async function trustedActor() {
  const factory = new TrustedActorContextFactory(
    {
      verify: vi.fn(async () => ({
        authSubject,
        sessionId,
        expiresAt: utcInstant("2026-08-24T13:00:00Z"),
        assuranceLevel: "AAL2"
      }))
    },
    {
      load: vi.fn(async () => ({
        identity: {
          userId: uuid(userAccountId),
          authSubject,
          accountKind: "INTERNAL",
          accountStatus: "ACTIVE",
          accountValidFrom: utcInstant("2026-01-01T00:00:00Z"),
          accountVersion: 0,
          organizations: [],
          departments: [],
          positions: [],
          roles: [],
          permissions: [],
          vendorMemberships: [],
          actingAuthorities: [],
          evidenceIds: []
        },
        scopeGrants: [],
        securityEntitlements: []
      }) as never)
    },
    { now: () => utcInstant("2026-08-24T12:00:00Z") }
  );
  return factory.create("access-token-not-retained", correlationId("request:session-revocation-test"));
}

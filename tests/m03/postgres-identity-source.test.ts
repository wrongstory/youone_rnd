import { describe, expect, it } from "vitest";

import { TrustedActorContextFactory, type ActorScopeExtensionSource } from "../../packages/core/authorization/src/public.js";
import type { AuthSessionVerifier } from "../../packages/core/identity/src/public.js";
import { PostgresActorContextSource } from "../../packages/infrastructure/postgres/src/identity.js";
import type { SqlConnection, SqlPool } from "../../packages/infrastructure/postgres/src/driver.js";
import { correlationId, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const requestTime = utcInstant("2026-08-21T12:00:00Z");
const userId = "10000000-0000-4000-8000-000000000001";
const assignmentId = "20000000-0000-4000-8000-000000000001";
const snapshot = {
  userId, authSubject: "verified-subject", accountKind: "VENDOR", accountStatus: "ACTIVE",
  accountValidFrom: "2026-01-01T00:00:00.000Z", accountValidUntil: null, accountVersion: 2,
  organizations: [], departments: [], positions: [],
  roles: [{ assignmentId, stableCode: "ROLE_VENDOR_USER", validFrom: "2026-01-01T00:00:00.000Z", validUntil: null, evidenceId: assignmentId }],
  permissions: [{ assignmentId, stableCode: "contract.detail.read", validFrom: "2026-01-01T00:00:00.000Z", validUntil: null, evidenceId: assignmentId }],
  vendorMemberships: [{ vendorUserId: assignmentId, vendorId: "30000000-0000-4000-8000-000000000001", status: "ACTIVE", validFrom: "2026-01-01T00:00:00.000Z", validUntil: null, evidenceId: assignmentId }],
  actingAuthorities: [], securityEntitlements: ["ENTITLEMENT_VENDOR_PORTAL"], evidenceIds: [assignmentId]
};

describe("M03 PostgresActorContextSource", () => {
  it("loads a server snapshot and composes only an explicit typed scope extension", async () => {
    const calls: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const connection: SqlConnection = {
      query: async (sql, parameters = []) => {
        calls.push({ sql, parameters });
        return sql.includes("resolve_active_actor_context_snapshot") ? { rows: [{ snapshot }], rowCount: 1 } as never : { rows: [], rowCount: 0 } as never;
      },
      release: () => undefined
    };
    const pool: SqlPool = { connect: async () => connection };
    const scopeExtension: ActorScopeExtensionSource = {
      load: async (loadedUserId, atTime) => {
        expect(loadedUserId).toBe(uuid(userId));
        expect(atTime).toBe(requestTime);
        return [{
          grantId: uuid("40000000-0000-4000-8000-000000000001"), scopeKind: "CONTRACT",
          targetId: uuid("50000000-0000-4000-8000-000000000001"), actionSetId: stableCode("VENDOR_CONTRACT_READ"),
          actionSetVersion: version(1), actions: [stableCode("contract.detail.read")], vendorUserId: uuid(assignmentId),
          validFrom: utcInstant("2026-01-01T00:00:00Z"), evidenceId: uuid("60000000-0000-4000-8000-000000000001")
        }];
      }
    };
    const source = new PostgresActorContextSource(pool, scopeExtension);
    const verifier: AuthSessionVerifier = { verify: async () => ({ authSubject: "verified-subject", sessionId: "session", expiresAt: utcInstant("2026-09-01T00:00:00Z"), assuranceLevel: "AAL2" }) };
    const actor = await new TrustedActorContextFactory(verifier, source, { now: () => requestTime }).create("token", correlationId("request:source"));

    expect(calls.map((call) => call.sql)).toEqual(["begin read only", "set local role youone_identity_resolver", "set local row_security = on", expect.stringContaining("resolve_active_actor_context_snapshot"), "commit"]);
    expect(calls[3]?.parameters).toEqual(["verified-subject", "session", requestTime]);
    expect(actor.actorKind).toBe("VENDOR");
    expect(actor.roles).toEqual(["ROLE_VENDOR_USER"]);
    expect(actor.permissions).toEqual(["contract.detail.read"]);
    expect(actor.securityEntitlements).toEqual(["ENTITLEMENT_VENDOR_PORTAL"]);
    expect(actor.scopeGrants).toHaveLength(1);
  });

  it("rolls back and releases when resolver execution fails", async () => {
    const calls: string[] = [];
    let released = false;
    const connection: SqlConnection = {
      query: async (sql) => {
        calls.push(sql);
        if (sql.includes("resolve_active_actor_context_snapshot")) throw new Error("resolver failed");
        return { rows: [], rowCount: 0 };
      },
      release: () => { released = true; }
    };
    const pool: SqlPool = { connect: async () => connection };
    await expect(new PostgresActorContextSource(pool).load("verified-subject", "session", requestTime)).rejects.toThrow("resolver failed");
    expect(calls).toEqual(["begin read only", "set local role youone_identity_resolver", "set local row_security = on", expect.stringContaining("resolve_active_actor_context_snapshot"), "rollback"]);
    expect(released).toBe(true);
  });
});

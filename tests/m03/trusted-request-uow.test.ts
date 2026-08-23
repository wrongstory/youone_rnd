import { describe, expect, it } from "vitest";

import { TrustedActorContextFactory, type ActorContextSource } from "../../packages/core/authorization/src/public.js";
import type { AuthSessionVerifier, IdentitySnapshot } from "../../packages/core/identity/src/public.js";
import { createTrustedRequestUnitOfWork } from "../../packages/infrastructure/postgres/src/request.js";
import { correlationId, stableCode, utcInstant, uuid } from "../../packages/shared-kernel/src/public.js";
import type { ActorContext, TrustedActorContext } from "../../packages/core/authorization/src/public.js";
import type { SqlConnection, SqlPool } from "../../packages/infrastructure/postgres/src/driver.js";

function actor(): ActorContext {
  const userId = uuid("10000000-0000-4000-8000-000000000001");
  return {
    actorKind: "INTERNAL",
    authenticatedActorId: userId,
    effectiveActorId: userId,
    authSubject: "verified-subject",
    sessionId: "verified-session",
    assuranceLevel: "AAL2",
    requestTime: utcInstant("2026-08-21T12:00:00Z"),
    correlationId: correlationId("request:m03"),
    organizations: [stableCode("ORG_LAB")],
    departments: [],
    positions: [],
    roles: [],
    permissions: [],
    vendorMemberships: [],
    scopeGrants: [],
    actingAuthorities: [],
    securityEntitlements: [],
    evidenceIds: []
  };
}

describe("M03 trusted request transaction", () => {
  it("sets trusted request time and session context from ActorContext", async () => {
    const calls: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const connection: SqlConnection = {
      query: async (sql, parameters = []) => {
        calls.push({ sql, parameters });
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined
    };
    const pool: SqlPool = { connect: async () => connection };

    const untrusted = actor();
    const authorityId = uuid("20000000-0000-4000-8000-000000000001");
    const identity: IdentitySnapshot = {
      userId: untrusted.authenticatedActorId, authSubject: untrusted.authSubject, accountKind: "INTERNAL", accountStatus: "ACTIVE",
      accountValidFrom: utcInstant("2026-01-01T00:00:00Z"), accountVersion: 1 as IdentitySnapshot["accountVersion"],
      organizations: [], departments: [], positions: [], roles: [], permissions: [], vendorMemberships: [], actingAuthorities: [{
        assignmentId: authorityId, roleId: stableCode("ROLE_LAB_DIRECTOR"), effectiveActorId: untrusted.effectiveActorId,
        allowedActions: [stableCode("approval.step.approve")], validFrom: utcInstant("2026-01-01T00:00:00Z"),
        validUntil: utcInstant("2026-09-01T00:00:00Z"), evidenceId: uuid("20000000-0000-4000-8000-000000000002")
      }], evidenceIds: []
    };
    const verifier: AuthSessionVerifier = { verify: async () => ({ authSubject: identity.authSubject, sessionId: untrusted.sessionId, assuranceLevel: "AAL2", expiresAt: utcInstant("2026-09-01T00:00:00Z") }) };
    const source: ActorContextSource = { load: async () => ({ identity, scopeGrants: [], securityEntitlements: [] }) };
    const trusted = await new TrustedActorContextFactory(verifier, source, { now: () => untrusted.requestTime }).create("token", untrusted.correlationId, authorityId);
    await createTrustedRequestUnitOfWork(pool).execute(trusted, async () => "done");

    const requestRoleIndex = calls.findIndex((call) => call.sql.includes("set local role youone_request"));
    const actorContextIndex = calls.findIndex((call) => call.sql.includes("app.actor_user_id"));
    expect(requestRoleIndex).toBeGreaterThan(-1);
    expect(actorContextIndex).toBeGreaterThan(requestRoleIndex);
    expect(calls.some((call) => call.sql.includes("app.actor_user_id") && call.parameters[1] === actor().authenticatedActorId)).toBe(true);
    expect(calls.some((call) => call.sql.includes("app.request_time") && call.parameters[0] === actor().requestTime)).toBe(true);
    expect(calls.some((call) => call.sql.includes("app.session_id") && call.parameters[1] === "verified-session")).toBe(true);
    expect(calls.some((call) => call.sql.includes("app.acting_authority_id") && call.parameters[3] === authorityId)).toBe(true);
  });

  it("rejects a structurally forged request ActorContext", async () => {
    const connection: SqlConnection = { query: async () => ({ rows: [], rowCount: 0 }), release: () => undefined };
    const pool: SqlPool = { connect: async () => connection };
    await expect(createTrustedRequestUnitOfWork(pool).execute(actor() as TrustedActorContext, async () => undefined)).rejects.toThrow(/not produced/);
  });
});

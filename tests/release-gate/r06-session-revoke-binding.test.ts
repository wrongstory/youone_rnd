import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationService,
  TrustedActorContextFactory,
  TrustedResourceContextFactory,
  type ActorContextSource
} from "../../packages/core/authorization/src/public.js";
import type { IdentitySnapshot } from "../../packages/core/identity/src/public.js";
import {
  DISABLE_USER_ACTION,
  SupabaseGlobalSessionRevokeAdapter,
  SupabaseTargetSessionBindingService,
  type ServiceAuthAuditBoundary,
  type SupabaseTargetSessionVerificationPort,
  type TrustedTargetSessionBinding,
  type VerifiedTargetSession
} from "../../packages/infrastructure/supabase-auth/src/service.js";
import { correlationId, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const now = utcInstant("2026-08-23T12:00:00.000Z");
const actorId = uuid("26000000-0000-4000-8000-000000000001");
const targetId = uuid("26000000-0000-4000-8000-000000000002");
const organizationId = uuid("26000000-0000-4000-8000-000000000003");
const grantId = uuid("26000000-0000-4000-8000-000000000004");
const evidenceId = uuid("26000000-0000-4000-8000-000000000005");
const sessionId = "26000000-0000-4000-8000-000000000006";
const issuer = "https://tenant.supabase.co/auth/v1";
const targetSubject = "provider-target-subject";
const targetToken = "header.payload.signature";

function snapshot(): IdentitySnapshot {
  return {
    userId: actorId,
    authSubject: "r06-operator",
    accountKind: "INTERNAL",
    accountStatus: "ACTIVE",
    accountValidFrom: utcInstant("2026-01-01T00:00:00.000Z"),
    accountVersion: version(1),
    organizations: [],
    departments: [],
    positions: [],
    roles: [],
    permissions: [{
      assignmentId: uuid("26000000-0000-4000-8000-000000000007"),
      stableCode: DISABLE_USER_ACTION,
      validFrom: utcInstant("2026-01-01T00:00:00.000Z"),
      evidenceId
    }],
    vendorMemberships: [],
    actingAuthorities: [],
    evidenceIds: [evidenceId]
  };
}

async function authorizedTarget() {
  const source: ActorContextSource = {
    load: async () => ({
      identity: snapshot(),
      scopeGrants: [{
        grantId,
        scopeKind: "ORGANIZATION",
        targetId: organizationId,
        actionSetId: stableCode("R06_IDENTITY_ADMIN_V1"),
        actionSetVersion: version(1),
        actions: [DISABLE_USER_ACTION],
        validFrom: utcInstant("2026-01-01T00:00:00.000Z"),
        evidenceId
      }],
      securityEntitlements: []
    })
  };
  const actor = await new TrustedActorContextFactory(
    { verify: async () => ({ authSubject: "r06-operator", sessionId: "r06-operator-session", expiresAt: utcInstant("2026-08-23T13:00:00.000Z"), assuranceLevel: "AAL2" }) },
    source,
    { now: () => now }
  ).create("opaque-operator-token", correlationId("request:r06-session-revoke"));
  const resource = await new TrustedResourceContextFactory({
    load: async () => ({
      resourceType: stableCode("USER_ACCOUNT"),
      resourceId: targetId,
      owningOrganizationId: organizationId,
      authSubject: targetSubject,
      workflowAllows: true,
      securityAllows: true,
      explicitDeny: false
    })
  }).load({ resourceType: stableCode("USER_ACCOUNT"), resourceId: targetId }, now);
  if (resource === null) throw new Error("missing test resource");
  const authorization = new AuthorizationService().decide(actor, { action: DISABLE_USER_ACTION, resource });
  return { actor, resource, authorization };
}

function verified(overrides: Partial<VerifiedTargetSession> = {}): VerifiedTargetSession {
  return { authSubject: targetSubject, sessionId, issuer, ...overrides };
}

describe("R06 Supabase 대상 세션 결합 및 폐기 경계", () => {
  it("JWT sub/session/issuer를 서버 대상과 활성 세션에 결합하고 global 폐기를 재확인한다", async () => {
    const trusted = await authorizedTarget();
    let revoked = false;
    const sessions: SupabaseTargetSessionVerificationPort = {
      verifyActiveToken: vi.fn(async () => verified()),
      resolveActiveSession: vi.fn(async () => revoked ? null : verified())
    };
    const signOut = vi.fn(async (token: string, scope: "global") => {
      expect(token).toBe(targetToken);
      expect(scope).toBe("global");
      revoked = true;
    });
    const auditCalls: unknown[] = [];
    const audit: ServiceAuthAuditBoundary = {
      audited: async (input, operation) => {
        auditCalls.push(input);
        return operation();
      }
    };
    const binding = await new SupabaseTargetSessionBindingService(sessions, issuer).bind({ ...trusted, targetAccessToken: targetToken });
    await new SupabaseGlobalSessionRevokeAdapter({ signOut }, sessions, audit).revoke(binding);

    expect(sessions.verifyActiveToken).toHaveBeenCalledWith(targetToken);
    expect(sessions.resolveActiveSession).toHaveBeenNthCalledWith(1, sessionId);
    expect(sessions.resolveActiveSession).toHaveBeenNthCalledWith(2, sessionId);
    expect(signOut).toHaveBeenCalledOnce();
    expect(auditCalls).toMatchObject([{ action: DISABLE_USER_ACTION, resourceId: targetId }]);
  });

  it.each([
    ["sub", verified({ authSubject: "other-target" })],
    ["session_id", verified({ sessionId: "26000000-0000-4000-8000-000000000009" })],
    ["issuer", verified({ issuer: "https://other.supabase.co/auth/v1" })]
  ])("JWT %s 불일치를 fail-closed 처리한다", async (_field, tokenSession) => {
    const trusted = await authorizedTarget();
    const sessions: SupabaseTargetSessionVerificationPort = {
      verifyActiveToken: async () => tokenSession,
      resolveActiveSession: async () => verified()
    };
    await expect(new SupabaseTargetSessionBindingService(sessions, issuer).bind({ ...trusted, targetAccessToken: targetToken }))
      .rejects.toThrow("target session binding failed");
  });

  it("위조 binding과 provider 오류를 비밀값 없는 고정 오류로 차단한다", async () => {
    const trusted = await authorizedTarget();
    const sessions: SupabaseTargetSessionVerificationPort = {
      verifyActiveToken: async () => { throw new Error(`Authorization: Bearer ${targetToken}`); },
      resolveActiveSession: async () => { throw new Error("must not resolve"); }
    };
    let bindingError = "";
    try {
      await new SupabaseTargetSessionBindingService(sessions, issuer).bind({ ...trusted, targetAccessToken: targetToken });
    } catch (error) {
      bindingError = error instanceof Error ? error.message : String(error);
    }
    expect(bindingError).toBe("target session verification failed");
    expect(bindingError).not.toContain(targetToken);

    const signOut = vi.fn(async () => undefined);
    const audit: ServiceAuthAuditBoundary = { audited: async (_input, operation) => operation() };
    const revoke = new SupabaseGlobalSessionRevokeAdapter({ signOut }, sessions, audit);
    await expect(revoke.revoke(Object.freeze({}) as TrustedTargetSessionBinding)).rejects.toThrow(/not produced by the trusted binder/);
    expect(signOut).not.toHaveBeenCalled();
  });
});

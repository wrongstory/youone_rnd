import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  SupabaseOperationalAuthError,
  SupabaseOperationalAuthGateway,
  type OperationalAuthProvider,
  type OperationalProviderSession
} from "../../packages/infrastructure/supabase-auth/src/operational.js";
import { createOperationalAuthHttp } from "../../apps/web/src/composition/operational-auth.js";

const session = Object.freeze({
  accessToken: "access-token-that-is-long-enough",
  refreshToken: "refresh-token-that-is-long-enough",
  expiresInSeconds: 3_600
}) satisfies OperationalProviderSession;
const renewed = Object.freeze({
  accessToken: "renewed-access-token-long-enough",
  refreshToken: "renewed-refresh-token-long-enough",
  expiresInSeconds: 3_600
}) satisfies OperationalProviderSession;
const factorId = "58000000-0000-4000-8000-000000000001";
const csrf = "csrf-token-that-is-long-enough-for-validation";
const authSubject = "58000000-0000-4000-8000-000000000010";
const providerSessionId = "58000000-0000-4000-8000-000000000011";
const rateLimitPolicyId = "58000000-0000-4000-8000-000000000013";
const rateLimitFingerprintSecret = "test-auth-rate-limit-secret-that-is-long-enough";
const rateSubjectNonce = "R".repeat(43);
const rateSubjectSignature = createHmac("sha256", rateLimitFingerprintSecret)
  .update("YOUONE_AUTH_RATE_SUBJECT_V1\0", "utf8")
  .update(rateSubjectNonce, "utf8")
  .digest("base64url");
const rateSubject = `${rateSubjectNonce}.${rateSubjectSignature}`;

function authProtection() {
  return {
    abusePrevention: {
      consume: vi.fn(async () => ({ allowed: true, policyVersionId: rateLimitPolicyId, retryAfterSeconds: 0 })),
      recordOutcome: vi.fn(async () => undefined)
    },
    rateLimitFingerprintSecret,
    rateLimitPolicyVersion: "AUTH_RATE_LIMIT_TEST_V1"
  } as const;
}

function actor() {
  return Object.freeze({
    actorKind: "INTERNAL",
    assuranceLevel: "AAL2",
    authenticatedActorId: "58000000-0000-4000-8000-000000000012",
    effectiveActorId: "58000000-0000-4000-8000-000000000012",
    authSubject,
    sessionId: providerSessionId,
    requestTime: "2026-08-24T12:00:00.000Z",
    correlationId: "request:logout-test",
    organizations: [],
    departments: [],
    positions: [],
    roles: [],
    permissions: [],
    vendorMemberships: [],
    scopeGrants: [],
    actingAuthorities: [],
    securityEntitlements: [],
    evidenceIds: []
  }) as never;
}

function provider(overrides: Partial<OperationalAuthProvider> = {}): OperationalAuthProvider {
  return {
    signIn: vi.fn(async () => session),
    refresh: vi.fn(async () => renewed),
    assurance: vi.fn(async () => ({ currentLevel: "aal1", nextLevel: "aal2" })),
    verifiedTotpFactors: vi.fn(async () => [{ id: factorId }]),
    enrollTotp: vi.fn(async () => ({
      factorId,
      manualSecret: "TOTP-MANUAL-SECRET",
      qrCode: "<svg>private enrollment QR</svg>"
    })),
    verifyTotp: vi.fn(async () => renewed),
    recover: vi.fn(async () => undefined),
    signOutGlobally: vi.fn(async () => undefined),
    ...overrides
  };
}

function authRequest(path: string, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `youone-csrf=${csrf}; youone-access=${session.accessToken}; youone-refresh=${session.refreshToken}; youone-mfa-factor=${factorId}; youone-auth-rate-subject=${rateSubject}`,
      origin: "http://localhost",
      "x-csrf-token": csrf,
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });
}

describe("#58 operational Supabase Auth gateway", () => {
  it("classifies AAL2, enrollment, and a single verified TOTP factor without returning credentials", async () => {
    const aal2Provider = provider({ assurance: vi.fn(async () => ({ currentLevel: "aal2", nextLevel: "aal2" })) });
    const authenticated = await new SupabaseOperationalAuthGateway(aal2Provider).login("user@example.com", "credential");
    expect(authenticated).toMatchObject({ nextAction: "AUTHENTICATED" });
    expect(aal2Provider.verifiedTotpFactors).not.toHaveBeenCalled();

    const enrollProvider = provider({ verifiedTotpFactors: vi.fn(async () => []) });
    await expect(new SupabaseOperationalAuthGateway(enrollProvider).login("user@example.com", "credential"))
      .resolves.toMatchObject({ nextAction: "MFA_ENROLL" });

    const challenge = await new SupabaseOperationalAuthGateway(provider()).login("user@example.com", "credential");
    expect(challenge).toMatchObject({ nextAction: "MFA_CHALLENGE", factorId });
  });

  it("fails closed when verified TOTP selection is ambiguous or verification does not reach aal2", async () => {
    const ambiguous = provider({ verifiedTotpFactors: vi.fn(async () => [{ id: factorId }, { id: `${factorId.slice(0, -1)}2` }]) });
    await expect(new SupabaseOperationalAuthGateway(ambiguous).login("user@example.com", "credential"))
      .rejects.toMatchObject({ reasonCode: "AUTH_MFA_FACTOR_AMBIGUOUS" });
    expect(ambiguous.signOutGlobally).toHaveBeenCalledWith(session);

    const insufficient = provider({ assurance: vi.fn(async () => ({ currentLevel: "aal1", nextLevel: "aal2" })) });
    await expect(new SupabaseOperationalAuthGateway(insufficient).verifyTotp(session, factorId, "123456"))
      .rejects.toMatchObject({ reasonCode: "AUTH_MFA_CODE_INVALID" });
    expect(insufficient.signOutGlobally).toHaveBeenCalledWith(renewed);
  });

  it("issues a same-site CSRF contract and rejects login before provider dispatch when origin or token is invalid", async () => {
    const authProvider = provider();
    const http = createOperationalAuthHttp({
      ...authProtection(),
      gateway: new SupabaseOperationalAuthGateway(authProvider),
      expectedOrigin: "http://localhost",
      production: false,
      randomToken: () => csrf
    });
    const csrfResponse = await http.csrf(new Request("http://localhost/api/auth/csrf"));
    expect(await csrfResponse.json()).toEqual({ outcome: "SUCCESS", csrfToken: csrf });
    expect(csrfResponse.headers.get("set-cookie")).toContain("youone-csrf=");
    expect(csrfResponse.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(csrfResponse.headers.get("set-cookie")).not.toContain("HttpOnly");

    const rejected = await http.login(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "user@example.com", credential: "valid-password" })
    }));
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toEqual({ outcome: "REJECTED", reasonCode: "AUTH_ORIGIN_INVALID" });
    expect(authProvider.signIn).not.toHaveBeenCalled();

    const spoofedHost = await http.login(new Request("http://attacker.example/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `youone-csrf=${csrf}`,
        origin: "http://attacker.example",
        "x-csrf-token": csrf
      },
      body: JSON.stringify({ identifier: "user@example.com", credential: "valid-password" })
    }));
    expect(spoofedHost.status).toBe(403);
    expect(authProvider.signIn).not.toHaveBeenCalled();
  });

  it("stores provider sessions only in HttpOnly cookies and returns a stable MFA action", async () => {
    const http = createOperationalAuthHttp({
      ...authProtection(),
      gateway: new SupabaseOperationalAuthGateway(provider()),
      expectedOrigin: "http://localhost",
      production: false
    });
    const response = await http.login(authRequest("/api/auth/login", {
      identifier: "USER@EXAMPLE.COM",
      credential: "valid-password"
    }));
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toBe('{"outcome":"SUCCESS","nextAction":"MFA_CHALLENGE"}');
    expect(serialized).not.toContain(session.accessToken);
    expect(serialized).not.toContain(session.refreshToken);
    expect(serialized).not.toContain(factorId);
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("youone-access=");
    expect(cookies).toContain("youone-refresh=");
    expect(cookies).toContain("youone-mfa-factor=");
    expect(cookies).toContain("youone-auth-rate-subject=");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=Strict");
  });

  it("blocks provider dispatch when the distributed limiter denies and returns a bounded Retry-After", async () => {
    const authProvider = provider();
    const abusePrevention = {
      consume: vi.fn(async () => ({ allowed: false, policyVersionId: rateLimitPolicyId, retryAfterSeconds: 42 })),
      recordOutcome: vi.fn(async () => undefined)
    };
    const http = createOperationalAuthHttp({
      abusePrevention,
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(authProvider),
      production: false,
      rateLimitFingerprintSecret,
      rateLimitPolicyVersion: "AUTH_RATE_LIMIT_TEST_V1"
    });

    const response = await http.login(authRequest("/api/auth/login", {
      identifier: "user@example.com",
      credential: "valid-password"
    }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(await response.json()).toEqual({ outcome: "REJECTED", reasonCode: "AUTH_RATE_LIMITED" });
    expect(authProvider.signIn).not.toHaveBeenCalled();
    expect(abusePrevention.recordOutcome).not.toHaveBeenCalled();
  });

  it("persists only HMAC fingerprints and stable outcome codes for successful Auth attempts", async () => {
    const attempts: unknown[] = [];
    const outcomes: unknown[] = [];
    const abusePrevention = {
      consume: vi.fn(async (attempt: unknown) => {
        attempts.push(attempt);
        return { allowed: true, policyVersionId: rateLimitPolicyId, retryAfterSeconds: 0 };
      }),
      recordOutcome: vi.fn(async (attempt: unknown, outcome: unknown) => {
        attempts.push(attempt);
        outcomes.push(outcome);
      })
    };
    const ids = [
      "58000000-0000-4000-8000-000000000050",
      "58000000-0000-4000-8000-000000000051",
      "58000000-0000-4000-8000-000000000052"
    ];
    const http = createOperationalAuthHttp({
      abusePrevention,
      authAttemptIdGenerator: () => ids.shift() ?? "",
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(provider()),
      now: () => new Date("2026-08-24T12:02:00.000Z"),
      production: false,
      rateLimitFingerprintSecret,
      rateLimitPolicyVersion: "AUTH_RATE_LIMIT_TEST_V1"
    });

    const response = await http.login(authRequest("/api/auth/login", {
      identifier: "USER@EXAMPLE.COM",
      credential: "valid-password"
    }, { "x-correlation-id": "request:rate-limit-audit" }));
    expect(response.status).toBe(200);
    const serializedEvidence = JSON.stringify({ attempts, outcomes });
    expect(serializedEvidence).not.toContain("user@example.com");
    expect(serializedEvidence).not.toContain("valid-password");
    expect(serializedEvidence).not.toContain(session.accessToken);
    expect(serializedEvidence).not.toContain(session.refreshToken);
    expect(serializedEvidence).not.toContain(rateSubject);
    expect(serializedEvidence).not.toContain(rateSubjectNonce);
    expect(attempts[0]).toMatchObject({
      action: "LOGIN",
      attemptId: "58000000-0000-4000-8000-000000000050",
      policyVersion: "AUTH_RATE_LIMIT_TEST_V1"
    });
    expect(outcomes[0]).toEqual({
      auditId: "58000000-0000-4000-8000-000000000052",
      policyVersionId: rateLimitPolicyId,
      reasonCode: "AUTH_REQUEST_COMPLETED",
      result: "SUCCEEDED"
    });
  });

  it("fails closed before provider dispatch when rate-limit policy evidence is unavailable", async () => {
    const authProvider = provider();
    const http = createOperationalAuthHttp({
      abusePrevention: {
        consume: vi.fn(async () => { throw new Error("policy unavailable"); }),
        recordOutcome: vi.fn(async () => undefined)
      },
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(authProvider),
      production: false,
      rateLimitFingerprintSecret,
      rateLimitPolicyVersion: "AUTH_RATE_LIMIT_TEST_V1"
    });
    const response = await http.login(authRequest("/api/auth/login", {
      identifier: "user@example.com",
      credential: "valid-password"
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ outcome: "UNAVAILABLE", reasonCode: "AUTH_PROVIDER_UNAVAILABLE" });
    expect(authProvider.signIn).not.toHaveBeenCalled();
  });

  it("compensates a newly issued provider session when durable result audit cannot commit", async () => {
    const authProvider = provider();
    const http = createOperationalAuthHttp({
      abusePrevention: {
        consume: vi.fn(async () => ({ allowed: true, policyVersionId: rateLimitPolicyId, retryAfterSeconds: 0 })),
        recordOutcome: vi.fn(async () => { throw new Error("audit unavailable"); })
      },
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(authProvider),
      production: false,
      rateLimitFingerprintSecret,
      rateLimitPolicyVersion: "AUTH_RATE_LIMIT_TEST_V1"
    });
    const response = await http.login(authRequest("/api/auth/login", {
      identifier: "user@example.com",
      credential: "valid-password"
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ outcome: "UNAVAILABLE", reasonCode: "AUTH_PROVIDER_UNAVAILABLE" });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(authProvider.signOutGlobally).toHaveBeenCalledWith(session);
  });

  it("uses valid Secure __Host cookies in production", async () => {
    const http = createOperationalAuthHttp({
      ...authProtection(),
      gateway: new SupabaseOperationalAuthGateway(provider()),
      expectedOrigin: "https://rnd.youone.example",
      production: true,
      randomToken: () => csrf,
      rateLimitSubjectGenerator: () => rateSubjectNonce
    });
    const csrfResponse = await http.csrf(new Request("https://rnd.youone.example/api/auth/csrf"));
    const csrfCookie = csrfResponse.headers.get("set-cookie") ?? "";
    expect(csrfCookie).toContain("__Host-youone-csrf=");
    expect(csrfCookie).toContain("Path=/");
    expect(csrfCookie).toContain("Secure");

    const login = await http.login(new Request("https://rnd.youone.example/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `__Host-youone-csrf=${csrf}`,
        origin: "https://rnd.youone.example",
        "x-csrf-token": csrf
      },
      body: JSON.stringify({ identifier: "user@example.com", credential: "valid-password" })
    }));
    const cookies = login.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("__Host-youone-access=");
    expect(cookies).toContain("__Host-youone-refresh=");
    expect(cookies).toContain("__Host-youone-mfa-factor=");
    expect(cookies).toContain(`__Host-youone-auth-rate-subject=${rateSubject}`);
    expect(cookies).not.toContain("Path=/api");
  });

  it("keeps one stable limiter subject across rotated refresh tokens and fails closed when it is absent", async () => {
    const capturedAttempts: Array<{ subjectFingerprint?: string }> = [];
    const authProvider = provider();
    const http = createOperationalAuthHttp({
      abusePrevention: {
        consume: vi.fn(async (attempt) => {
          capturedAttempts.push(attempt);
          return { allowed: true, policyVersionId: rateLimitPolicyId, retryAfterSeconds: 0 };
        }),
        recordOutcome: vi.fn(async () => undefined)
      },
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(authProvider),
      production: false,
      rateLimitFingerprintSecret,
      rateLimitPolicyVersion: "AUTH_RATE_LIMIT_TEST_V1"
    });

    expect((await http.refresh(authRequest("/api/auth/refresh", {}))).status).toBe(200);
    expect((await http.refresh(authRequest("/api/auth/refresh", {}, {
      cookie: `youone-csrf=${csrf}; youone-access=${renewed.accessToken}; youone-refresh=${renewed.refreshToken}; youone-mfa-factor=${factorId}; youone-auth-rate-subject=${rateSubject}`
    }))).status).toBe(200);
    expect(capturedAttempts).toHaveLength(2);
    expect(capturedAttempts[0]?.subjectFingerprint).toBe(capturedAttempts[1]?.subjectFingerprint);

    const withoutStableSubject = await http.refresh(authRequest("/api/auth/refresh", {}, {
      cookie: `youone-csrf=${csrf}; youone-access=${session.accessToken}; youone-refresh=${session.refreshToken}`
    }));
    expect(withoutStableSubject.status).toBe(401);
    expect(authProvider.refresh).toHaveBeenCalledTimes(2);
  });

  it("rejects a tampered limiter-subject MAC before limiter or provider dispatch for every session mutation", async () => {
    const authProvider = provider();
    const abusePrevention = {
      consume: vi.fn(async () => ({ allowed: true, policyVersionId: rateLimitPolicyId, retryAfterSeconds: 0 })),
      recordOutcome: vi.fn(async () => undefined)
    };
    const http = createOperationalAuthHttp({
      abusePrevention,
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(authProvider),
      production: false,
      rateLimitFingerprintSecret,
      rateLimitPolicyVersion: "AUTH_RATE_LIMIT_TEST_V1"
    });
    const tamperedSubject = `${rateSubjectNonce}.${"A".repeat(43)}`;
    const tamperedCookie = `youone-csrf=${csrf}; youone-access=${session.accessToken}; youone-refresh=${session.refreshToken}; youone-mfa-factor=${factorId}; youone-auth-rate-subject=${tamperedSubject}`;

    const responses = await Promise.all([
      http.enroll(authRequest("/api/auth/mfa/enroll", {}, { cookie: tamperedCookie })),
      http.verify(authRequest("/api/auth/mfa/verify", { code: "123456" }, { cookie: tamperedCookie })),
      http.refresh(authRequest("/api/auth/refresh", {}, { cookie: tamperedCookie })),
      http.logout(authRequest("/api/auth/logout", {}, { cookie: tamperedCookie }))
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
    expect(abusePrevention.consume).not.toHaveBeenCalled();
    expect(authProvider.enrollTotp).not.toHaveBeenCalled();
    expect(authProvider.verifyTotp).not.toHaveBeenCalled();
    expect(authProvider.refresh).not.toHaveBeenCalled();
    expect(authProvider.signOutGlobally).not.toHaveBeenCalled();
  });

  it("compensates a provider session when response construction fails after successful login", async () => {
    const authProvider = provider({
      verifiedTotpFactors: vi.fn(async () => [{ id: "invalid-factor-id" }])
    });
    const http = createOperationalAuthHttp({
      ...authProtection(),
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(authProvider),
      production: false
    });
    const response = await http.login(authRequest("/api/auth/login", {
      identifier: "user@example.com",
      credential: "valid-password"
    }));
    expect(response.status).toBe(409);
    expect(authProvider.signOutGlobally).toHaveBeenCalledWith(session);
  });

  it("derives the current actor from the HttpOnly access cookie without exposing permission internals", async () => {
    const actors = {
      create: vi.fn(async () => Object.freeze({
        actorKind: "INTERNAL",
        assuranceLevel: "AAL2",
        authenticatedActorId: "58000000-0000-4000-8000-000000000010",
        effectiveActorId: "58000000-0000-4000-8000-000000000010",
        organizations: ["ORG_YOUONE"],
        departments: ["DEPT_RND"],
        positions: ["POSITION_RESEARCHER"],
        roles: ["ROLE_RESEARCHER"],
        permissions: ["project.record.create"]
      }) as never)
    };
    const http = createOperationalAuthHttp({
      ...authProtection(),
      actors,
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(provider()),
      production: false
    });
    const response = await http.session(new Request("http://localhost/api/auth/session", {
      headers: { cookie: `youone-access=${session.accessToken}` }
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      outcome: "SUCCESS",
      actor: {
        accountKind: "INTERNAL",
        assuranceLevel: "AAL2",
        authenticatedUserAccountId: "58000000-0000-4000-8000-000000000010",
        effectiveUserAccountId: "58000000-0000-4000-8000-000000000010",
        organizations: ["ORG_YOUONE"],
        departments: ["DEPT_RND"],
        positions: ["POSITION_RESEARCHER"],
        roles: ["ROLE_RESEARCHER"]
      }
    });
    expect(JSON.stringify(body)).not.toContain("project.record.create");
  });

  it("keeps enrollment secrets out of logs/cookies and rotates the session only after aal2 verification", async () => {
    const authProvider = provider({
      assurance: vi.fn(async (accessToken) => ({
        currentLevel: accessToken === renewed.accessToken ? "aal2" : "aal1",
        nextLevel: "aal2"
      }))
    });
    const http = createOperationalAuthHttp({
      ...authProtection(),
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(authProvider),
      production: false
    });

    const enrollment = await http.enroll(authRequest("/api/auth/mfa/enroll", {}));
    expect(enrollment.status).toBe(200);
    expect(await enrollment.json()).toEqual({
      outcome: "SUCCESS",
      nextAction: "MFA_CHALLENGE",
      qrCode: "<svg>private enrollment QR</svg>",
      manualSecret: "TOTP-MANUAL-SECRET"
    });
    expect(enrollment.headers.get("set-cookie")).not.toContain("TOTP-MANUAL-SECRET");

    const verified = await http.verify(authRequest("/api/auth/mfa/verify", { code: "123456" }));
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ outcome: "SUCCESS", nextAction: "AUTHENTICATED" });
    expect(verified.headers.get("set-cookie")).toContain("renewed-access-token-long-enough");
  });

  it("binds global logout to the trusted actor and records exact session absence", async () => {
    const authProvider = provider();
    const sessions = { exists: vi.fn(async () => false) };
    const revocations = { record: vi.fn(async () => undefined) };
    const ids = [
      "58000000-0000-4000-8000-000000000020",
      "58000000-0000-4000-8000-000000000021"
    ];
    const http = createOperationalAuthHttp({
      ...authProtection(),
      actors: { create: vi.fn(async () => actor()) },
      gateway: new SupabaseOperationalAuthGateway(authProvider),
      expectedOrigin: "http://localhost",
      idGenerator: () => ids.shift() ?? "",
      now: () => new Date("2026-08-24T12:01:00.000Z"),
      production: false,
      revocations,
      sessions,
      wait: vi.fn(async () => undefined)
    });
    const response = await http.logout(authRequest("/api/auth/logout", {}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "SUCCESS", nextAction: "LOGIN", revocation: "CONFIRMED" });
    expect(authProvider.signOutGlobally).toHaveBeenCalledOnce();
    expect(sessions.exists).toHaveBeenCalledWith(authSubject, providerSessionId);
    expect(revocations.record).toHaveBeenCalledWith(actor(), expect.objectContaining({
      outcome: "CONFIRMED",
      operationId: "58000000-0000-4000-8000-000000000021"
    }));
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("youone-access=; Path=/; Max-Age=0");
    expect(cookies).toContain("youone-refresh=; Path=/; Max-Age=0");
    expect(cookies).not.toContain(session.accessToken);
    expect(cookies).not.toContain(session.refreshToken);
  });

  it("retries exact absence three times and durably schedules 15-minute reconciliation", async () => {
    const authProvider = provider({
      signOutGlobally: vi.fn(async () => { throw new SupabaseOperationalAuthError("AUTH_PROVIDER_UNAVAILABLE"); })
    });
    const sessions = { exists: vi.fn(async () => true) };
    const revocations = { record: vi.fn(async () => undefined) };
    const wait = vi.fn(async () => undefined);
    const ids = [
      "58000000-0000-4000-8000-000000000030",
      "58000000-0000-4000-8000-000000000031",
      "58000000-0000-4000-8000-000000000032"
    ];
    const http = createOperationalAuthHttp({
      ...authProtection(),
      actors: { create: vi.fn(async () => actor()) },
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(authProvider),
      idGenerator: () => ids.shift() ?? "",
      now: () => new Date("2026-08-24T12:01:00.000Z"),
      production: false,
      revocations,
      sessions,
      wait
    });

    const response = await http.logout(authRequest("/api/auth/logout", {}));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      outcome: "ACCEPTED",
      nextAction: "LOGIN",
      revocation: "RECONCILIATION_SCHEDULED"
    });
    expect(sessions.exists).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenNthCalledWith(1, 250);
    expect(revocations.record).toHaveBeenCalledWith(actor(), expect.objectContaining({
      outcome: "RECONCILIATION_SCHEDULED",
      reconciliationAt: "2026-08-24T12:16:00.000Z"
    }));
  });

  it("fails closed and clears cookies when durable revocation evidence cannot commit", async () => {
    const http = createOperationalAuthHttp({
      ...authProtection(),
      actors: { create: vi.fn(async () => actor()) },
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(provider()),
      idGenerator: (() => {
        const ids = [
          "58000000-0000-4000-8000-000000000040",
          "58000000-0000-4000-8000-000000000041"
        ];
        return () => ids.shift() ?? "";
      })(),
      production: false,
      revocations: { record: vi.fn(async () => { throw new Error("database unavailable"); }) },
      sessions: { exists: vi.fn(async () => false) }
    });
    const response = await http.logout(authRequest("/api/auth/logout", {}));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ outcome: "UNAVAILABLE", reasonCode: "AUTH_PROVIDER_UNAVAILABLE" });
    expect(response.headers.get("set-cookie")).toContain("youone-access=; Path=/; Max-Age=0");
  });

  it("clears stale cookies when refresh cannot establish a provider session", async () => {
    const http = createOperationalAuthHttp({
      ...authProtection(),
      expectedOrigin: "http://localhost",
      gateway: new SupabaseOperationalAuthGateway(provider({
        refresh: vi.fn(async () => { throw new SupabaseOperationalAuthError("AUTH_SESSION_REQUIRED"); })
      })),
      production: false
    });
    const response = await http.refresh(authRequest("/api/auth/refresh", {}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ outcome: "REJECTED", reasonCode: "AUTH_SESSION_REQUIRED" });
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("youone-access=; Path=/; Max-Age=0");
    expect(cookies).toContain("youone-refresh=; Path=/; Max-Age=0");
  });
});

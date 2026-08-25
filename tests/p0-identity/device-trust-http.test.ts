import { IdentityVerificationError, DeviceTrustPolicyUnavailableError } from "../../packages/core/identity/src/public.js";
import { sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";
import { describe, expect, it, vi } from "vitest";

import {
  createDeviceTrustHttp,
  deviceTrustHttp
} from "../../apps/web/src/composition/device-trust.js";
import * as activationRoute from "../../apps/web/src/app/api/auth/activation/route.js";
import * as enrollRoute from "../../apps/web/src/app/api/auth/device-trust/enroll/route.js";
import * as verifyRoute from "../../apps/web/src/app/api/auth/device-trust/verify/route.js";

const csrf = "csrf-token-long-enough-for-device-trust";
const accessA = "access-token-a-long-enough-for-validation";
const accessB = "access-token-b-long-enough-for-validation";
const accessC = "access-token-c-long-enough-for-validation";
const userA = uuid("65000000-0000-4000-8000-000000000001");
const userB = uuid("65000000-0000-4000-8000-000000000002");
const sessionA = "65000000-0000-4000-8000-000000000011";
const sessionB = "65000000-0000-4000-8000-000000000012";
const deviceTrustId = uuid("65000000-0000-4000-8000-000000000021");
const policyVersionId = uuid("65000000-0000-4000-8000-000000000031");
const hmacSecret = "device-trust-test-hmac-secret-that-is-long-enough";
const now = new Date("2026-08-25T05:00:00.000Z");
const nonce = "N".repeat(43);

function context(userAccountId: typeof userA, providerSessionId: string) {
  return Object.freeze({
    userAccountId,
    authSubject: userAccountId,
    accountKind: "INTERNAL",
    accountVersion: version(1),
    providerIssuer: "https://staging.supabase.co/auth/v1",
    providerProjectId: stableCode("YOUONE_STAGING_PRIMARY"),
    providerSessionId,
    assuranceLevel: "AAL2",
    authenticationMethod: "TOTP",
    totpEvidenceId: uuid("65000000-0000-4000-8000-000000000041"),
    activationEvidenceId: uuid("65000000-0000-4000-8000-000000000042"),
    activationEvidenceKind: "OD042_BOOTSTRAP",
    requestTime: utcInstant(now),
    correlationId: "request:device-trust-test",
    allowedActions: Object.freeze([
      "identity.device-trust.enroll.activation",
      "identity.device-trust.verify.activation",
      "identity.activation.readiness.read"
    ])
  }) as never;
}

function fixture(overrides: Readonly<{
  beginError?: Error;
  contextError?: Error;
  decisionReason?: "DEVICE_TRUST_POLICY_MISSING" | "DEVICE_TRUST_NOT_ACTIVE";
  readinessError?: Error;
}> = {}) {
  let pending: Readonly<Record<string, unknown>> | undefined;
  let consumed = false;
  const activateEnrollment = vi.fn(async (activationContext: ReturnType<typeof context>, id: string, credential: string) => {
    if (consumed || pending === undefined || pending.deviceTrustId !== id || pending.deviceCredentialHmac !== credential) {
      throw new IdentityVerificationError("DEVICE_TRUST_ENROLLMENT_INVALID_OR_REPLAYED");
    }
    consumed = true;
    return Object.freeze({
      ...pending,
      state: "ACTIVE",
      approvedAt: utcInstant(now),
      optimisticVersion: version(2)
    }) as never;
  });
  const beginEnrollment = vi.fn(async (activationContext: ReturnType<typeof context>, credential: ReturnType<typeof sha256>) => {
    if (overrides.beginError) throw overrides.beginError;
    pending = Object.freeze({
      deviceTrustId,
      userAccountId: activationContext.userAccountId,
      providerSessionId: activationContext.providerSessionId,
      deviceCredentialHmac: credential,
      state: "PENDING",
      authenticationMethod: "PASSWORD_TOTP_AAL2",
      policyVersionId,
      createdAt: utcInstant(now),
      expiresAt: utcInstant(new Date(now.getTime() + 3_600_000)),
      optimisticVersion: version(1)
    });
    return pending as never;
  });
  const verify = vi.fn(async () => overrides.decisionReason === undefined
    ? Object.freeze({
        trusted: true,
        reasonCode: "DEVICE_TRUST_ALLOWED",
        deviceTrustId,
        policyVersionId,
        userAccountId: pending?.userAccountId,
        providerSessionId: pending?.providerSessionId
      }) as never
    : Object.freeze({ trusted: false, reasonCode: overrides.decisionReason, policyVersionId }) as never);
  const create = vi.fn(async (accessToken: string) => {
    if (overrides.contextError) throw overrides.contextError;
    if (accessToken === accessA) return context(userA, sessionA);
    if (accessToken === accessB) return context(userB, sessionB);
    if (accessToken === accessC) return context(userA, sessionB);
    throw new IdentityVerificationError("verified session has no matching server identity");
  });
  const read = vi.fn(async () => {
    if (overrides.readinessError) throw overrides.readinessError;
    return Object.freeze({ ready: true, reasonCodes: Object.freeze([]), accountVersion: version(1) });
  });
  const http = createDeviceTrustHttp({
    activationContexts: { create } as never,
    activationReadiness: { read },
    deviceTrust: { activateEnrollment, beginEnrollment, verify },
    expectedOrigin: "http://localhost",
    hmacSecret,
    now: () => now,
    production: false,
    randomNonce: () => nonce
  });
  return { activateEnrollment, beginEnrollment, create, http, read, verify };
}

function postRequest(path: string, accessToken = accessA, additionalCookie = "", body: unknown = {}) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `youone-csrf=${csrf}; youone-access=${accessToken}${additionalCookie ? `; ${additionalCookie}` : ""}`,
      origin: "http://localhost",
      "x-csrf-token": csrf
    },
    body: JSON.stringify(body)
  });
}

function getRequest(accessToken = accessA, additionalCookie = "") {
  return new Request("http://localhost/api/auth/activation", {
    headers: {
      cookie: `youone-access=${accessToken}${additionalCookie ? `; ${additionalCookie}` : ""}`
    }
  });
}

function responseCookie(response: Response, name: string): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = new RegExp(`(?:^|, )${name}=([^;]*)`).exec(header);
  if (match?.[1] === undefined) throw new Error(`missing ${name}`);
  return `${name}=${match[1]}`;
}

describe("#65 DeviceTrust HTTP boundary", () => {
  it("exposes only the three dynamic Node route contracts and fails closed without server configuration", () => {
    expect(activationRoute).toMatchObject({ dynamic: "force-dynamic", runtime: "nodejs" });
    expect(enrollRoute).toMatchObject({ dynamic: "force-dynamic", runtime: "nodejs" });
    expect(verifyRoute).toMatchObject({ dynamic: "force-dynamic", runtime: "nodejs" });
    expect(typeof activationRoute.GET).toBe("function");
    expect(typeof enrollRoute.POST).toBe("function");
    expect(typeof verifyRoute.POST).toBe("function");
    expect(deviceTrustHttp({})).toBeNull();
  });

  it("enrolls and consumes a server nonce once before issuing an HttpOnly active trust cookie", async () => {
    const { http, activateEnrollment, read } = fixture();
    const enrollment = await http.enroll(postRequest("/api/auth/device-trust/enroll"));
    expect(enrollment.status).toBe(201);
    expect(await enrollment.json()).toEqual({ outcome: "PENDING", nextAction: "VERIFY" });
    expect(enrollment.headers.get("set-cookie")).toContain("youone-device-enrollment=");
    expect(enrollment.headers.get("set-cookie")).toContain("HttpOnly");
    expect(enrollment.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(enrollment.headers.get("set-cookie")).not.toContain("Secure");

    const enrollmentCookie = responseCookie(enrollment, "youone-device-enrollment");
    const activated = await http.verify(postRequest("/api/auth/device-trust/verify", accessA, enrollmentCookie));
    expect(activated.status).toBe(200);
    expect(await activated.json()).toEqual({ outcome: "SUCCESS", deviceTrustState: "ACTIVE" });
    const activeCookie = responseCookie(activated, "youone-device-trust");
    expect(activeCookie).not.toBe(enrollmentCookie.replace("enrollment", "trust"));
    expect(activateEnrollment).toHaveBeenCalledTimes(1);

    const readiness = await http.readiness(getRequest(accessA, activeCookie));
    expect(readiness.status).toBe(200);
    expect(await readiness.json()).toEqual({ outcome: "SUCCESS", activationState: "READY", reasonCodes: [] });
    expect(read).toHaveBeenCalledTimes(1);

    const replay = await http.verify(postRequest("/api/auth/device-trust/verify", accessA, enrollmentCookie));
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({
      outcome: "REJECTED",
      reasonCode: "DEVICE_TRUST_ENROLLMENT_INVALID_OR_REPLAYED"
    });
  });

  it("fails closed before persistence for tampered, cross-user, and cross-session enrollment cookies", async () => {
    const { http, activateEnrollment } = fixture();
    const enrollment = await http.enroll(postRequest("/api/auth/device-trust/enroll"));
    const cookie = responseCookie(enrollment, "youone-device-enrollment");
    const tampered = `${cookie.slice(0, -1)}${cookie.endsWith("A") ? "B" : "A"}`;

    const tamperedResponse = await http.verify(postRequest("/api/auth/device-trust/verify", accessA, tampered));
    expect(tamperedResponse.status).toBe(403);
    expect(activateEnrollment).not.toHaveBeenCalled();

    const crossIdentity = await http.verify(postRequest("/api/auth/device-trust/verify", accessB, cookie));
    expect(crossIdentity.status).toBe(403);
    const crossSession = await http.verify(postRequest("/api/auth/device-trust/verify", accessC, cookie));
    expect(crossSession.status).toBe(403);
    expect(activateEnrollment).not.toHaveBeenCalled();
  });

  it("rejects body-controlled identity, invalid origin/CSRF, and a missing access session before use cases", async () => {
    const { http, beginEnrollment, create } = fixture();
    const bodyIdentity = await http.enroll(postRequest("/api/auth/device-trust/enroll", accessA, "", { userId: userB }));
    expect(bodyIdentity.status).toBe(400);
    expect(create).not.toHaveBeenCalled();

    const origin = await http.enroll(new Request("http://attacker.example/api/auth/device-trust/enroll", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `youone-csrf=${csrf}; youone-access=${accessA}`,
        origin: "http://attacker.example",
        "x-csrf-token": csrf
      },
      body: "{}"
    }));
    expect(origin.status).toBe(403);

    const missingSession = await http.enroll(new Request("http://localhost/api/auth/device-trust/enroll", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `youone-csrf=${csrf}`,
        origin: "http://localhost",
        "x-csrf-token": csrf
      },
      body: "{}"
    }));
    expect(missingSession.status).toBe(401);
    expect(beginEnrollment).not.toHaveBeenCalled();
  });

  it("maps missing policy and provider/database failures to a secretless 503", async () => {
    const policy = fixture({ beginError: new DeviceTrustPolicyUnavailableError() });
    const unavailablePolicy = await policy.http.enroll(postRequest("/api/auth/device-trust/enroll"));
    expect(unavailablePolicy.status).toBe(503);
    expect(await unavailablePolicy.json()).toEqual({
      outcome: "UNAVAILABLE",
      reasonCode: "DEVICE_TRUST_POLICY_UNAVAILABLE"
    });

    const provider = fixture({ contextError: new IdentityVerificationError("Supabase session verification failed") });
    const unavailableProvider = await provider.http.enroll(postRequest("/api/auth/device-trust/enroll"));
    expect(unavailableProvider.status).toBe(503);
    expect(JSON.stringify(await unavailableProvider.json())).not.toMatch(/access-token|cookie|sessionA|userA/i);

    const database = fixture({ readinessError: new Error("database contained sensitive connection detail") });
    const enrolled = await database.http.enroll(postRequest("/api/auth/device-trust/enroll"));
    const verified = await database.http.verify(postRequest(
      "/api/auth/device-trust/verify",
      accessA,
      responseCookie(enrolled, "youone-device-enrollment")
    ));
    const failed = await database.http.readiness(getRequest(
      accessA,
      responseCookie(verified, "youone-device-trust")
    ));
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("sensitive connection detail");
  });

  it("does not evaluate account readiness when DeviceTrust is inactive or its policy is missing", async () => {
    for (const decisionReason of ["DEVICE_TRUST_NOT_ACTIVE", "DEVICE_TRUST_POLICY_MISSING"] as const) {
      const { http, read } = fixture({ decisionReason });
      const enrolled = await http.enroll(postRequest("/api/auth/device-trust/enroll"));
      const verified = await http.verify(postRequest(
        "/api/auth/device-trust/verify",
        accessA,
        responseCookie(enrolled, "youone-device-enrollment")
      ));
      const response = await http.readiness(getRequest(
        accessA,
        responseCookie(verified, "youone-device-trust")
      ));
      expect(response.status).toBe(decisionReason === "DEVICE_TRUST_POLICY_MISSING" ? 503 : 403);
      expect(read).not.toHaveBeenCalled();
    }
  });

  it("uses __Host-, Secure, HttpOnly, and SameSite=Strict for production device cookies", async () => {
    const base = fixture();
    const http = createDeviceTrustHttp({
      activationContexts: { create: base.create } as never,
      activationReadiness: { read: base.read },
      deviceTrust: {
        activateEnrollment: base.activateEnrollment,
        beginEnrollment: base.beginEnrollment,
        verify: base.verify
      },
      expectedOrigin: "https://staging.example.com",
      hmacSecret,
      now: () => now,
      production: true,
      randomNonce: () => nonce
    });
    const response = await http.enroll(new Request("https://staging.example.com/api/auth/device-trust/enroll", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `__Host-youone-csrf=${csrf}; __Host-youone-access=${accessA}`,
        origin: "https://staging.example.com",
        "x-csrf-token": csrf
      },
      body: "{}"
    }));
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(response.status).toBe(201);
    expect(setCookie).toContain("__Host-youone-device-enrollment=");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
  });
});

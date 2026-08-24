import type {
  OperationalAuthFailure,
  OperationalAuthReasonCode,
  OperationalAuthResponse,
  OperationalActorSessionResponse,
  OperationalCsrfResponse,
  OperationalMfaEnrollmentResponse,
  OperationalRecoveryResponse
} from "@youone/core-identity/public";
import type { TrustedActorContext } from "@youone/core-authorization/public";
import { correlationId } from "@youone/shared-kernel/public";
import {
  createSupabaseOperationalAuthGateway,
  SupabaseOperationalAuthError,
  type OperationalProviderSession,
  type SupabaseOperationalAuthGateway
} from "@youone/infra-supabase-auth/operational";
import { randomBytes, timingSafeEqual } from "node:crypto";

import { writeSecurityLog } from "./security-log";
import { requestActorContextFactory } from "./request-auth";

const MAXIMUM_AUTH_BODY_BYTES = 16 * 1024;
const MAXIMUM_SESSION_SECONDS = 8 * 60 * 60;
const CSRF_SECONDS = MAXIMUM_SESSION_SECONDS;
const MFA_CONTEXT_SECONDS = 10 * 60;

type OperationalAuthRoute =
  | "/api/auth/csrf"
  | "/api/auth/login"
  | "/api/auth/logout"
  | "/api/auth/mfa/enroll"
  | "/api/auth/mfa/verify"
  | "/api/auth/recovery"
  | "/api/auth/refresh"
  | "/api/auth/session";

type CookieNames = Readonly<{
  access: string;
  csrf: string;
  factor: string;
  refresh: string;
}>;

export type OperationalAuthHttpDependencies = Readonly<{
  actors?: Readonly<{
    create(accessToken: string, requestCorrelationId: ReturnType<typeof correlationId>): Promise<TrustedActorContext>;
  }>;
  gateway: SupabaseOperationalAuthGateway;
  expectedOrigin: string;
  production: boolean;
  randomToken?: () => string;
}>;

export function createOperationalAuthHttp(dependencies: OperationalAuthHttpDependencies) {
  const names = cookieNames(dependencies.production);
  const randomToken = dependencies.randomToken ?? (() => randomBytes(32).toString("base64url"));
  const expectedOrigin = validatedOrigin(dependencies.expectedOrigin, dependencies.production);

  return Object.freeze({
    csrf(request: Request): Promise<Response> {
      return execute("/api/auth/csrf", request, async () => {
        const token = randomToken();
        if (!validOpaque(token)) throw new AuthHttpError("AUTH_PROVIDER_UNAVAILABLE");
        const response = json<OperationalCsrfResponse>(200, { outcome: "SUCCESS", csrfToken: token });
        appendCookie(response.headers, names.csrf, token, {
          httpOnly: false,
          maxAge: CSRF_SECONDS,
          path: "/",
          production: dependencies.production
        });
        return response;
      });
    },

    session(request: Request): Promise<Response> {
      return execute("/api/auth/session", request, async () => {
        const accessToken = readCookie(request, names.access);
        if (accessToken === null || !validOpaque(accessToken)) throw new AuthHttpError("AUTH_SESSION_REQUIRED");
        if (dependencies.actors === undefined) throw new AuthHttpError("AUTH_PROVIDER_UNAVAILABLE");
        let actor: TrustedActorContext;
        try {
          actor = await dependencies.actors.create(accessToken, correlationId(safeCorrelation(request)));
        } catch {
          throw new AuthHttpError("AUTH_SESSION_REQUIRED");
        }
        if (actor.assuranceLevel !== "AAL2") throw new AuthHttpError("AUTH_SESSION_REQUIRED");
        return json<OperationalActorSessionResponse>(200, {
          outcome: "SUCCESS",
          actor: Object.freeze({
            accountKind: actor.actorKind,
            assuranceLevel: "AAL2",
            authenticatedUserAccountId: actor.authenticatedActorId,
            effectiveUserAccountId: actor.effectiveActorId,
            organizations: Object.freeze([...actor.organizations]),
            departments: Object.freeze([...actor.departments]),
            positions: Object.freeze([...actor.positions]),
            roles: Object.freeze([...actor.roles])
          })
        });
      });
    },

    login(request: Request): Promise<Response> {
      return execute("/api/auth/login", request, async () => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const body = await readJson(request);
        const identifier = requiredEmail(body.identifier);
        const credential = requiredCredential(body.credential);
        const result = await dependencies.gateway.login(identifier, credential);
        const response = json<OperationalAuthResponse>(200, {
          outcome: "SUCCESS",
          nextAction: result.nextAction
        });
        setSessionCookies(response.headers, names, result.session, dependencies.production);
        if (result.factorId !== undefined) {
          appendCookie(response.headers, names.factor, requiredFactorId(result.factorId), {
            httpOnly: true,
            maxAge: MFA_CONTEXT_SECONDS,
            path: "/",
            production: dependencies.production
          });
        } else {
          clearCookie(response.headers, names.factor, "/", dependencies.production);
        }
        return response;
      });
    },

    enroll(request: Request): Promise<Response> {
      return execute("/api/auth/mfa/enroll", request, async () => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const session = requireSession(request, names);
        const enrollment = await dependencies.gateway.enrollTotp(session);
        const response = json<OperationalMfaEnrollmentResponse>(200, {
          outcome: "SUCCESS",
          nextAction: "MFA_CHALLENGE",
          qrCode: enrollment.qrCode,
          manualSecret: enrollment.manualSecret
        });
        appendCookie(response.headers, names.factor, requiredFactorId(enrollment.factorId), {
          httpOnly: true,
          maxAge: MFA_CONTEXT_SECONDS,
          path: "/",
          production: dependencies.production
        });
        return response;
      });
    },

    verify(request: Request): Promise<Response> {
      return execute("/api/auth/mfa/verify", request, async () => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const session = requireSession(request, names);
        const factorId = requiredFactorId(readCookie(request, names.factor) ?? "");
        const code = requiredTotpCode((await readJson(request)).code);
        const verified = await dependencies.gateway.verifyTotp(session, factorId, code);
        const response = json<OperationalAuthResponse>(200, {
          outcome: "SUCCESS",
          nextAction: "AUTHENTICATED"
        });
        setSessionCookies(response.headers, names, verified, dependencies.production);
        clearCookie(response.headers, names.factor, "/", dependencies.production);
        return response;
      });
    },

    refresh(request: Request): Promise<Response> {
      return execute("/api/auth/refresh", request, async () => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const refreshToken = readCookie(request, names.refresh);
        if (refreshToken === null || !validOpaque(refreshToken)) throw new AuthHttpError("AUTH_SESSION_REQUIRED");
        let result: Awaited<ReturnType<SupabaseOperationalAuthGateway["refresh"]>>;
        try {
          result = await dependencies.gateway.refresh(refreshToken);
        } catch (error) {
          const response = failureResponse(authReason(error));
          clearAuthCookies(response.headers, names, dependencies.production);
          return response;
        }
        const response = json<OperationalAuthResponse>(200, {
          outcome: "SUCCESS",
          nextAction: result.nextAction
        });
        setSessionCookies(response.headers, names, result.session, dependencies.production);
        if (result.factorId !== undefined) {
          appendCookie(response.headers, names.factor, requiredFactorId(result.factorId), {
            httpOnly: true,
            maxAge: MFA_CONTEXT_SECONDS,
            path: "/",
            production: dependencies.production
          });
        }
        return response;
      });
    },

    recovery(request: Request): Promise<Response> {
      return execute("/api/auth/recovery", request, async () => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const identifier = requiredEmail((await readJson(request)).identifier);
        const redirectTo = new URL("/auth/recovery", request.url).toString();
        try {
          await dependencies.gateway.recover(identifier, redirectTo);
        } catch (error) {
          if (error instanceof SupabaseOperationalAuthError && error.reasonCode === "AUTH_RATE_LIMITED") throw error;
          if (error instanceof SupabaseOperationalAuthError && error.reasonCode === "AUTH_PROVIDER_UNAVAILABLE") throw error;
          // Account existence and provider-specific recovery details are intentionally indistinguishable.
        }
        return json<OperationalRecoveryResponse>(202, {
          outcome: "ACCEPTED",
          reasonCode: "AUTH_RECOVERY_ACCEPTED"
        });
      });
    },

    logout(request: Request): Promise<Response> {
      return execute("/api/auth/logout", request, async () => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const session = requireSession(request, names);
        let providerError: unknown;
        try {
          await dependencies.gateway.signOutGlobally(session);
        } catch (error) {
          providerError = error;
        }
        const response = providerError === undefined
          ? json<OperationalAuthResponse>(200, { outcome: "SUCCESS", nextAction: "LOGIN" })
          : failureResponse("AUTH_PROVIDER_UNAVAILABLE");
        clearAuthCookies(response.headers, names, dependencies.production);
        return response;
      });
    }
  });
}

export type OperationalAuthHttp = ReturnType<typeof createOperationalAuthHttp>;

let cached: Readonly<{ key: string; endpoint: OperationalAuthHttp }> | undefined;

export function operationalAuthHttp(
  environment: Readonly<Record<string, string | undefined>> = process.env
): OperationalAuthHttp | null {
  const supabaseUrl = environment.SUPABASE_URL;
  const publishableKey = environment.SUPABASE_PUBLISHABLE_KEY;
  const appOrigin = environment.APP_ORIGIN;
  if (!supabaseUrl || !publishableKey || !appOrigin) return null;
  const production = environment.NODE_ENV === "production";
  const timeout = parsedTimeout(environment.REQUEST_AUTH_TIMEOUT_MS);
  const key = `${production}:${supabaseUrl}:${appOrigin}:${publishableKey}:${timeout}`;
  if (cached !== undefined) {
    if (cached.key !== key) return null;
    return cached.endpoint;
  }
  try {
    const actors = requestActorContextFactory(environment);
    const endpoint = createOperationalAuthHttp({
      ...(actors === null ? {} : { actors }),
      expectedOrigin: appOrigin,
      gateway: createSupabaseOperationalAuthGateway({
        production,
        publishableKey,
        redirectOrigin: appOrigin,
        requestTimeoutMillis: timeout,
        supabaseUrl
      }),
      production
    });
    cached = Object.freeze({ key, endpoint });
    return endpoint;
  } catch {
    return null;
  }
}

export function authUnavailableResponse(): Response {
  const response = failureResponse("AUTH_PROVIDER_UNAVAILABLE");
  clearAuthCookies(response.headers, cookieNames(process.env.NODE_ENV === "production"), process.env.NODE_ENV === "production");
  return response;
}

function execute(route: OperationalAuthRoute, request: Request, operation: () => Promise<Response>): Promise<Response> {
  return operation().then((response) => {
    const event = response.status >= 500
      ? "AUTH_REQUEST_FAILED"
      : response.status >= 400
        ? "AUTH_REQUEST_DENIED"
        : "AUTH_REQUEST_COMPLETED";
    writeSecurityLog({
      event,
      correlationId: safeCorrelation(request),
      route,
      outcome: response.status >= 500
        ? "AUTH_REQUEST_FAILED"
        : response.status >= 400
          ? "AUTH_REQUEST_DENIED"
          : "AUTH_REQUEST_COMPLETED",
      status: response.status
    });
    return response;
  }).catch((error: unknown) => {
    const reasonCode = authReason(error);
    const response = failureResponse(reasonCode);
    writeSecurityLog({
      event: response.status >= 500 ? "AUTH_REQUEST_FAILED" : "AUTH_REQUEST_DENIED",
      correlationId: safeCorrelation(request),
      route,
      outcome: reasonCode,
      status: response.status
    });
    return response;
  });
}

class AuthHttpError extends Error {
  public constructor(public readonly reasonCode: OperationalAuthReasonCode) {
    super(reasonCode);
    this.name = "AuthHttpError";
  }
}

function requireMutationTrust(request: Request, csrfCookieName: string, expectedOrigin: string): void {
  const origin = request.headers.get("origin");
  if (origin === null || origin !== expectedOrigin || new URL(request.url).origin !== expectedOrigin) {
    throw new AuthHttpError("AUTH_ORIGIN_INVALID");
  }
  const cookie = readCookie(request, csrfCookieName);
  const header = request.headers.get("x-csrf-token");
  if (cookie === null || header === null || !constantTimeEqual(cookie, header)) {
    throw new AuthHttpError("AUTH_CSRF_INVALID");
  }
}

function requireSession(request: Request, names: CookieNames): OperationalProviderSession {
  const accessToken = readCookie(request, names.access);
  const refreshToken = readCookie(request, names.refresh);
  if (accessToken === null || refreshToken === null || !validOpaque(accessToken) || !validOpaque(refreshToken)) {
    throw new AuthHttpError("AUTH_SESSION_REQUIRED");
  }
  return Object.freeze({ accessToken, refreshToken, expiresInSeconds: 3_600 });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^application\/json(?:\s*;|$)/.test(contentType)) throw new AuthHttpError("AUTH_REQUEST_INVALID");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!Number.isSafeInteger(Number(declared)) || Number(declared) < 0 || Number(declared) > MAXIMUM_AUTH_BODY_BYTES)) {
    throw new AuthHttpError("AUTH_REQUEST_INVALID");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAXIMUM_AUTH_BODY_BYTES) throw new AuthHttpError("AUTH_REQUEST_INVALID");
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error("invalid object");
    return value as Record<string, unknown>;
  } catch {
    throw new AuthHttpError("AUTH_REQUEST_INVALID");
  }
}

function requiredEmail(value: unknown): string {
  if (typeof value !== "string") throw new AuthHttpError("AUTH_IDENTIFIER_INVALID");
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 5 || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AuthHttpError("AUTH_IDENTIFIER_INVALID");
  }
  return normalized;
}

function requiredCredential(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 256) {
    throw new AuthHttpError("AUTH_REQUEST_INVALID");
  }
  return value;
}

function requiredTotpCode(value: unknown): string {
  if (typeof value !== "string" || !/^\d{6}$/.test(value)) throw new AuthHttpError("AUTH_MFA_CODE_INVALID");
  return value;
}

function requiredFactorId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AuthHttpError("AUTH_MFA_FACTOR_REQUIRED");
  }
  return value;
}

function setSessionCookies(
  headers: Headers,
  names: CookieNames,
  session: OperationalProviderSession,
  production: boolean
): void {
  appendCookie(headers, names.access, session.accessToken, {
    httpOnly: true,
    maxAge: Math.min(session.expiresInSeconds, 3_600),
    path: "/",
    production
  });
  appendCookie(headers, names.refresh, session.refreshToken, {
    httpOnly: true,
    maxAge: MAXIMUM_SESSION_SECONDS,
    path: "/",
    production
  });
}

function clearAuthCookies(headers: Headers, names: CookieNames, production: boolean): void {
  clearCookie(headers, names.access, "/", production);
  clearCookie(headers, names.refresh, "/", production);
  clearCookie(headers, names.factor, "/", production);
  clearCookie(headers, names.csrf, "/", production, false);
}

function cookieNames(production: boolean): CookieNames {
  const prefix = production ? "__Host-" : "";
  return Object.freeze({
    access: `${prefix}youone-access`,
    csrf: `${prefix}youone-csrf`,
    factor: `${prefix}youone-mfa-factor`,
    refresh: `${prefix}youone-refresh`
  });
}

function appendCookie(
  headers: Headers,
  name: string,
  value: string,
  options: Readonly<{ httpOnly: boolean; maxAge: number; path: string; production: boolean }>
): void {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    "SameSite=Strict"
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.production) parts.push("Secure");
  headers.append("Set-Cookie", parts.join("; "));
}

function clearCookie(
  headers: Headers,
  name: string,
  path: string,
  production: boolean,
  httpOnly = true
): void {
  appendCookie(headers, name, "", { httpOnly, maxAge: 0, path, production });
}

function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (cookie === null) return null;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (!validOpaque(left) || !validOpaque(right)) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validOpaque(value: string): boolean {
  return value.length >= 16 && value.length <= 8_192 && !/\s/.test(value) && !/[;,]/.test(value);
}

function failureResponse(reasonCode: OperationalAuthReasonCode): Response {
  const status = reasonStatus(reasonCode);
  const body: OperationalAuthFailure = Object.freeze({
    outcome: status >= 500 ? "UNAVAILABLE" : "REJECTED",
    reasonCode
  });
  return json(status, body);
}

function reasonStatus(reasonCode: OperationalAuthReasonCode): number {
  if (reasonCode === "AUTH_PROVIDER_UNAVAILABLE") return 503;
  if (reasonCode === "AUTH_RATE_LIMITED") return 429;
  if (reasonCode === "AUTH_INVALID_CREDENTIALS" || reasonCode === "AUTH_SESSION_REQUIRED") return 401;
  if (reasonCode === "AUTH_CSRF_INVALID" || reasonCode === "AUTH_ORIGIN_INVALID") return 403;
  if (reasonCode === "AUTH_MFA_FACTOR_AMBIGUOUS" || reasonCode === "AUTH_MFA_FACTOR_REQUIRED") return 409;
  if (reasonCode === "AUTH_MFA_CODE_INVALID") return 422;
  return 400;
}

function authReason(error: unknown): OperationalAuthReasonCode {
  return error instanceof AuthHttpError || error instanceof SupabaseOperationalAuthError
    ? error.reasonCode
    : "AUTH_PROVIDER_UNAVAILABLE";
}

function json<Body>(status: number, body: Body): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8" }
  });
}

function safeCorrelation(request: Request): string {
  const supplied = request.headers.get("x-correlation-id")?.trim() ?? "";
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(supplied) ? supplied : `request:${crypto.randomUUID()}`;
}

function parsedTimeout(value: string | undefined): number {
  if (value === undefined) return 5_000;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 500 || parsed > 30_000) throw new Error("invalid auth timeout");
  return parsed;
}

function validatedOrigin(value: string, production: boolean): string {
  try {
    const url = new URL(value);
    if (
      (production ? url.protocol !== "https:" : url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" ||
      (url.pathname !== "" && url.pathname !== "/")
    ) throw new Error("invalid origin");
    return url.origin;
  } catch {
    throw new AuthHttpError("AUTH_ORIGIN_INVALID");
  }
}

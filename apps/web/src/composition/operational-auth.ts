import type {
  OperationalAuthAbusePreventionPort,
  OperationalAuthAttempt,
  OperationalAuthFailure,
  OperationalAuthRateLimitDecision,
  OperationalAuthRateLimitAction,
  OperationalAuthReasonCode,
  OperationalAuthResponse,
  OperationalActorSessionResponse,
  OperationalCsrfResponse,
  OperationalLogoutResponse,
  OperationalMfaEnrollmentResponse,
  OperationalRecoveryResponse,
  OperationalSessionPresencePort
} from "@youone/core-identity/public";
import type { TrustedActorContext } from "@youone/core-authorization/public";
import {
  correlationId,
  sha256,
  stableCode,
  utcInstant,
  uuid
} from "@youone/shared-kernel/public";
import {
  PostgresOperationalAuthAbusePrevention,
  PostgresAuthSessionRevocationEvidenceStore,
  type AuthSessionRevocationEvidence
} from "@youone/infra-postgres/request";
import {
  createSupabaseOperationalAuthGateway,
  SupabaseOperationalAuthError,
  type OperationalProviderSession,
  type SupabaseOperationalAuthGateway
} from "@youone/infra-supabase-auth/operational";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { getRequestDatabaseComposition } from "./request-database";
import { writeSecurityLog } from "./security-log";
import { requestAuthSecurityComposition } from "./request-auth";

const MAXIMUM_AUTH_BODY_BYTES = 16 * 1024;
const MAXIMUM_SESSION_SECONDS = 8 * 60 * 60;
const CSRF_SECONDS = MAXIMUM_SESSION_SECONDS;
const MFA_CONTEXT_SECONDS = 10 * 60;
const RATE_LIMIT_SUBJECT_CONTEXT = "YOUONE_AUTH_RATE_SUBJECT_V1\0";

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
  deviceEnrollment: string;
  deviceTrust: string;
  factor: string;
  rateSubject: string;
  refresh: string;
}>;

type AuthorizedAuthAttempt = Readonly<{
  attempt: OperationalAuthAttempt;
  policyVersionId: OperationalAuthRateLimitDecision["policyVersionId"];
}>;

export type OperationalAuthHttpDependencies = Readonly<{
  abusePrevention: OperationalAuthAbusePreventionPort;
  authAttemptIdGenerator?: () => string;
  actors?: Readonly<{
    create(accessToken: string, requestCorrelationId: ReturnType<typeof correlationId>): Promise<TrustedActorContext>;
  }>;
  revocations?: Readonly<{
    record(actor: TrustedActorContext, evidence: AuthSessionRevocationEvidence): Promise<void>;
  }>;
  sessions?: OperationalSessionPresencePort;
  gateway: SupabaseOperationalAuthGateway;
  expectedOrigin: string;
  idGenerator?: () => string;
  now?: () => Date;
  production: boolean;
  randomToken?: () => string;
  rateLimitFingerprintSecret: string;
  rateLimitPolicyVersion: string;
  rateLimitSubjectGenerator?: () => string;
  wait?: (milliseconds: number) => Promise<void>;
}>;

export function createOperationalAuthHttp(dependencies: OperationalAuthHttpDependencies) {
  const names = cookieNames(dependencies.production);
  const randomToken = dependencies.randomToken ?? (() => randomBytes(32).toString("base64url"));
  const idGenerator = dependencies.idGenerator ?? randomUUID;
  const authAttemptIdGenerator = dependencies.authAttemptIdGenerator ?? randomUUID;
  const rateLimitSubjectGenerator = dependencies.rateLimitSubjectGenerator ?? (() => randomBytes(32).toString("base64url"));
  const now = dependencies.now ?? (() => new Date());
  const wait = dependencies.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const expectedOrigin = validatedOrigin(dependencies.expectedOrigin, dependencies.production);
  const rateLimitFingerprintSecret = validatedRateLimitFingerprintSecret(dependencies.rateLimitFingerprintSecret);
  const rateLimitPolicyVersion = stableCode(dependencies.rateLimitPolicyVersion);

  async function beginAttempt(
    action: OperationalAuthRateLimitAction,
    subjectMaterial: string,
    requestCorrelationId: string
  ): Promise<AuthorizedAuthAttempt> {
    const attempt = Object.freeze({
      action,
      attemptId: uuid(authAttemptIdGenerator()),
      correlationId: correlationId(requestCorrelationId),
      globalFingerprint: authAttemptFingerprint(rateLimitFingerprintSecret, action, "GLOBAL"),
      occurredAt: utcInstant(now()),
      policyVersion: rateLimitPolicyVersion,
      rateLimitAuditId: uuid(authAttemptIdGenerator()),
      subjectFingerprint: authAttemptFingerprint(rateLimitFingerprintSecret, action, subjectMaterial)
    });
    let decision;
    try {
      decision = await dependencies.abusePrevention.consume(attempt);
    } catch {
      throw new AuthHttpError("AUTH_PROVIDER_UNAVAILABLE");
    }
    if (!decision.allowed) throw new AuthHttpError("AUTH_RATE_LIMITED", decision.retryAfterSeconds);
    return Object.freeze({ attempt, policyVersionId: decision.policyVersionId });
  }

  async function attemptResponse(
    authorizedAttempt: AuthorizedAuthAttempt,
    operation: () => Promise<Response>,
    compensateEvidenceFailure?: () => Promise<void>
  ): Promise<Response> {
    let response: Response;
    try {
      response = await operation();
    } catch (error) {
      await compensateBestEffort(compensateEvidenceFailure);
      await recordAttemptOutcome(
        authorizedAttempt,
        authReason(error) === "AUTH_PROVIDER_UNAVAILABLE" ? "FAILED" : "DENIED",
        authReason(error)
      );
      throw error;
    }
    try {
      await recordAttemptOutcome(
        authorizedAttempt,
        response.status < 400 ? "SUCCEEDED" : response.status < 500 ? "DENIED" : "FAILED",
        response.status < 400 ? "AUTH_REQUEST_COMPLETED" : response.status < 500 ? "AUTH_REQUEST_DENIED" : "AUTH_REQUEST_FAILED"
      );
    } catch {
      await compensateBestEffort(compensateEvidenceFailure);
      throw new AuthHttpError("AUTH_PROVIDER_UNAVAILABLE");
    }
    return response;
  }

  async function recordAttemptOutcome(
    authorizedAttempt: AuthorizedAuthAttempt,
    result: "DENIED" | "FAILED" | "SUCCEEDED",
    reasonCode: string
  ): Promise<void> {
    const { attempt, policyVersionId } = authorizedAttempt;
    try {
      await dependencies.abusePrevention.recordOutcome(attempt, Object.freeze({
        auditId: uuid(authAttemptIdGenerator()),
        policyVersionId,
        reasonCode: stableCode(reasonCode),
        result
      }));
    } catch {
      throw new AuthHttpError("AUTH_PROVIDER_UNAVAILABLE");
    }
  }

  async function compensateBestEffort(compensation?: () => Promise<void>): Promise<void> {
    if (compensation === undefined) return;
    try {
      await compensation();
    } catch {
      // The response remains fail-closed; provider compensation is best effort only.
    }
  }

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
      return execute("/api/auth/login", request, async (requestCorrelationId) => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const body = await readJson(request);
        const identifier = requiredEmail(body.identifier);
        const credential = requiredCredential(body.credential);
        const rateSubjectNonce = requiredRateLimitSubjectNonce(rateLimitSubjectGenerator());
        const rateSubjectCookie = signedRateLimitSubject(
          rateLimitFingerprintSecret,
          rateSubjectNonce
        );
        const attempt = await beginAttempt("LOGIN", identifier, requestCorrelationId);
        let establishedSession: OperationalProviderSession | undefined;
        return attemptResponse(attempt, async () => {
          const result = await dependencies.gateway.login(identifier, credential);
          establishedSession = result.session;
          const response = json<OperationalAuthResponse>(200, {
            outcome: "SUCCESS",
            nextAction: result.nextAction
          });
          clearDeviceTrustCookies(response.headers, names, dependencies.production);
          setSessionCookies(response.headers, names, result.session, dependencies.production);
          appendCookie(response.headers, names.rateSubject, rateSubjectCookie, {
            httpOnly: true,
            maxAge: MAXIMUM_SESSION_SECONDS,
            path: "/",
            production: dependencies.production
          });
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
        }, async () => {
          if (establishedSession !== undefined) await dependencies.gateway.signOutGlobally(establishedSession);
        });
      });
    },

    enroll(request: Request): Promise<Response> {
      return execute("/api/auth/mfa/enroll", request, async (requestCorrelationId) => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const session = requireSession(request, names);
        const rateSubject = requireRateLimitSubject(request, names, rateLimitFingerprintSecret);
        const attempt = await beginAttempt("MFA_ENROLL", rateSubject, requestCorrelationId);
        return attemptResponse(attempt, async () => {
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
      });
    },

    verify(request: Request): Promise<Response> {
      return execute("/api/auth/mfa/verify", request, async (requestCorrelationId) => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const session = requireSession(request, names);
        const rateSubject = requireRateLimitSubject(request, names, rateLimitFingerprintSecret);
        const factorId = requiredFactorId(readCookie(request, names.factor) ?? "");
        const code = requiredTotpCode((await readJson(request)).code);
        const attempt = await beginAttempt("MFA_VERIFY", rateSubject, requestCorrelationId);
        let verifiedSession: OperationalProviderSession | undefined;
        return attemptResponse(attempt, async () => {
          const verified = await dependencies.gateway.verifyTotp(session, factorId, code);
          verifiedSession = verified;
          const response = json<OperationalAuthResponse>(200, {
            outcome: "SUCCESS",
            nextAction: "AUTHENTICATED"
          });
          setSessionCookies(response.headers, names, verified, dependencies.production);
          clearCookie(response.headers, names.factor, "/", dependencies.production);
          return response;
        }, async () => {
          if (verifiedSession !== undefined) await dependencies.gateway.signOutGlobally(verifiedSession);
        });
      });
    },

    refresh(request: Request): Promise<Response> {
      return execute("/api/auth/refresh", request, async (requestCorrelationId) => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const refreshToken = readCookie(request, names.refresh);
        if (refreshToken === null || !validOpaque(refreshToken)) throw new AuthHttpError("AUTH_SESSION_REQUIRED");
        const rateSubject = requireRateLimitSubject(request, names, rateLimitFingerprintSecret);
        const attempt = await beginAttempt("REFRESH", rateSubject, requestCorrelationId);
        let refreshedSession: OperationalProviderSession | undefined;
        return attemptResponse(attempt, async () => {
          let result: Awaited<ReturnType<SupabaseOperationalAuthGateway["refresh"]>>;
          try {
            result = await dependencies.gateway.refresh(refreshToken);
            refreshedSession = result.session;
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
        }, async () => {
          if (refreshedSession !== undefined) await dependencies.gateway.signOutGlobally(refreshedSession);
        });
      });
    },

    recovery(request: Request): Promise<Response> {
      return execute("/api/auth/recovery", request, async (requestCorrelationId) => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const identifier = requiredEmail((await readJson(request)).identifier);
        const redirectTo = new URL("/auth/recovery", request.url).toString();
        const attempt = await beginAttempt("RECOVERY", identifier, requestCorrelationId);
        return attemptResponse(attempt, async () => {
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
      });
    },

    logout(request: Request): Promise<Response> {
      return execute("/api/auth/logout", request, async (requestCorrelationId) => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        const session = requireSession(request, names);
        const rateSubject = requireRateLimitSubject(request, names, rateLimitFingerprintSecret);
        const attempt = await beginAttempt("LOGOUT", rateSubject, requestCorrelationId);
        return attemptResponse(attempt, async () => {
          if (
            dependencies.actors === undefined || dependencies.sessions === undefined ||
            dependencies.revocations === undefined
          ) {
            const response = failureResponse("AUTH_PROVIDER_UNAVAILABLE");
            clearAuthCookies(response.headers, names, dependencies.production);
            return response;
          }

          let actor: TrustedActorContext;
          try {
            actor = await dependencies.actors.create(session.accessToken, correlationId(requestCorrelationId));
          } catch {
            const response = failureResponse("AUTH_SESSION_REQUIRED");
            clearAuthCookies(response.headers, names, dependencies.production);
            return response;
          }

          try {
            await dependencies.gateway.signOutGlobally(session);
          } catch {
            // Exact database confirmation below decides whether reconciliation is required.
          }

          let absenceConfirmed = false;
          for (let retry = 1; retry <= 3; retry += 1) {
            try {
              absenceConfirmed = !(await dependencies.sessions.exists(actor.authSubject, actor.sessionId));
            } catch {
              absenceConfirmed = false;
            }
            if (absenceConfirmed) break;
            if (retry < 3) await wait(250);
          }

          const occurredAt = utcInstant(now());
          const baseEvidence = {
            auditId: uuid(idGenerator()),
            bindingHash: revocationBindingHash(actor.authSubject, actor.sessionId),
            occurredAt,
            operationId: uuid(idGenerator())
          } as const;
          let response: Response;
          try {
            if (absenceConfirmed) {
              await dependencies.revocations.record(actor, Object.freeze({
                ...baseEvidence,
                outcome: "CONFIRMED"
              }));
              response = json<OperationalLogoutResponse>(200, {
                outcome: "SUCCESS",
                nextAction: "LOGIN",
                revocation: "CONFIRMED"
              });
            } else {
              const reconciliationAt = utcInstant(new Date(new Date(occurredAt).getTime() + 15 * 60 * 1_000));
              await dependencies.revocations.record(actor, Object.freeze({
                ...baseEvidence,
                outcome: "RECONCILIATION_SCHEDULED",
                outboxEventId: uuid(idGenerator()),
                reconciliationAt
              }));
              response = json<OperationalLogoutResponse>(202, {
                outcome: "ACCEPTED",
                nextAction: "LOGIN",
                revocation: "RECONCILIATION_SCHEDULED"
              });
            }
          } catch {
            response = failureResponse("AUTH_PROVIDER_UNAVAILABLE");
          }
          clearAuthCookies(response.headers, names, dependencies.production);
          return response;
        });
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
  const rateLimitFingerprintSecret = environment.AUTH_RATE_LIMIT_HMAC_SECRET;
  const rateLimitPolicyVersion = environment.AUTH_RATE_LIMIT_POLICY_VERSION;
  if (!supabaseUrl || !publishableKey || !appOrigin || !rateLimitFingerprintSecret || !rateLimitPolicyVersion) return null;
  const production = environment.NODE_ENV === "production";
  const timeout = parsedTimeout(environment.REQUEST_AUTH_TIMEOUT_MS);
  const key = operationalConfigurationKey(environment, production, timeout);
  if (cached !== undefined) {
    if (cached.key !== key) return null;
    return cached.endpoint;
  }
  try {
    const authSecurity = requestAuthSecurityComposition(environment);
    const requestDatabase = getRequestDatabaseComposition(environment);
    if (requestDatabase === null) return null;
    const endpoint = createOperationalAuthHttp({
      abusePrevention: new PostgresOperationalAuthAbusePrevention(requestDatabase.pool),
      ...(authSecurity === null ? {} : {
        actors: authSecurity.actors,
        sessions: authSecurity.sessions
      }),
      revocations: new PostgresAuthSessionRevocationEvidenceStore(requestDatabase.unitOfWork),
      expectedOrigin: appOrigin,
      gateway: createSupabaseOperationalAuthGateway({
        production,
        publishableKey,
        redirectOrigin: appOrigin,
        requestTimeoutMillis: timeout,
        supabaseUrl
      }),
      production,
      rateLimitFingerprintSecret,
      rateLimitPolicyVersion
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

function execute(
  route: OperationalAuthRoute,
  request: Request,
  operation: (requestCorrelationId: string) => Promise<Response>
): Promise<Response> {
  const requestCorrelationId = safeCorrelation(request);
  return operation(requestCorrelationId).then((response) => {
    const event = response.status >= 500
      ? "AUTH_REQUEST_FAILED"
      : response.status >= 400
        ? "AUTH_REQUEST_DENIED"
        : "AUTH_REQUEST_COMPLETED";
    writeSecurityLog({
      event,
      correlationId: requestCorrelationId,
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
    const response = failureResponse(
      reasonCode,
      error instanceof AuthHttpError ? error.retryAfterSeconds : undefined
    );
    writeSecurityLog({
      event: response.status >= 500 ? "AUTH_REQUEST_FAILED" : "AUTH_REQUEST_DENIED",
      correlationId: requestCorrelationId,
      route,
      outcome: reasonCode,
      status: response.status
    });
    return response;
  });
}

class AuthHttpError extends Error {
  public constructor(
    public readonly reasonCode: OperationalAuthReasonCode,
    public readonly retryAfterSeconds?: number
  ) {
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

function requireRateLimitSubject(
  request: Request,
  names: CookieNames,
  rateLimitFingerprintSecret: string
): string {
  const subject = readCookie(request, names.rateSubject);
  if (subject === null) throw new AuthHttpError("AUTH_SESSION_REQUIRED");
  const match = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(subject);
  if (match === null) throw new AuthHttpError("AUTH_SESSION_REQUIRED");
  const nonce = requiredRateLimitSubjectNonce(match[1] ?? "");
  const suppliedSignature = match[2] ?? "";
  const expectedSignature = rateLimitSubjectSignature(
    rateLimitFingerprintSecret,
    nonce
  );
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) {
    throw new AuthHttpError("AUTH_SESSION_REQUIRED");
  }
  return nonce;
}

function requiredRateLimitSubjectNonce(value: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new AuthHttpError("AUTH_SESSION_REQUIRED");
  return value;
}

function signedRateLimitSubject(secret: string, nonce: string): string {
  return `${nonce}.${rateLimitSubjectSignature(secret, nonce)}`;
}

function rateLimitSubjectSignature(secret: string, nonce: string): string {
  return createHmac("sha256", secret)
    .update(RATE_LIMIT_SUBJECT_CONTEXT, "utf8")
    .update(nonce, "utf8")
    .digest("base64url");
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
  clearCookie(headers, names.rateSubject, "/", production);
  clearCookie(headers, names.csrf, "/", production, false);
  clearDeviceTrustCookies(headers, names, production);
}

function clearDeviceTrustCookies(headers: Headers, names: CookieNames, production: boolean): void {
  clearCookie(headers, names.deviceEnrollment, "/", production);
  clearCookie(headers, names.deviceTrust, "/", production);
}

function cookieNames(production: boolean): CookieNames {
  const prefix = production ? "__Host-" : "";
  return Object.freeze({
    access: `${prefix}youone-access`,
    csrf: `${prefix}youone-csrf`,
    deviceEnrollment: `${prefix}youone-device-enrollment`,
    deviceTrust: `${prefix}youone-device-trust`,
    factor: `${prefix}youone-mfa-factor`,
    rateSubject: `${prefix}youone-auth-rate-subject`,
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

function failureResponse(reasonCode: OperationalAuthReasonCode, retryAfterSeconds?: number): Response {
  const status = reasonStatus(reasonCode);
  const body: OperationalAuthFailure = Object.freeze({
    outcome: status >= 500 ? "UNAVAILABLE" : "REJECTED",
    reasonCode
  });
  const response = json(status, body);
  if (
    reasonCode === "AUTH_RATE_LIMITED" && retryAfterSeconds !== undefined &&
    Number.isSafeInteger(retryAfterSeconds) && retryAfterSeconds > 0
  ) {
    response.headers.set("Retry-After", String(retryAfterSeconds));
  }
  return response;
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

function revocationBindingHash(authSubject: string, sessionId: string) {
  return sha256(createHash("sha256").update(`${authSubject}\n${sessionId}`, "utf8").digest("hex"));
}

function operationalConfigurationKey(
  environment: Readonly<Record<string, string | undefined>>,
  production: boolean,
  timeout: number
): string {
  const configuration = {
    production,
    timeout,
    APP_ORIGIN: environment.APP_ORIGIN,
    AUTH_RATE_LIMIT_HMAC_SECRET_SHA256: environment.AUTH_RATE_LIMIT_HMAC_SECRET === undefined
      ? undefined
      : createHash("sha256").update(environment.AUTH_RATE_LIMIT_HMAC_SECRET, "utf8").digest("hex"),
    AUTH_RATE_LIMIT_POLICY_VERSION: environment.AUTH_RATE_LIMIT_POLICY_VERSION,
    SUPABASE_URL: environment.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: environment.SUPABASE_PUBLISHABLE_KEY,
    IDENTITY_RESOLVER_DATABASE_URL: environment.IDENTITY_RESOLVER_DATABASE_URL,
    IDENTITY_RESOLVER_DATABASE_TLS_MODE: environment.IDENTITY_RESOLVER_DATABASE_TLS_MODE,
    REQUEST_DATABASE_URL: environment.REQUEST_DATABASE_URL,
    REQUEST_DATABASE_TLS_MODE: environment.REQUEST_DATABASE_TLS_MODE,
    REQUEST_DATABASE_POOL_MAX: environment.REQUEST_DATABASE_POOL_MAX,
    REQUEST_DATABASE_CONNECTION_TIMEOUT_MS: environment.REQUEST_DATABASE_CONNECTION_TIMEOUT_MS,
    REQUEST_DATABASE_IDLE_TIMEOUT_MS: environment.REQUEST_DATABASE_IDLE_TIMEOUT_MS,
    REQUEST_DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS: environment.REQUEST_DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    REQUEST_DATABASE_QUERY_TIMEOUT_MS: environment.REQUEST_DATABASE_QUERY_TIMEOUT_MS,
    REQUEST_DATABASE_STATEMENT_TIMEOUT_MS: environment.REQUEST_DATABASE_STATEMENT_TIMEOUT_MS
  };
  return createHash("sha256").update(JSON.stringify(configuration), "utf8").digest("hex");
}

function validatedRateLimitFingerprintSecret(value: string): string {
  if (value.length < 32 || value.length > 4_096 || /\s/.test(value)) {
    throw new AuthHttpError("AUTH_PROVIDER_UNAVAILABLE");
  }
  return value;
}

function authAttemptFingerprint(
  secret: string,
  action: OperationalAuthRateLimitAction,
  subjectMaterial: string
) {
  if (subjectMaterial.length === 0 || subjectMaterial.length > 8_192) {
    throw new AuthHttpError("AUTH_REQUEST_INVALID");
  }
  return sha256(
    createHmac("sha256", secret)
      .update("YOUONE_AUTH_RATE_LIMIT_V1\0", "utf8")
      .update(action, "utf8")
      .update("\0", "utf8")
      .update(subjectMaterial, "utf8")
      .digest("hex")
  );
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

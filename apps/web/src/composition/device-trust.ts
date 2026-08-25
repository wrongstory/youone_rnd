import {
  DeviceTrustActivationService,
  DeviceTrustPolicyUnavailableError,
  IdentityVerificationError,
  TrustedActivationContextFactory,
  type AccountActivationReadiness,
  type DeviceTrustDecision,
  type TrustedActivationContext
} from "@youone/core-identity/public";
import { correlationId, sha256, stableCode, utcInstant, uuid, type Sha256 } from "@youone/shared-kernel/public";
import {
  PostgresAccountActivationStore,
  PostgresActivationContextSource,
  PostgresDeviceTrustCommandStore,
  PostgresDeviceTrustPolicySource,
  createNodePostgresActivationPool,
  type NodePostgresActivationPool,
  type NodePostgresActivationPoolOptions
} from "@youone/infra-postgres/activation";
import {
  SupabaseServerSessionVerifier,
  createSupabaseRequestAuthApi
} from "@youone/infra-supabase-auth/request";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { writeSecurityLog } from "./security-log";

const MAXIMUM_DEVICE_TRUST_BODY_BYTES = 1_024;
const DEVICE_CREDENTIAL_CONTEXT = "YOUONE_DEVICE_TRUST_CREDENTIAL_V1\0";
const ENROLLMENT_COOKIE_CONTEXT = "YOUONE_DEVICE_TRUST_ENROLLMENT_COOKIE_V1\0";
const ACTIVE_COOKIE_CONTEXT = "YOUONE_DEVICE_TRUST_ACTIVE_COOKIE_V1\0";

type DeviceTrustRoute =
  | "/api/auth/activation"
  | "/api/auth/device-trust/enroll"
  | "/api/auth/device-trust/verify";

type DeviceTrustCookieNames = Readonly<{
  access: string;
  csrf: string;
  enrollment: string;
  trust: string;
}>;

export type ActivationReadinessPort = Readonly<{
  read(
    context: TrustedActivationContext,
    deviceTrustDecision: DeviceTrustDecision,
    deviceCredentialHmac: Sha256
  ): Promise<AccountActivationReadiness>;
}>;

export type DeviceTrustHttpDependencies = Readonly<{
  activationContexts: Pick<TrustedActivationContextFactory, "create">;
  activationReadiness: ActivationReadinessPort;
  deviceTrust: Pick<DeviceTrustActivationService, "beginEnrollment" | "activateEnrollment" | "verify">;
  expectedOrigin: string;
  hmacSecret: string;
  now?: () => Date;
  production: boolean;
  randomNonce?: () => string;
}>;

export function createDeviceTrustHttp(dependencies: DeviceTrustHttpDependencies) {
  const names = deviceTrustCookieNames(dependencies.production);
  const now = dependencies.now ?? (() => new Date());
  const randomNonce = dependencies.randomNonce ?? (() => randomBytes(32).toString("base64url"));
  const expectedOrigin = validatedOrigin(dependencies.expectedOrigin, dependencies.production);
  const hmacSecret = validatedHmacSecret(dependencies.hmacSecret);

  async function trustedContext(request: Request, requestCorrelationId: string): Promise<TrustedActivationContext> {
    const accessToken = readCookie(request, names.access);
    if (accessToken === null || !validOpaque(accessToken)) {
      throw new DeviceTrustHttpError("ACTIVATION_SESSION_REQUIRED");
    }
    try {
      return await dependencies.activationContexts.create(
        accessToken,
        correlationId(requestCorrelationId),
        utcInstant(now())
      );
    } catch (error) {
      if (
        !(error instanceof IdentityVerificationError) ||
        error.message === "Supabase session verification failed"
      ) {
        throw new DeviceTrustHttpError("DEVICE_TRUST_UNAVAILABLE");
      }
      throw new DeviceTrustHttpError("ACTIVATION_CONTEXT_DENIED");
    }
  }

  return Object.freeze({
    enroll(request: Request): Promise<Response> {
      return execute("/api/auth/device-trust/enroll", request, async (requestCorrelationId) => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        await requireEmptyJson(request);
        const context = await trustedContext(request, requestCorrelationId);
        const nonce = requiredNonce(randomNonce());
        const credentialHmac = deviceCredentialHmac(
          hmacSecret,
          context.userAccountId,
          context.providerSessionId,
          nonce
        );
        let pending;
        try {
          pending = await dependencies.deviceTrust.beginEnrollment(context, credentialHmac);
        } catch (error) {
          throw mappedServiceError(error);
        }
        if (
          pending.state !== "PENDING" ||
          pending.userAccountId !== context.userAccountId ||
          pending.providerSessionId !== context.providerSessionId ||
          pending.deviceCredentialHmac !== credentialHmac ||
          pending.expiresAt <= context.requestTime
        ) {
          throw new DeviceTrustHttpError("DEVICE_TRUST_UNAVAILABLE");
        }

        const value = signedDeviceCookie(
          hmacSecret,
          ENROLLMENT_COOKIE_CONTEXT,
          pending.deviceTrustId,
          context.userAccountId,
          context.providerSessionId,
          nonce
        );
        const response = json(201, { outcome: "PENDING", nextAction: "VERIFY" });
        appendCookie(response.headers, names.enrollment, value, {
          maxAge: secondsUntil(pending.expiresAt, context.requestTime),
          production: dependencies.production
        });
        clearCookie(response.headers, names.trust, dependencies.production);
        return response;
      });
    },

    verify(request: Request): Promise<Response> {
      return execute("/api/auth/device-trust/verify", request, async (requestCorrelationId) => {
        requireMutationTrust(request, names.csrf, expectedOrigin);
        await requireEmptyJson(request);
        const context = await trustedContext(request, requestCorrelationId);
        const enrollment = requireSignedDeviceCookie(
          request,
          names.enrollment,
          hmacSecret,
          ENROLLMENT_COOKIE_CONTEXT,
          context
        );
        const credentialHmac = deviceCredentialHmac(
          hmacSecret,
          context.userAccountId,
          context.providerSessionId,
          enrollment.nonce
        );
        let active;
        try {
          active = await dependencies.deviceTrust.activateEnrollment(
            context,
            uuid(enrollment.deviceTrustId),
            credentialHmac
          );
        } catch (error) {
          throw mappedServiceError(error);
        }
        if (
          active.state !== "ACTIVE" ||
          active.deviceTrustId !== enrollment.deviceTrustId ||
          active.userAccountId !== context.userAccountId ||
          active.providerSessionId !== context.providerSessionId ||
          active.deviceCredentialHmac !== credentialHmac ||
          active.approvedAt === undefined ||
          active.expiresAt <= context.requestTime
        ) {
          throw new DeviceTrustHttpError("DEVICE_TRUST_UNAVAILABLE");
        }

        const trustValue = signedDeviceCookie(
          hmacSecret,
          ACTIVE_COOKIE_CONTEXT,
          active.deviceTrustId,
          context.userAccountId,
          context.providerSessionId,
          enrollment.nonce
        );
        const response = json(200, { outcome: "SUCCESS", deviceTrustState: "ACTIVE" });
        appendCookie(response.headers, names.trust, trustValue, {
          maxAge: secondsUntil(active.expiresAt, context.requestTime),
          production: dependencies.production
        });
        clearCookie(response.headers, names.enrollment, dependencies.production);
        return response;
      });
    },

    readiness(request: Request): Promise<Response> {
      return execute("/api/auth/activation", request, async (requestCorrelationId) => {
        const context = await trustedContext(request, requestCorrelationId);
        const trust = requireSignedDeviceCookie(
          request,
          names.trust,
          hmacSecret,
          ACTIVE_COOKIE_CONTEXT,
          context
        );
        const credentialHmac = deviceCredentialHmac(
          hmacSecret,
          context.userAccountId,
          context.providerSessionId,
          trust.nonce
        );
        let decision: DeviceTrustDecision;
        let readiness: AccountActivationReadiness;
        try {
          decision = await dependencies.deviceTrust.verify(context, credentialHmac);
        } catch (error) {
          throw mappedServiceError(error);
        }
        if (!decision.trusted) {
          if (
            decision.reasonCode === "DEVICE_TRUST_POLICY_INVALID" ||
            decision.reasonCode === "DEVICE_TRUST_POLICY_MISSING"
          ) {
            throw new DeviceTrustHttpError("DEVICE_TRUST_POLICY_UNAVAILABLE");
          }
          throw new DeviceTrustHttpError("DEVICE_TRUST_NOT_ACTIVE");
        }
        if (
          decision.userAccountId !== context.userAccountId ||
          decision.providerSessionId !== context.providerSessionId ||
          decision.deviceTrustId !== trust.deviceTrustId
        ) {
          throw new DeviceTrustHttpError("DEVICE_TRUST_UNAVAILABLE");
        }
        try {
          readiness = await dependencies.activationReadiness.read(context, decision, credentialHmac);
        } catch (error) {
          throw mappedServiceError(error);
        }
        return json(200, {
          outcome: "SUCCESS",
          activationState: readiness.ready ? "READY" : "BLOCKED",
          reasonCodes: readiness.reasonCodes
        });
      });
    }
  });
}

export type DeviceTrustHttp = ReturnType<typeof createDeviceTrustHttp>;

type ActivationPoolFactory = (
  options: NodePostgresActivationPoolOptions
) => NodePostgresActivationPool;

let cachedRuntime:
  | Readonly<{ configurationKey: string; endpoint: DeviceTrustHttp }>
  | undefined;

/**
 * Production composition uses a dedicated NOINHERIT activation principal.
 * It never reuses the business request pool or constructs a full ActorContext.
 */
export function deviceTrustHttp(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  activationPoolFactory: ActivationPoolFactory = createNodePostgresActivationPool
): DeviceTrustHttp | null {
  const appOrigin = environment.APP_ORIGIN;
  const activationDatabaseUrl = environment.ACTIVATION_DATABASE_URL;
  const deviceTrustHmacSecret = environment.DEVICE_TRUST_HMAC_SECRET;
  const providerProjectId = environment.ACTIVATION_PROVIDER_PROJECT_ID;
  const publishableKey = environment.SUPABASE_PUBLISHABLE_KEY;
  const supabaseUrl = environment.SUPABASE_URL;
  if (
    !appOrigin || !activationDatabaseUrl || !deviceTrustHmacSecret ||
    !providerProjectId || !publishableKey || !supabaseUrl
  ) return null;

  const production = environment.NODE_ENV === "production";
  const tls = environment.ACTIVATION_DATABASE_TLS_MODE ?? "verify-full";
  if (tls !== "disable" && tls !== "verify-full") return null;
  if (production && tls !== "verify-full") return null;

  try {
    const requestTimeoutMillis = positiveInteger(
      environment.REQUEST_AUTH_TIMEOUT_MS,
      5_000,
      500,
      30_000
    );
    const providerUrl = new URL(supabaseUrl);
    providerUrl.pathname = "/auth/v1";
    providerUrl.search = "";
    providerUrl.hash = "";
    const configurationKey = deviceTrustConfigurationFingerprint({
      production,
      appOrigin,
      activationDatabaseUrlSha256: createHash("sha256").update(activationDatabaseUrl, "utf8").digest("hex"),
      deviceTrustHmacSecretSha256: createHash("sha256").update(deviceTrustHmacSecret, "utf8").digest("hex"),
      providerProjectId,
      publishableKeySha256: createHash("sha256").update(publishableKey, "utf8").digest("hex"),
      supabaseUrl,
      tls,
      requestTimeoutMillis,
      poolMax: environment.ACTIVATION_DATABASE_POOL_MAX,
      connectionTimeout: environment.ACTIVATION_DATABASE_CONNECTION_TIMEOUT_MS,
      idleTimeout: environment.ACTIVATION_DATABASE_IDLE_TIMEOUT_MS,
      idleInTransactionTimeout: environment.ACTIVATION_DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS,
      queryTimeout: environment.ACTIVATION_DATABASE_QUERY_TIMEOUT_MS,
      statementTimeout: environment.ACTIVATION_DATABASE_STATEMENT_TIMEOUT_MS
    });
    if (activationPoolFactory === createNodePostgresActivationPool && cachedRuntime !== undefined) {
      return cachedRuntime.configurationKey === configurationKey ? cachedRuntime.endpoint : null;
    }

    const pool = activationPoolFactory({
      applicationName: "youone-web-activation",
      connectionString: activationDatabaseUrl,
      tls,
      max: positiveInteger(environment.ACTIVATION_DATABASE_POOL_MAX, 5, 1, 20),
      connectionTimeoutMillis: positiveInteger(
        environment.ACTIVATION_DATABASE_CONNECTION_TIMEOUT_MS,
        5_000,
        100,
        60_000
      ),
      idleTimeoutMillis: positiveInteger(
        environment.ACTIVATION_DATABASE_IDLE_TIMEOUT_MS,
        30_000,
        1_000,
        300_000
      ),
      idleInTransactionTimeoutMillis: positiveInteger(
        environment.ACTIVATION_DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS,
        15_000,
        1_000,
        120_000
      ),
      queryTimeoutMillis: positiveInteger(
        environment.ACTIVATION_DATABASE_QUERY_TIMEOUT_MS,
        15_000,
        100,
        120_000
      ),
      statementTimeoutMillis: positiveInteger(
        environment.ACTIVATION_DATABASE_STATEMENT_TIMEOUT_MS,
        10_000,
        100,
        120_000
      ),
      onIdleClientError: () => writeSecurityLog({
        event: "ACTIVATION_DATABASE_IDLE_CLIENT_ERROR",
        correlationId: "system:activation-database-pool",
        route: "runtime:activation-database",
        outcome: "ACTIVATION_DATABASE_CONNECTION_FAILED",
        status: 503
      })
    });
    const provider = Object.freeze({
      issuer: providerUrl.toString().replace(/\/$/, ""),
      projectId: stableCode(providerProjectId)
    });
    const verifier = new SupabaseServerSessionVerifier(createSupabaseRequestAuthApi({
      production,
      publishableKey,
      requestTimeoutMillis,
      supabaseUrl
    }));
    const activationContexts = new TrustedActivationContextFactory(
      verifier,
      new PostgresActivationContextSource(pool, provider)
    );
    const deviceTrust = new DeviceTrustActivationService(
      new PostgresDeviceTrustPolicySource(pool),
      new PostgresDeviceTrustCommandStore(pool)
    );
    const activationStore = new PostgresAccountActivationStore(pool, provider);
    const endpoint = createDeviceTrustHttp({
      activationContexts,
      activationReadiness: {
        read: (context, _decision, credentialHmac) =>
          activationStore.readActivationReadiness(context, credentialHmac)
      },
      deviceTrust,
      expectedOrigin: appOrigin,
      hmacSecret: deviceTrustHmacSecret,
      production
    });
    if (activationPoolFactory === createNodePostgresActivationPool) {
      cachedRuntime = Object.freeze({ configurationKey, endpoint });
    }
    return endpoint;
  } catch {
    return null;
  }
}

export function deviceTrustUnavailableResponse(): Response {
  const response = failureResponse("DEVICE_TRUST_UNAVAILABLE");
  const names = deviceTrustCookieNames(process.env.NODE_ENV === "production");
  clearCookie(response.headers, names.enrollment, process.env.NODE_ENV === "production");
  clearCookie(response.headers, names.trust, process.env.NODE_ENV === "production");
  return response;
}

type DeviceTrustFailureReason =
  | "ACTIVATION_CONTEXT_DENIED"
  | "ACTIVATION_SESSION_REQUIRED"
  | "DEVICE_TRUST_CSRF_INVALID"
  | "DEVICE_TRUST_ENROLLMENT_INVALID_OR_REPLAYED"
  | "DEVICE_TRUST_NOT_ACTIVE"
  | "DEVICE_TRUST_ORIGIN_INVALID"
  | "DEVICE_TRUST_POLICY_UNAVAILABLE"
  | "DEVICE_TRUST_REQUEST_INVALID"
  | "DEVICE_TRUST_UNAVAILABLE";

class DeviceTrustHttpError extends Error {
  public constructor(public readonly reasonCode: DeviceTrustFailureReason) {
    super(reasonCode);
    this.name = "DeviceTrustHttpError";
  }
}

function execute(
  route: DeviceTrustRoute,
  request: Request,
  operation: (requestCorrelationId: string) => Promise<Response>
): Promise<Response> {
  const requestCorrelationId = safeCorrelation(request);
  return operation(requestCorrelationId).then((response) => {
    writeSecurityLog({
      event: response.status >= 500 ? "ACTIVATION_REQUEST_FAILED" : response.status >= 400 ? "ACTIVATION_REQUEST_DENIED" : "ACTIVATION_REQUEST_COMPLETED",
      correlationId: requestCorrelationId,
      route,
      outcome: response.status >= 500 ? "ACTIVATION_REQUEST_FAILED" : response.status >= 400 ? "ACTIVATION_REQUEST_DENIED" : "ACTIVATION_REQUEST_COMPLETED",
      status: response.status
    });
    return response;
  }).catch((error: unknown) => {
    const reasonCode = error instanceof DeviceTrustHttpError ? error.reasonCode : "DEVICE_TRUST_UNAVAILABLE";
    const response = failureResponse(reasonCode);
    writeSecurityLog({
      event: response.status >= 500 ? "ACTIVATION_REQUEST_FAILED" : "ACTIVATION_REQUEST_DENIED",
      correlationId: requestCorrelationId,
      route,
      outcome: reasonCode,
      status: response.status
    });
    return response;
  });
}

function mappedServiceError(error: unknown): DeviceTrustHttpError {
  if (error instanceof DeviceTrustPolicyUnavailableError) {
    return new DeviceTrustHttpError("DEVICE_TRUST_POLICY_UNAVAILABLE");
  }
  if (
    error instanceof IdentityVerificationError &&
    error.message === "DEVICE_TRUST_ENROLLMENT_INVALID_OR_REPLAYED"
  ) {
    return new DeviceTrustHttpError("DEVICE_TRUST_ENROLLMENT_INVALID_OR_REPLAYED");
  }
  return new DeviceTrustHttpError("DEVICE_TRUST_UNAVAILABLE");
}

function requireMutationTrust(request: Request, csrfCookieName: string, expectedOrigin: string): void {
  const origin = request.headers.get("origin");
  if (origin === null || origin !== expectedOrigin || new URL(request.url).origin !== expectedOrigin) {
    throw new DeviceTrustHttpError("DEVICE_TRUST_ORIGIN_INVALID");
  }
  const cookie = readCookie(request, csrfCookieName);
  const header = request.headers.get("x-csrf-token");
  if (cookie === null || header === null || !constantTimeEqual(cookie, header)) {
    throw new DeviceTrustHttpError("DEVICE_TRUST_CSRF_INVALID");
  }
}

async function requireEmptyJson(request: Request): Promise<void> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
    throw new DeviceTrustHttpError("DEVICE_TRUST_REQUEST_INVALID");
  }
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > MAXIMUM_DEVICE_TRUST_BODY_BYTES)
  ) {
    throw new DeviceTrustHttpError("DEVICE_TRUST_REQUEST_INVALID");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAXIMUM_DEVICE_TRUST_BODY_BYTES) {
    throw new DeviceTrustHttpError("DEVICE_TRUST_REQUEST_INVALID");
  }
  try {
    const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (body === null || Array.isArray(body) || typeof body !== "object" || Object.keys(body).length !== 0) {
      throw new Error("invalid empty object");
    }
  } catch {
    throw new DeviceTrustHttpError("DEVICE_TRUST_REQUEST_INVALID");
  }
}

function requireSignedDeviceCookie(
  request: Request,
  cookieName: string,
  secret: string,
  signatureContext: string,
  context: TrustedActivationContext
): Readonly<{ deviceTrustId: string; nonce: string }> {
  const value = readCookie(request, cookieName);
  if (value === null) throw new DeviceTrustHttpError("DEVICE_TRUST_NOT_ACTIVE");
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/i.exec(value);
  if (match === null) throw new DeviceTrustHttpError("DEVICE_TRUST_NOT_ACTIVE");
  const deviceTrustId = match[1] ?? "";
  const nonce = match[2] ?? "";
  const suppliedSignature = match[3] ?? "";
  const expected = deviceCookieSignature(
    secret,
    signatureContext,
    deviceTrustId,
    context.userAccountId,
    context.providerSessionId,
    nonce
  );
  if (!constantTimeEqual(suppliedSignature, expected)) {
    throw new DeviceTrustHttpError("DEVICE_TRUST_NOT_ACTIVE");
  }
  return Object.freeze({ deviceTrustId, nonce });
}

function signedDeviceCookie(
  secret: string,
  signatureContext: string,
  deviceTrustId: string,
  userAccountId: string,
  providerSessionId: string,
  nonce: string
): string {
  return `${deviceTrustId}.${nonce}.${deviceCookieSignature(
    secret,
    signatureContext,
    deviceTrustId,
    userAccountId,
    providerSessionId,
    nonce
  )}`;
}

function deviceCookieSignature(
  secret: string,
  signatureContext: string,
  deviceTrustId: string,
  userAccountId: string,
  providerSessionId: string,
  nonce: string
): string {
  return createHmac("sha256", secret)
    .update(signatureContext, "utf8")
    .update(deviceTrustId, "utf8")
    .update("\0", "utf8")
    .update(userAccountId, "utf8")
    .update("\0", "utf8")
    .update(providerSessionId, "utf8")
    .update("\0", "utf8")
    .update(nonce, "utf8")
    .digest("base64url");
}

function deviceCredentialHmac(
  secret: string,
  userAccountId: string,
  providerSessionId: string,
  nonce: string
) {
  return sha256(createHmac("sha256", secret)
    .update(DEVICE_CREDENTIAL_CONTEXT, "utf8")
    .update(userAccountId, "utf8")
    .update("\0", "utf8")
    .update(providerSessionId, "utf8")
    .update("\0", "utf8")
    .update(nonce, "utf8")
    .digest("hex"));
}

function deviceTrustCookieNames(production: boolean): DeviceTrustCookieNames {
  const prefix = production ? "__Host-" : "";
  return Object.freeze({
    access: `${prefix}youone-access`,
    csrf: `${prefix}youone-csrf`,
    enrollment: `${prefix}youone-device-enrollment`,
    trust: `${prefix}youone-device-trust`
  });
}

function appendCookie(
  headers: Headers,
  name: string,
  value: string,
  options: Readonly<{ maxAge: number; production: boolean }>
): void {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${options.maxAge}`,
    "SameSite=Strict",
    "HttpOnly"
  ];
  if (options.production) parts.push("Secure");
  headers.append("Set-Cookie", parts.join("; "));
}

function clearCookie(headers: Headers, name: string, production: boolean): void {
  appendCookie(headers, name, "", { maxAge: 0, production });
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

function requiredNonce(value: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new DeviceTrustHttpError("DEVICE_TRUST_UNAVAILABLE");
  }
  return value;
}

function secondsUntil(expiresAt: string, now: string): number {
  const seconds = Math.ceil((Date.parse(expiresAt) - Date.parse(now)) / 1_000);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new DeviceTrustHttpError("DEVICE_TRUST_UNAVAILABLE");
  }
  return seconds;
}

function failureResponse(reasonCode: DeviceTrustFailureReason): Response {
  const status = reasonStatus(reasonCode);
  return json(status, {
    outcome: status >= 500 ? "UNAVAILABLE" : "REJECTED",
    reasonCode
  });
}

function reasonStatus(reasonCode: DeviceTrustFailureReason): number {
  if (reasonCode === "DEVICE_TRUST_UNAVAILABLE" || reasonCode === "DEVICE_TRUST_POLICY_UNAVAILABLE") return 503;
  if (reasonCode === "ACTIVATION_SESSION_REQUIRED") return 401;
  if (reasonCode === "DEVICE_TRUST_ENROLLMENT_INVALID_OR_REPLAYED") return 409;
  if (
    reasonCode === "ACTIVATION_CONTEXT_DENIED" ||
    reasonCode === "DEVICE_TRUST_CSRF_INVALID" ||
    reasonCode === "DEVICE_TRUST_NOT_ACTIVE" ||
    reasonCode === "DEVICE_TRUST_ORIGIN_INVALID"
  ) return 403;
  return 400;
}

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function safeCorrelation(request: Request): string {
  const supplied = request.headers.get("x-correlation-id")?.trim() ?? "";
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(supplied)
    ? supplied
    : `request:${crypto.randomUUID()}`;
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

function validatedHmacSecret(value: string): string {
  if (value.length < 32 || value.length > 4_096 || /\s/.test(value)) {
    throw new DeviceTrustHttpError("DEVICE_TRUST_UNAVAILABLE");
  }
  return value;
}

function validatedOrigin(value: string, production: boolean): string {
  try {
    const url = new URL(value);
    if (
      (production ? url.protocol !== "https:" : url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.pathname !== "" && url.pathname !== "/")
    ) throw new Error("invalid origin");
    return url.origin;
  } catch {
    throw new DeviceTrustHttpError("DEVICE_TRUST_ORIGIN_INVALID");
  }
}

function positiveInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new DeviceTrustHttpError("DEVICE_TRUST_UNAVAILABLE");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new DeviceTrustHttpError("DEVICE_TRUST_UNAVAILABLE");
  }
  return value;
}

/** Secret-bearing configuration cache keys include only one-way hashes. */
export function deviceTrustConfigurationFingerprint(configuration: object): string {
  return createHash("sha256").update(JSON.stringify(configuration), "utf8").digest("hex");
}

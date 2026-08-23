import type { AuthSessionVerifier, VerifiedAuthSession } from "@youone/core-identity/public";
import { IdentityVerificationError } from "@youone/core-identity/public";
import { utcInstant, uuid } from "@youone/shared-kernel/public";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseVerifiedUser = Readonly<{ id: string }>;
export type SupabaseVerifiedClaims = Readonly<{ sub: string; exp: number; session_id?: string; aal?: string }>;

export interface SupabaseRequestAuthApi {
  getUser(accessToken: string): Promise<{ user: SupabaseVerifiedUser | null; error?: unknown }>;
  getClaims(accessToken: string): Promise<{ claims: SupabaseVerifiedClaims | null; error?: unknown }>;
}

export type SupabaseRequestAuthRuntimeOptions = Readonly<{
  fetch?: typeof globalThis.fetch;
  production: boolean;
  publishableKey: string;
  requestTimeoutMillis?: number;
  supabaseUrl: string;
}>;

export type SupabaseRequestAuthProbe = Readonly<
  | { ready: true }
  | { ready: false; reasonCode: "REQUEST_AUTH_CONFIG_INVALID" | "REQUEST_AUTH_PROVIDER_UNAVAILABLE" }
>;

export class SupabaseRequestAuthBoundaryError extends Error {
  public constructor(
    public readonly reasonCode: "REQUEST_AUTH_CONFIG_INVALID" | "REQUEST_AUTH_PROVIDER_UNAVAILABLE",
    options?: ErrorOptions
  ) {
    super(reasonCode, options);
    this.name = "SupabaseRequestAuthBoundaryError";
  }
}

/** Concrete server request adapter. It never persists or refreshes caller sessions. */
export class SupabaseSdkRequestAuthApi implements SupabaseRequestAuthApi {
  public constructor(
    private readonly client: Pick<SupabaseClient, "auth">,
    private readonly healthEndpoint: URL,
    private readonly publishableKey: string,
    private readonly fetchImplementation: typeof globalThis.fetch
  ) {}

  public async getUser(accessToken: string): Promise<{ user: SupabaseVerifiedUser | null; error?: unknown }> {
    try {
      const { data, error } = await this.client.auth.getUser(accessToken);
      return {
        user: data.user === null ? null : Object.freeze({ id: data.user.id }),
        ...(error === null ? {} : { error: new Error("REQUEST_AUTH_USER_VERIFICATION_FAILED") })
      };
    } catch {
      return { user: null, error: new Error("REQUEST_AUTH_USER_VERIFICATION_FAILED") };
    }
  }

  public async getClaims(accessToken: string): Promise<{ claims: SupabaseVerifiedClaims | null; error?: unknown }> {
    try {
      const { data, error } = await this.client.auth.getClaims(accessToken);
      if (error !== null || data === null) {
        return { claims: null, error: new Error("REQUEST_AUTH_CLAIMS_VERIFICATION_FAILED") };
      }
      const { aal, exp, session_id: sessionId, sub } = data.claims;
      return {
        claims: Object.freeze({
          sub: typeof sub === "string" ? sub : "",
          exp: typeof exp === "number" ? exp : Number.NaN,
          ...(typeof sessionId === "string" ? { session_id: sessionId } : {}),
          ...(typeof aal === "string" ? { aal } : {})
        })
      };
    } catch {
      return { claims: null, error: new Error("REQUEST_AUTH_CLAIMS_VERIFICATION_FAILED") };
    }
  }

  public async probe(): Promise<SupabaseRequestAuthProbe> {
    try {
      const response = await this.fetchImplementation(this.healthEndpoint, {
        cache: "no-store",
        headers: { apikey: this.publishableKey, "X-Client-Info": "youone-rnd-readiness" },
        method: "GET",
        redirect: "error"
      });
      if (!response.ok) {
        await response.body?.cancel();
        return Object.freeze({ ready: false, reasonCode: "REQUEST_AUTH_PROVIDER_UNAVAILABLE" });
      }
      const health = await response.json() as { name?: unknown };
      return health.name === "GoTrue"
        ? Object.freeze({ ready: true })
        : Object.freeze({ ready: false, reasonCode: "REQUEST_AUTH_PROVIDER_UNAVAILABLE" });
    } catch {
      return Object.freeze({ ready: false, reasonCode: "REQUEST_AUTH_PROVIDER_UNAVAILABLE" });
    }
  }
}

export function createSupabaseRequestAuthApi(
  options: SupabaseRequestAuthRuntimeOptions
): SupabaseSdkRequestAuthApi {
  const baseUrl = validatedSupabaseUrl(options.supabaseUrl, options.production);
  assertPublishableKey(options.publishableKey);
  const timeoutMillis = boundedTimeout(options.requestTimeoutMillis ?? 5_000);
  const fetchImplementation = boundedFetch(options.fetch ?? globalThis.fetch, timeoutMillis);
  const client = createClient(baseUrl.toString(), options.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    global: { fetch: fetchImplementation }
  });
  return new SupabaseSdkRequestAuthApi(
    client,
    new URL("auth/v1/health", baseUrl),
    options.publishableKey,
    fetchImplementation
  );
}

/** Server-verified user/claims only; user-editable metadata is not part of this contract. */
export class SupabaseServerSessionVerifier implements AuthSessionVerifier {
  constructor(
    private readonly api: SupabaseRequestAuthApi,
    private readonly now: () => number = Date.now
  ) {}
  async verify(accessToken: string): Promise<VerifiedAuthSession> {
    if (accessToken.trim().length === 0) throw new IdentityVerificationError("access token is missing");
    let userResult: Awaited<ReturnType<SupabaseRequestAuthApi["getUser"]>>;
    let claimsResult: Awaited<ReturnType<SupabaseRequestAuthApi["getClaims"]>>;
    try {
      [userResult, claimsResult] = await Promise.all([this.api.getUser(accessToken), this.api.getClaims(accessToken)]);
    } catch {
      throw new IdentityVerificationError("Supabase session verification failed");
    }
    if (userResult.error !== undefined || claimsResult.error !== undefined || userResult.user === null || claimsResult.claims === null) {
      throw new IdentityVerificationError("Supabase session verification failed");
    }
    if (userResult.user.id.trim().length === 0 || claimsResult.claims.sub.trim().length === 0) throw new IdentityVerificationError("verified subject is missing");
    if (userResult.user.id !== claimsResult.claims.sub) throw new IdentityVerificationError("verified user and claims subject differ");
    if (claimsResult.claims.session_id?.trim().length === 0 || claimsResult.claims.session_id === undefined) {
      throw new IdentityVerificationError("verified session ID is missing");
    }
    if (!Number.isSafeInteger(claimsResult.claims.exp) || claimsResult.claims.exp <= 0) {
      throw new IdentityVerificationError("verified session expiry is invalid");
    }
    const expiresAt = new Date(claimsResult.claims.exp * 1000);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new IdentityVerificationError("verified session expiry is invalid");
    }
    if (expiresAt.getTime() <= this.now()) {
      throw new IdentityVerificationError("verified session is expired");
    }
    if (claimsResult.claims.aal !== "aal2") {
      throw new IdentityVerificationError("verified session assurance level is insufficient");
    }
    let verifiedSubject: string;
    let verifiedSessionId: string;
    try {
      verifiedSubject = uuid(userResult.user.id);
      verifiedSessionId = uuid(claimsResult.claims.session_id);
    } catch {
      throw new IdentityVerificationError("verified provider identifiers are invalid");
    }
    return Object.freeze({
      authSubject: verifiedSubject,
      sessionId: verifiedSessionId,
      expiresAt: utcInstant(expiresAt),
      assuranceLevel: "AAL2"
    });
  }
}

function validatedSupabaseUrl(value: string, production: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new SupabaseRequestAuthBoundaryError("REQUEST_AUTH_CONFIG_INVALID", { cause: error });
  }
  const protocolAllowed = production ? url.protocol === "https:" : url.protocol === "https:" || url.protocol === "http:";
  if (
    !protocolAllowed ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.pathname !== "" && url.pathname !== "/")
  ) {
    throw new SupabaseRequestAuthBoundaryError("REQUEST_AUTH_CONFIG_INVALID");
  }
  url.pathname = "/";
  return url;
}

function assertPublishableKey(value: string): void {
  const key = value.trim();
  if (key.length < 16 || /\s/.test(key) || key.startsWith("sb_secret_") || legacyJwtRole(key) === "service_role") {
    throw new SupabaseRequestAuthBoundaryError("REQUEST_AUTH_CONFIG_INVALID");
  }
}

function legacyJwtRole(value: string): string | undefined {
  const payload = value.split(".")[1];
  if (!payload) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown };
    return typeof decoded.role === "string" ? decoded.role : undefined;
  } catch {
    return undefined;
  }
}

function boundedTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 500 || value > 30_000) {
    throw new SupabaseRequestAuthBoundaryError("REQUEST_AUTH_CONFIG_INVALID");
  }
  return value;
}

function boundedFetch(
  delegate: typeof globalThis.fetch,
  timeoutMillis: number
): typeof globalThis.fetch {
  return async (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMillis);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return delegate(input, { ...init, signal });
  };
}

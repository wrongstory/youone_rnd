import type {
  OperationalAuthNextAction,
  OperationalAuthReasonCode
} from "@youone/core-identity/public";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type OperationalProviderSession = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}>;

export type OperationalLoginResult = Readonly<{
  nextAction: OperationalAuthNextAction;
  session: OperationalProviderSession;
  factorId?: string;
}>;

export type OperationalEnrollmentResult = Readonly<{
  factorId: string;
  manualSecret: string;
  qrCode: string;
}>;

export interface OperationalAuthProvider {
  signIn(identifier: string, credential: string): Promise<OperationalProviderSession>;
  refresh(refreshToken: string): Promise<OperationalProviderSession>;
  assurance(accessToken: string): Promise<Readonly<{ currentLevel: string | null; nextLevel: string | null }>>;
  verifiedTotpFactors(session: OperationalProviderSession): Promise<readonly Readonly<{ id: string }>[]>;
  enrollTotp(session: OperationalProviderSession): Promise<OperationalEnrollmentResult>;
  verifyTotp(session: OperationalProviderSession, factorId: string, code: string): Promise<OperationalProviderSession>;
  recover(identifier: string, redirectTo: string): Promise<void>;
  signOutGlobally(session: OperationalProviderSession): Promise<void>;
}

export class SupabaseOperationalAuthError extends Error {
  public constructor(public readonly reasonCode: OperationalAuthReasonCode) {
    super(reasonCode);
    this.name = "SupabaseOperationalAuthError";
  }
}

/** Provider-independent orchestration. Tokens and provider factor IDs never belong to response DTOs. */
export class SupabaseOperationalAuthGateway {
  public constructor(private readonly provider: OperationalAuthProvider) {}

  public async login(identifier: string, credential: string): Promise<OperationalLoginResult> {
    const session = await this.provider.signIn(identifier, credential);
    return this.classify(session);
  }

  public async refresh(refreshToken: string): Promise<OperationalLoginResult> {
    const session = await this.provider.refresh(refreshToken);
    return this.classify(session);
  }

  public enrollTotp(session: OperationalProviderSession): Promise<OperationalEnrollmentResult> {
    return this.provider.enrollTotp(session);
  }

  public async verifyTotp(
    session: OperationalProviderSession,
    factorId: string,
    code: string
  ): Promise<OperationalProviderSession> {
    const verified = await this.provider.verifyTotp(session, factorId, code);
    const assurance = await this.provider.assurance(verified.accessToken);
    if (assurance.currentLevel !== "aal2") {
      throw new SupabaseOperationalAuthError("AUTH_MFA_CODE_INVALID");
    }
    return verified;
  }

  public recover(identifier: string, redirectTo: string): Promise<void> {
    return this.provider.recover(identifier, redirectTo);
  }

  public signOutGlobally(session: OperationalProviderSession): Promise<void> {
    return this.provider.signOutGlobally(session);
  }

  private async classify(session: OperationalProviderSession): Promise<OperationalLoginResult> {
    const assurance = await this.provider.assurance(session.accessToken);
    if (assurance.currentLevel === "aal2") {
      return Object.freeze({ nextAction: "AUTHENTICATED", session });
    }
    const factors = await this.provider.verifiedTotpFactors(session);
    if (factors.length === 0) return Object.freeze({ nextAction: "MFA_ENROLL", session });
    if (factors.length !== 1 || factors[0] === undefined) {
      throw new SupabaseOperationalAuthError("AUTH_MFA_FACTOR_AMBIGUOUS");
    }
    return Object.freeze({ nextAction: "MFA_CHALLENGE", session, factorId: factors[0].id });
  }
}

export type SupabaseOperationalAuthRuntimeOptions = Readonly<{
  fetch?: typeof globalThis.fetch;
  production: boolean;
  publishableKey: string;
  redirectOrigin: string;
  requestTimeoutMillis?: number;
  supabaseUrl: string;
}>;

export function createSupabaseOperationalAuthGateway(
  options: SupabaseOperationalAuthRuntimeOptions
): SupabaseOperationalAuthGateway {
  const baseUrl = validatedUrl(options.supabaseUrl, options.production, "AUTH_PROVIDER_UNAVAILABLE");
  const redirectOrigin = validatedUrl(options.redirectOrigin, options.production, "AUTH_ORIGIN_INVALID");
  assertPublishableKey(options.publishableKey);
  const timeoutMillis = boundedTimeout(options.requestTimeoutMillis ?? 5_000);
  const fetchImplementation = boundedFetch(options.fetch ?? globalThis.fetch, timeoutMillis);
  const createSdkClient = () => createClient(baseUrl.toString(), options.publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { fetch: fetchImplementation }
  });
  return new SupabaseOperationalAuthGateway(
    new SupabaseSdkOperationalAuthProvider(createSdkClient, redirectOrigin)
  );
}

class SupabaseSdkOperationalAuthProvider implements OperationalAuthProvider {
  public constructor(
    private readonly createClient: () => SupabaseClient,
    private readonly redirectOrigin: URL
  ) {}

  public async signIn(identifier: string, credential: string): Promise<OperationalProviderSession> {
    try {
      const client = this.createClient();
      const { data, error } = await client.auth.signInWithPassword({ email: identifier, password: credential });
      if (error !== null || data.session === null) throw providerError(error);
      return providerSession(data.session);
    } catch (error) {
      throw normalizedProviderError(error);
    }
  }

  public async refresh(refreshToken: string): Promise<OperationalProviderSession> {
    try {
      const client = this.createClient();
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error !== null || data.session === null) throw providerError(error);
      return providerSession(data.session);
    } catch (error) {
      throw normalizedProviderError(error);
    }
  }

  public async assurance(accessToken: string): Promise<Readonly<{ currentLevel: string | null; nextLevel: string | null }>> {
    try {
      const client = this.createClient();
      const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
      if (error !== null || data === null) throw providerError(error);
      return Object.freeze({ currentLevel: data.currentLevel, nextLevel: data.nextLevel });
    } catch (error) {
      throw normalizedProviderError(error);
    }
  }

  public verifiedTotpFactors(session: OperationalProviderSession): Promise<readonly Readonly<{ id: string }>[]> {
    return this.withSession(session, async (client) => {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error !== null || data === null) throw providerError(error);
      return Object.freeze(data.totp.map((factor) => Object.freeze({ id: factor.id })));
    });
  }

  public enrollTotp(session: OperationalProviderSession): Promise<OperationalEnrollmentResult> {
    return this.withSession(session, async (client) => {
      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "유원산업기술 업무관리",
        issuer: "YOUONE-RND"
      });
      if (error !== null || data === null || data.type !== "totp") throw providerError(error);
      return Object.freeze({ factorId: data.id, manualSecret: data.totp.secret, qrCode: data.totp.qr_code });
    });
  }

  public verifyTotp(
    session: OperationalProviderSession,
    factorId: string,
    code: string
  ): Promise<OperationalProviderSession> {
    return this.withSession(session, async (client) => {
      const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
      if (error !== null || data === null) throw providerError(error, "AUTH_MFA_CODE_INVALID");
      return providerSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in
      });
    });
  }

  public async recover(identifier: string, redirectTo: string): Promise<void> {
    const target = new URL(redirectTo, this.redirectOrigin);
    if (target.origin !== this.redirectOrigin.origin || !target.pathname.startsWith("/auth/recovery")) {
      throw new SupabaseOperationalAuthError("AUTH_ORIGIN_INVALID");
    }
    try {
      const client = this.createClient();
      const { error } = await client.auth.resetPasswordForEmail(identifier, { redirectTo: target.toString() });
      if (error !== null) throw providerError(error);
    } catch (error) {
      throw normalizedProviderError(error);
    }
  }

  public signOutGlobally(session: OperationalProviderSession): Promise<void> {
    return this.withSession(session, async (client) => {
      const { error } = await client.auth.signOut({ scope: "global" });
      if (error !== null) throw providerError(error);
    });
  }

  private async withSession<Result>(
    session: OperationalProviderSession,
    operation: (client: SupabaseClient) => Promise<Result>
  ): Promise<Result> {
    try {
      const client = this.createClient();
      const { error } = await client.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken
      });
      if (error !== null) throw providerError(error, "AUTH_SESSION_REQUIRED");
      return await operation(client);
    } catch (error) {
      throw normalizedProviderError(error);
    }
  }
}

function providerSession(session: { access_token: string; refresh_token: string; expires_in: number }): OperationalProviderSession {
  if (
    session.access_token.length < 16 || session.access_token.length > 8_192 || /\s/.test(session.access_token) ||
    session.refresh_token.length < 16 || session.refresh_token.length > 8_192 || /\s/.test(session.refresh_token) ||
    !Number.isSafeInteger(session.expires_in) || session.expires_in < 60 || session.expires_in > 3_600
  ) {
    throw new SupabaseOperationalAuthError("AUTH_PROVIDER_UNAVAILABLE");
  }
  return Object.freeze({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresInSeconds: session.expires_in
  });
}

function providerError(error: unknown, fallback: OperationalAuthReasonCode = "AUTH_PROVIDER_UNAVAILABLE"): SupabaseOperationalAuthError {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (status === 429 || code.includes("rate_limit")) return new SupabaseOperationalAuthError("AUTH_RATE_LIMITED");
  if (code === "invalid_credentials" || code === "email_not_confirmed") {
    return new SupabaseOperationalAuthError("AUTH_INVALID_CREDENTIALS");
  }
  return new SupabaseOperationalAuthError(fallback);
}

function normalizedProviderError(error: unknown): SupabaseOperationalAuthError {
  return error instanceof SupabaseOperationalAuthError
    ? error
    : new SupabaseOperationalAuthError("AUTH_PROVIDER_UNAVAILABLE");
}

function validatedUrl(value: string, production: boolean, reasonCode: OperationalAuthReasonCode): URL {
  try {
    const url = new URL(value);
    if (
      (production ? url.protocol !== "https:" : url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" ||
      (url.pathname !== "" && url.pathname !== "/")
    ) throw new Error("invalid URL");
    url.pathname = "/";
    return url;
  } catch {
    throw new SupabaseOperationalAuthError(reasonCode);
  }
}

function assertPublishableKey(value: string): void {
  const key = value.trim();
  if (key.length < 16 || /\s/.test(key) || key.startsWith("sb_secret_") || legacyJwtRole(key) === "service_role") {
    throw new SupabaseOperationalAuthError("AUTH_PROVIDER_UNAVAILABLE");
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
    throw new SupabaseOperationalAuthError("AUTH_PROVIDER_UNAVAILABLE");
  }
  return value;
}

function boundedFetch(delegate: typeof globalThis.fetch, timeoutMillis: number): typeof globalThis.fetch {
  return async (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMillis);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return delegate(input, { ...init, signal });
  };
}

import {
  assertAuthorizedDecisionFor,
  assertTrustedActorContext,
  type TrustedActorContext,
  type TrustedAuthorizationDecision,
  type TrustedResourceContext
} from "@youone/core-authorization/public";
import { stableCode, type StableCode, type Uuid } from "@youone/shared-kernel/public";

export const SUPABASE_SERVICE_BOUNDARY = Object.freeze({ privileged: true as const, serverOnly: true as const });
export const DISABLE_USER_ACTION = stableCode("identity.account.disable");

export interface SupabaseServiceAuthApi { disableUser(authSubject: string): Promise<void>; }

export type VerifiedTargetSession = Readonly<{
  authSubject: string;
  sessionId: string;
  issuer: string;
}>;

export interface SupabaseTargetSessionVerificationPort {
  verifyActiveToken(accessToken: string): Promise<VerifiedTargetSession>;
  resolveActiveSession(sessionId: string): Promise<VerifiedTargetSession | null>;
}

export interface SupabaseGlobalSignOutApi {
  signOut(accessToken: string, scope: "global"): Promise<void>;
}

declare const trustedTargetSessionBrand: unique symbol;
export type TrustedTargetSessionBinding = Readonly<{ [trustedTargetSessionBrand]: true }>;
const trustedTargetSessions = new WeakMap<object, Readonly<{
  accessToken: string;
  actor: TrustedActorContext;
  authorization: TrustedAuthorizationDecision;
  resource: TrustedResourceContext;
  sessionId: string;
}>>();

export type ServiceAuthAuditInput = Readonly<{
  actor: TrustedActorContext;
  action: typeof DISABLE_USER_ACTION;
  resourceId: Uuid;
  authorizationReason: StableCode;
}>;

/** The implementation must durably record both success and failure around the provider call. */
export interface ServiceAuthAuditBoundary {
  audited<Result>(input: ServiceAuthAuditInput, operation: () => Promise<Result>): Promise<Result>;
}

export class SupabaseServiceAuthAdapter {
  constructor(
    private readonly api: SupabaseServiceAuthApi,
    private readonly audit: ServiceAuthAuditBoundary
  ) {}

  disableUser(input: Readonly<{
    actor: TrustedActorContext;
    resource: TrustedResourceContext;
    authorization: TrustedAuthorizationDecision;
  }>): Promise<void> {
    assertTrustedActorContext(input.actor);
    const request = Object.freeze({ action: DISABLE_USER_ACTION, resource: input.resource });
    assertAuthorizedDecisionFor(input.authorization, input.actor, request);
    const authSubject = input.resource.authSubject;
    if (input.resource.resourceType !== "USER_ACCOUNT" || authSubject === undefined || authSubject.trim().length === 0) {
      throw new Error("service Auth disable requires a server-loaded USER_ACCOUNT auth subject");
    }
    return this.audit.audited(
      {
        actor: input.actor,
        action: DISABLE_USER_ACTION,
        resourceId: input.resource.resourceId,
        authorizationReason: input.authorization.reason
      },
      () => this.api.disableUser(authSubject)
    );
  }
}

/**
 * Binds a provider-verified target JWT to the exact server-loaded USER_ACCOUNT.
 * A request-body user ID is intentionally not accepted by this boundary.
 */
export class SupabaseTargetSessionBindingService {
  public constructor(
    private readonly sessions: SupabaseTargetSessionVerificationPort,
    private readonly configuredIssuer: string
  ) {
    if (!validIssuer(configuredIssuer)) throw new Error("target session issuer configuration is invalid");
  }

  public async bind(input: Readonly<{
    actor: TrustedActorContext;
    resource: TrustedResourceContext;
    authorization: TrustedAuthorizationDecision;
    targetAccessToken: string;
  }>): Promise<TrustedTargetSessionBinding> {
    assertTrustedActorContext(input.actor);
    assertAuthorizedDecisionFor(input.authorization, input.actor, Object.freeze({ action: DISABLE_USER_ACTION, resource: input.resource }));
    const expectedSubject = input.resource.authSubject;
    if (input.resource.resourceType !== "USER_ACCOUNT" || expectedSubject === undefined || expectedSubject.trim().length === 0) {
      throw new Error("target session resource is invalid");
    }
    if (input.targetAccessToken.length < 16 || input.targetAccessToken.length > 8_192 || /\s/.test(input.targetAccessToken)) {
      throw new Error("target session credential is invalid");
    }
    let verified: VerifiedTargetSession;
    let active: VerifiedTargetSession | null;
    try {
      verified = await this.sessions.verifyActiveToken(input.targetAccessToken);
      active = await this.sessions.resolveActiveSession(verified.sessionId);
    } catch {
      throw new Error("target session verification failed");
    }
    if (
      !validSessionId(verified.sessionId) || active === null ||
      verified.authSubject !== expectedSubject || active.authSubject !== expectedSubject ||
      active.sessionId !== verified.sessionId ||
      verified.issuer !== this.configuredIssuer || active.issuer !== this.configuredIssuer
    ) {
      throw new Error("target session binding failed");
    }
    const binding = Object.freeze({}) as TrustedTargetSessionBinding;
    trustedTargetSessions.set(binding, Object.freeze({
      accessToken: input.targetAccessToken,
      actor: input.actor,
      authorization: input.authorization,
      resource: input.resource,
      sessionId: verified.sessionId
    }));
    return binding;
  }
}

/** Uses only a provenance-bound target token and confirms exact-session removal after global sign-out. */
export class SupabaseGlobalSessionRevokeAdapter {
  public constructor(
    private readonly api: SupabaseGlobalSignOutApi,
    private readonly sessions: SupabaseTargetSessionVerificationPort,
    private readonly audit: ServiceAuthAuditBoundary
  ) {}

  public async revoke(binding: TrustedTargetSessionBinding): Promise<void> {
    const trusted = trustedTargetSessions.get(binding);
    if (trusted === undefined) throw new Error("target session binding was not produced by the trusted binder");
    await this.audit.audited(
      {
        actor: trusted.actor,
        action: DISABLE_USER_ACTION,
        resourceId: trusted.resource.resourceId,
        authorizationReason: trusted.authorization.reason
      },
      async () => {
        try {
          await this.api.signOut(trusted.accessToken, "global");
          if (await this.sessions.resolveActiveSession(trusted.sessionId) !== null) {
            throw new Error("target session remains active");
          }
        } catch {
          throw new Error("global target session revoke failed");
        }
      }
    );
  }
}

function validIssuer(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/auth/v1";
  } catch {
    return false;
  }
}

function validSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

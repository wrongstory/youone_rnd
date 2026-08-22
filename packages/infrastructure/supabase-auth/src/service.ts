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

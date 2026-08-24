import type { ActorEnvelope } from "@youone/application-kernel/public";
import { assertTrustedActorContext, type TrustedActorContext } from "@youone/core-authorization/public";
import type { OperationalSessionPresencePort } from "@youone/core-identity/public";
import {
  idempotencyKey,
  safeEventPayload,
  stableCode,
  version,
  type Sha256,
  type UtcInstant,
  type Uuid
} from "@youone/shared-kernel/public";

import type { SqlPool } from "./driver.js";
import type { TrustedRequestUnitOfWork } from "./request.js";

export class PostgresAuthSessionPresenceSource implements OperationalSessionPresencePort {
  public constructor(private readonly pool: SqlPool) {}

  public async exists(authSubject: string, sessionId: string): Promise<boolean> {
    const connection = await this.pool.connect();
    let began = false;
    let destroyConnection = false;
    let commitAttempted = false;
    try {
      await connection.query("begin read only");
      began = true;
      await connection.query("set local role youone_identity_resolver");
      await connection.query("set local row_security = on");
      const result = await connection.query<{ session_exists: boolean }>(
        "select app_private.auth_session_exists($1, $2) as session_exists",
        [authSubject, sessionId]
      );
      if (result.rowCount !== 1 || typeof result.rows[0]?.session_exists !== "boolean") {
        throw new Error("AUTH_SESSION_PRESENCE_UNAVAILABLE");
      }
      commitAttempted = true;
      await connection.query("commit");
      began = false;
      return result.rows[0].session_exists;
    } catch {
      if (commitAttempted) destroyConnection = true;
      if (began) {
        try {
          await connection.query("rollback");
          began = false;
        } catch {
          destroyConnection = true;
        }
      } else {
        destroyConnection = true;
      }
      throw new Error("AUTH_SESSION_PRESENCE_UNAVAILABLE");
    } finally {
      connection.release(destroyConnection || began);
    }
  }
}

export type AuthSessionRevocationEvidence = Readonly<{
  auditId: Uuid;
  bindingHash: Sha256;
  occurredAt: UtcInstant;
  operationId: Uuid;
}> & Readonly<
  | { outcome: "CONFIRMED" }
  | {
      outcome: "RECONCILIATION_SCHEDULED";
      outboxEventId: Uuid;
      reconciliationAt: UtcInstant;
    }
>;

export class PostgresAuthSessionRevocationEvidenceStore {
  public constructor(private readonly unitOfWork: TrustedRequestUnitOfWork) {}

  public async record(actor: TrustedActorContext, evidence: AuthSessionRevocationEvidence): Promise<void> {
    assertTrustedActorContext(actor);
    const actorEnvelope: ActorEnvelope = Object.freeze({
      actorKind: "USER",
      authenticatedActorId: actor.authenticatedActorId,
      effectiveActorId: actor.effectiveActorId,
      correlationId: actor.correlationId
    });

    await this.unitOfWork.execute(actor, async (transaction) => {
      await transaction.audit.append({
        id: evidence.auditId,
        actor: actorEnvelope,
        actionId: stableCode(evidence.outcome === "CONFIRMED"
          ? "auth.session.global_sign_out.confirmed"
          : "auth.session.global_sign_out.reconcile"),
        resourceType: stableCode("AUTH_SESSION_REVOCATION"),
        resourceId: evidence.operationId,
        resourceVersion: version(0),
        result: evidence.outcome === "CONFIRMED" ? "SUCCEEDED" : "FAILED",
        reasonCode: stableCode(evidence.outcome === "CONFIRMED"
          ? "AUTH_SESSION_REVOKED_CONFIRMED"
          : "AUTH_SESSION_RECONCILIATION_SCHEDULED"),
        afterHash: evidence.bindingHash,
        occurredAt: evidence.occurredAt
      });

      if (evidence.outcome === "RECONCILIATION_SCHEDULED") {
        await transaction.outbox.enqueue({
          id: evidence.outboxEventId,
          initiatingAuditId: evidence.auditId,
          actor: actorEnvelope,
          eventId: stableCode("AUTH_SESSION_REVOCATION_RECONCILIATION_REQUESTED"),
          aggregateType: stableCode("AUTH_SESSION_REVOCATION"),
          aggregateId: evidence.operationId,
          resourceVersion: version(0),
          correlationId: actor.correlationId,
          payloadSchemaId: stableCode("AUTH_SESSION_REVOCATION_RECONCILIATION_V1"),
          payloadSchemaVersion: version(1),
          payload: safeEventPayload({
            authSubjectId: actor.authSubject,
            providerSessionId: actor.sessionId,
            retryAttempts: 3,
            reconciliationIntervalMinutes: 15
          }),
          idempotencyKey: idempotencyKey(`auth-session-reconcile:${evidence.operationId}`),
          occurredAt: evidence.occurredAt,
          availableAt: evidence.reconciliationAt
        });
      }
    });
  }
}

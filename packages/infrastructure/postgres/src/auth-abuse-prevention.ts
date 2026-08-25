import type { ActorEnvelope } from "@youone/application-kernel/public";
import type {
  OperationalAuthAbusePreventionPort,
  OperationalAuthAttempt,
  OperationalAuthAttemptOutcome,
  OperationalAuthRateLimitDecision
} from "@youone/core-identity/public";
import { stableCode, uuid, version } from "@youone/shared-kernel/public";

import type { SqlPool } from "./driver";
import { PostgresUnitOfWork } from "./transaction";

const RATE_LIMIT_ACTION_IDS = Object.freeze({
  LOGIN: "auth.login",
  LOGOUT: "auth.logout",
  MFA_ENROLL: "auth.mfa.enroll",
  MFA_VERIFY: "auth.mfa.verify",
  RECOVERY: "auth.recovery",
  REFRESH: "auth.refresh"
} as const);

/**
 * Atomic PostgreSQL rate-limit consumption plus append-only audit evidence.
 * The request principal receives function capability only and never table access.
 */
export class PostgresOperationalAuthAbusePrevention implements OperationalAuthAbusePreventionPort {
  private readonly unitOfWork: PostgresUnitOfWork;

  public constructor(pool: SqlPool) {
    this.unitOfWork = new PostgresUnitOfWork(pool, { principal: "youone_request" });
  }

  public consume(attempt: OperationalAuthAttempt): Promise<OperationalAuthRateLimitDecision> {
    const actor = anonymousActor(attempt);
    const actionId = RATE_LIMIT_ACTION_IDS[attempt.action];
    return this.unitOfWork.execute(actor, async (transaction) => {
      await transaction.query("select set_config('app.request_time', $1, true)", [attempt.occurredAt]);
      const result = await transaction.query<{
        allowed: boolean;
        policy_version_id: string;
        retry_after_seconds: number;
      }>(
        `select allowed, policy_version_id, retry_after_seconds
         from app_private.consume_auth_rate_limit($1, $2, $3, $4, $5::timestamptz)`,
        [
          attempt.subjectFingerprint,
          attempt.globalFingerprint,
          actionId,
          attempt.policyVersion,
          attempt.occurredAt
        ]
      );
      const row = result.rows[0];
      if (
        result.rowCount !== 1 || row === undefined || typeof row.allowed !== "boolean" ||
        typeof row.policy_version_id !== "string" ||
        !Number.isSafeInteger(row.retry_after_seconds) || row.retry_after_seconds < 0
      ) {
        throw new Error("AUTH_RATE_LIMIT_EVIDENCE_UNAVAILABLE");
      }
      const selectedPolicyVersionId = uuid(row.policy_version_id);
      await transaction.audit.append({
        id: attempt.rateLimitAuditId,
        actor,
        actionId: stableCode(`${actionId}.rate_limit.consume`),
        resourceType: stableCode("AUTH_SECURITY_ATTEMPT"),
        resourceId: attempt.attemptId,
        resourceVersion: version(0),
        result: row.allowed ? "SUCCEEDED" : "DENIED",
        reasonCode: stableCode(row.allowed ? "AUTH_RATE_LIMIT_ALLOWED" : "AUTH_RATE_LIMITED"),
        reasonRecordRef: selectedPolicyVersionId,
        occurredAt: attempt.occurredAt
      });
      return Object.freeze({
        allowed: row.allowed,
        policyVersionId: selectedPolicyVersionId,
        retryAfterSeconds: row.retry_after_seconds
      });
    });
  }

  public recordOutcome(attempt: OperationalAuthAttempt, outcome: OperationalAuthAttemptOutcome): Promise<void> {
    const actor = anonymousActor(attempt);
    const actionId = RATE_LIMIT_ACTION_IDS[attempt.action];
    return this.unitOfWork.execute(actor, async (transaction) => {
      await transaction.query("select set_config('app.request_time', $1, true)", [attempt.occurredAt]);
      await transaction.query(
        `select app_private.append_auth_rate_limit_outcome(
          $1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7::timestamptz
        )`,
        [
          outcome.auditId,
          attempt.attemptId,
          actionId,
          outcome.policyVersionId,
          outcome.result,
          outcome.reasonCode,
          attempt.occurredAt
        ]
      );
    });
  }
}

function anonymousActor(attempt: OperationalAuthAttempt): ActorEnvelope {
  return Object.freeze({
    actorKind: "ANONYMOUS",
    anonymousSubjectFingerprint: attempt.subjectFingerprint,
    correlationId: attempt.correlationId
  });
}

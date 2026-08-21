import type { ActorEnvelope } from "@youone/application-kernel/public";

import type { SqlPool, SqlQueryResult } from "./driver.js";
import { PostgresUnitOfWork } from "./transaction.js";

export type WorkerDatabaseBoundary = Readonly<{
  principal: "youone_privileged_writer";
  privileged: true;
}>;

export const WORKER_DATABASE_BOUNDARY: WorkerDatabaseBoundary = Object.freeze({
  principal: "youone_privileged_writer",
  privileged: true
});

export type ClaimedOutboxDelivery = Readonly<{
  event_id: string;
  initiating_audit_log_id: string;
  actor_kind: "ANONYMOUS" | "SYSTEM" | "USER";
  actor_user_id: string | null;
  effective_actor_user_id: string | null;
  anonymous_subject_fingerprint: string | null;
  system_actor_id: string | null;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  resource_version: number;
  correlation_id: string;
  causation_id: string | null;
  payload_schema_id: string;
  payload_schema_version: number;
  payload: unknown;
  attempt_count: number;
}>;

export class OutboxDeliveryWorker {
  public constructor(private readonly pool: SqlPool) {}

  public async claim(
    actor: ActorEnvelope,
    workerId: string,
    leaseSeconds: number,
    batchSize: number
  ): Promise<readonly ClaimedOutboxDelivery[]> {
    const unitOfWork = new PostgresUnitOfWork(this.pool);
    return unitOfWork.execute(actor, async (transaction) => {
      const result: SqlQueryResult<ClaimedOutboxDelivery> = await transaction.query(
        "select * from app_private.claim_outbox($1, $2, $3)",
        [workerId, leaseSeconds, batchSize]
      );
      return result.rows;
    });
  }

  public async markDelivered(
    actor: ActorEnvelope,
    eventId: string,
    workerId: string,
    deliveredAt: string
  ): Promise<void> {
    const unitOfWork = new PostgresUnitOfWork(this.pool);
    await unitOfWork.execute(actor, async (transaction) => {
      await transaction.query(
        "select app_private.mark_outbox_delivered($1::uuid, $2, $3::timestamptz)",
        [eventId, workerId, deliveredAt]
      );
    });
  }

  public async markRetry(
    actor: ActorEnvelope,
    eventId: string,
    workerId: string,
    errorCode: string,
    retryAt: string
  ): Promise<void> {
    const unitOfWork = new PostgresUnitOfWork(this.pool);
    await unitOfWork.execute(actor, async (transaction) => {
      await transaction.query(
        "select app_private.mark_outbox_retry($1::uuid, $2, $3, $4::timestamptz)",
        [eventId, workerId, errorCode, retryAt]
      );
    });
  }

  public async markDeadLetter(
    actor: ActorEnvelope,
    eventId: string,
    workerId: string,
    errorCode: string
  ): Promise<void> {
    const unitOfWork = new PostgresUnitOfWork(this.pool);
    await unitOfWork.execute(actor, async (transaction) => {
      await transaction.query(
        "select app_private.mark_outbox_dead_letter($1::uuid, $2, $3)",
        [eventId, workerId, errorCode]
      );
    });
  }
}

export function createWorkerUnitOfWork(pool: SqlPool): PostgresUnitOfWork {
  return new PostgresUnitOfWork(pool);
}

export type { SqlConnection, SqlPool, SqlQueryResult } from "./driver.js";
export type { PostgresTransactionScope } from "./transaction.js";

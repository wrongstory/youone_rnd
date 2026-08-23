import type {
  ActorEnvelope,
  AuditEnvelope,
  AuditWriterPort,
  OutboxEnvelope,
  OutboxWriterPort,
  TransactionScope,
  TransitionEnvelope,
  TransitionWriterPort,
  UnitOfWork
} from "@youone/application-kernel/public";
import {
  validateActorEnvelope,
  validateAuditEnvelope,
  validateOutboxEnvelope,
  validateTransitionEnvelope
} from "@youone/core-audit/public";
import type { Version } from "@youone/shared-kernel/public";

import type { SqlConnection, SqlPool, SqlQueryResult } from "./driver";
import { StaleVersionError } from "./driver";

const SET_TRANSACTION_CONTEXT = `
select
  set_config('app.actor_kind', $1, true),
  set_config('app.actor_user_id', $2, true),
  set_config('app.effective_actor_user_id', $3, true),
  set_config('app.anonymous_subject_fingerprint', $4, true),
  set_config('app.system_actor_id', $5, true),
  set_config('app.correlation_id', $6, true),
  set_config('app.causation_id', $7, true)
`;

const APPLY_REQUEST_ROLE = "set local role youone_request";
const APPLY_ROW_SECURITY = "set local row_security = on";

export type PostgresTransactionOptions = Readonly<{
  principal?: "youone_request";
}>;

export interface PostgresTransactionScope extends TransactionScope {
  query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[]
  ): Promise<SqlQueryResult<Row>>;
  optimisticUpdate(
    sql: string,
    parameters: readonly unknown[],
    expectedVersion: Version
  ): Promise<Version>;
}

class PostgresAuditWriter implements AuditWriterPort {
  public constructor(
    private readonly connection: SqlConnection,
    private readonly actor: ActorEnvelope
  ) {}

  public async append(entry: AuditEnvelope): Promise<void> {
    validateAuditEnvelope(entry);
    assertSameActor(entry.actor, this.actor);
    await this.connection.query(
      `select app_private.append_audit(
        $1::uuid, $2, $3, $4::uuid, $5::bigint, $6, $7, $8::uuid,
        $9, $10, $11::inet, $12::timestamptz
      )`,
      [
        entry.id,
        entry.actionId,
        entry.resourceType,
        entry.resourceId ?? null,
        entry.resourceVersion ?? null,
        entry.result,
        entry.reasonCode ?? null,
        entry.reasonRecordRef ?? null,
        entry.beforeHash ?? null,
        entry.afterHash ?? null,
        null,
        entry.occurredAt
      ]
    );
  }
}

class PostgresTransitionWriter implements TransitionWriterPort {
  public constructor(
    private readonly connection: SqlConnection,
    private readonly actor: ActorEnvelope
  ) {}

  public async append(entry: TransitionEnvelope): Promise<void> {
    validateTransitionEnvelope(entry);
    assertSameActor(entry.actor, this.actor);
    await this.connection.query(
      `select app_private.append_state_transition(
        $1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8,
        $9::bigint, $10::bigint, $11, $12::uuid, $13, $14, $15::timestamptz
      )`,
      [
        entry.id,
        entry.auditId,
        entry.aggregateType,
        entry.aggregateId,
        entry.machineId,
        entry.eventId,
        entry.fromState ?? null,
        entry.toState,
        entry.fromVersion,
        entry.toVersion,
        entry.reasonCode ?? null,
        entry.reasonRecordRef ?? null,
        entry.correlationId,
        entry.causationId ?? null,
        entry.occurredAt
      ]
    );
  }
}

class PostgresOutboxWriter implements OutboxWriterPort {
  public constructor(
    private readonly connection: SqlConnection,
    private readonly actor: ActorEnvelope
  ) {}

  public async enqueue(entry: OutboxEnvelope): Promise<void> {
    validateOutboxEnvelope(entry);
    assertSameActor(entry.actor, this.actor);
    await this.connection.query(
      `select app_private.enqueue_outbox(
        $1::uuid, $2::uuid, $3, $4, $5::uuid, $6::bigint, $7, $8, $9,
        $10::bigint, $11::jsonb, $12, $13::timestamptz, $14::timestamptz
      )`,
      [
        entry.id,
        entry.initiatingAuditId,
        entry.eventId,
        entry.aggregateType,
        entry.aggregateId,
        entry.resourceVersion,
        entry.correlationId,
        entry.causationId ?? null,
        entry.payloadSchemaId,
        entry.payloadSchemaVersion,
        JSON.stringify(entry.payload),
        entry.idempotencyKey,
        entry.occurredAt,
        entry.availableAt
      ]
    );
  }
}

class PostgresTransaction implements PostgresTransactionScope {
  public readonly audit: AuditWriterPort;
  public readonly transitions: TransitionWriterPort;
  public readonly outbox: OutboxWriterPort;

  public constructor(
    private readonly connection: SqlConnection,
    actor: ActorEnvelope
  ) {
    this.audit = new PostgresAuditWriter(connection, actor);
    this.transitions = new PostgresTransitionWriter(connection, actor);
    this.outbox = new PostgresOutboxWriter(connection, actor);
  }

  public query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = []
  ): Promise<SqlQueryResult<Row>> {
    return this.connection.query<Row>(sql, parameters);
  }

  public async optimisticUpdate(
    sql: string,
    parameters: readonly unknown[],
    expectedVersion: Version
  ): Promise<Version> {
    const result = await this.connection.query<{ version_no: number }>(sql, parameters);
    if (result.rowCount !== 1 || result.rows[0] === undefined) {
      throw new StaleVersionError();
    }
    if (result.rows[0].version_no !== (expectedVersion as number) + 1) {
      throw new StaleVersionError();
    }
    return result.rows[0].version_no as Version;
  }
}

export class PostgresUnitOfWork implements UnitOfWork<PostgresTransactionScope> {
  public constructor(
    private readonly pool: SqlPool,
    private readonly options: PostgresTransactionOptions = {}
  ) {}

  public async execute<Result>(
    actor: ActorEnvelope,
    operation: (transaction: PostgresTransactionScope) => Promise<Result>
  ): Promise<Result> {
    validateActorEnvelope(actor);
    const connection = await this.pool.connect();
    let began = false;

    try {
      await connection.query("begin");
      began = true;
      if (this.options.principal === "youone_request") {
        await connection.query(APPLY_REQUEST_ROLE);
        await connection.query(APPLY_ROW_SECURITY);
      }
      await connection.query(SET_TRANSACTION_CONTEXT, [
        actor.actorKind,
        actor.authenticatedActorId ?? "",
        actor.effectiveActorId ?? "",
        actor.anonymousSubjectFingerprint ?? "",
        actor.systemActorId ?? "",
        actor.correlationId,
        actor.causationId ?? ""
      ]);
      const result = await operation(new PostgresTransaction(connection, actor));
      await connection.query("commit");
      return result;
    } catch (error) {
      if (began) await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
  }
}

function assertSameActor(actual: ActorEnvelope, expected: ActorEnvelope): void {
  if (
    actual.actorKind !== expected.actorKind ||
    actual.authenticatedActorId !== expected.authenticatedActorId ||
    actual.effectiveActorId !== expected.effectiveActorId ||
    actual.anonymousSubjectFingerprint !== expected.anonymousSubjectFingerprint ||
    actual.systemActorId !== expected.systemActorId ||
    actual.correlationId !== expected.correlationId ||
    actual.causationId !== expected.causationId
  ) {
    throw new Error("evidence actor envelope does not match the transaction actor");
  }
}

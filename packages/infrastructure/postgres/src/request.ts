import type { ActorEnvelope } from "@youone/application-kernel/public";
import { assertTrustedActorContext, type TrustedActorContext } from "@youone/core-authorization/public";

import type { SqlPool } from "./driver.js";
import { PostgresUnitOfWork, type PostgresTransactionScope } from "./transaction.js";

export type RequestDatabaseBoundary = Readonly<{
  bypassRls: false;
  principal: "youone_request";
}>;

export const REQUEST_DATABASE_BOUNDARY: RequestDatabaseBoundary = Object.freeze({
  bypassRls: false,
  principal: "youone_request"
});

/**
 * The only request-facing bridge from a verified M03 ActorContext to Postgres.
 * It deliberately does not accept actor identifiers as independent parameters.
 */
export class TrustedRequestUnitOfWork {
  public constructor(private readonly delegate: PostgresUnitOfWork) {}

  public async execute<Result>(
    actor: TrustedActorContext,
    operation: (transaction: PostgresTransactionScope) => Promise<Result>
  ): Promise<Result> {
    assertTrustedActorContext(actor);
    const envelope: ActorEnvelope = {
      actorKind: "USER",
      authenticatedActorId: actor.authenticatedActorId,
      effectiveActorId: actor.effectiveActorId,
      correlationId: actor.correlationId
    };
    return this.delegate.execute(envelope, async (transaction) => {
      await transaction.query(
        `select
          set_config('app.request_time', $1, true),
          set_config('app.session_id', $2, true),
          set_config('app.assurance_level', $3, true),
          set_config('app.acting_authority_id', $4, true)`,
        [actor.requestTime, actor.sessionId, actor.assuranceLevel, actor.selectedActingAuthorityId ?? ""]
      );
      return operation(transaction);
    });
  }
}

export function createTrustedRequestUnitOfWork(pool: SqlPool): TrustedRequestUnitOfWork {
  return new TrustedRequestUnitOfWork(new PostgresUnitOfWork(pool));
}

export type { SqlConnection, SqlPool, SqlQueryResult } from "./driver.js";
export { StaleVersionError } from "./driver.js";
export type { PostgresTransactionScope } from "./transaction.js";

import { describe, expect, it } from "vitest";
import type { ActorEnvelope } from "../../packages/application-kernel/src/public.js";
import { createRequestUnitOfWork, StaleVersionError, type SqlConnection, type SqlPool, type SqlQueryResult } from "../../packages/infrastructure/postgres/src/request.js";
import { correlationId, uuid, version } from "../../packages/shared-kernel/src/public.js";

class RecordingConnection implements SqlConnection {
  public calls: Array<{ sql: string; parameters: readonly unknown[] }> = [];
  public released = false;
  public nextResult: SqlQueryResult = { rows: [], rowCount: 0 };
  async query<Row extends object = Record<string, unknown>>(sql: string, parameters: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ sql, parameters });
    return this.nextResult as SqlQueryResult<Row>;
  }
  release(): void { this.released = true; }
}

const actor: ActorEnvelope = {
  actorKind: "USER",
  authenticatedActorId: uuid("550e8400-e29b-41d4-a716-446655440000"),
  effectiveActorId: uuid("f47ac10b-58cc-4372-a567-0e02b2c3d479"),
  correlationId: correlationId("req:m02-uow")
};

describe("M02 PostgreSQL UnitOfWork", () => {
  it("sets transaction-local context and commits", async () => {
    const connection = new RecordingConnection();
    const pool: SqlPool = { connect: async () => connection };
    await expect(createRequestUnitOfWork(pool).execute(actor, async () => "ok")).resolves.toBe("ok");
    expect(connection.calls.map(({ sql }) => sql.trim().split("\n")[0])).toEqual(["begin", "select", "commit"]);
    expect(connection.calls[1]?.parameters).toEqual(["USER", actor.authenticatedActorId, actor.effectiveActorId, "", "", actor.correlationId, ""]);
    expect(connection.released).toBe(true);
  });

  it("rolls back and releases on failure", async () => {
    const connection = new RecordingConnection();
    const pool: SqlPool = { connect: async () => connection };
    await expect(createRequestUnitOfWork(pool).execute(actor, async () => { throw new Error("domain failure"); })).rejects.toThrow("domain failure");
    expect(connection.calls.at(-1)?.sql).toBe("rollback");
    expect(connection.released).toBe(true);
  });

  it("maps an empty optimistic update to stale version", async () => {
    const connection = new RecordingConnection();
    const pool: SqlPool = { connect: async () => connection };
    await expect(createRequestUnitOfWork(pool).execute(actor, (tx) => tx.optimisticUpdate("update x returning version_no", [], version(0))))
      .rejects.toBeInstanceOf(StaleVersionError);
  });
});

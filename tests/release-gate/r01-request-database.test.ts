import { EventEmitter } from "node:events";
import type { Pool, PoolClient, QueryResult } from "pg";
import { describe, expect, it, vi } from "vitest";

import { probeRequestDatabase } from "../../apps/web/src/composition/request-database.js";
import {
  NodePostgresRequestPool,
  RequestDatabaseBoundaryError,
  createNodePostgresRequestPool
} from "../../packages/infrastructure/postgres/src/request.js";

const validBoundary = Object.freeze({
  request_role_active: true,
  row_security_on: true,
  request_not_superuser: true,
  request_no_bypassrls: true,
  request_noinherit: true,
  request_nologin: true,
  request_no_admin_capability: true,
  login_not_superuser: true,
  login_no_bypassrls: true,
  login_noinherit: true,
  login_can_login: true,
  login_no_admin_capability: true,
  login_owns_no_database_objects: true,
  login_can_set_request_role: true,
  login_can_set_only_request_role: true,
  request_context_clean: true
});

function result<Row extends object>(rows: readonly Row[]): QueryResult<Row> {
  return {
    command: "SELECT",
    fields: [],
    oid: 0,
    rowCount: rows.length,
    rows: [...rows]
  };
}

function client(boundary = validBoundary) {
  const query = vi.fn(async (sql: string) =>
    sql.includes("request_role_active") ? result([boundary]) : result([])
  );
  const release = vi.fn();
  return { query, release } as unknown as PoolClient & {
    query: typeof query;
    release: typeof release;
  };
}

describe("R01 concrete request PostgreSQL pool", () => {
  it("accepts only a clean NOBYPASSRLS request boundary", async () => {
    const current = client();
    const pool = { connect: vi.fn(async () => current), end: vi.fn(), on: vi.fn() } as unknown as Pool;
    const adapter = new NodePostgresRequestPool(pool);

    await expect(adapter.probe()).resolves.toEqual({
      principal: "youone_request",
      ready: true,
      rowSecurity: true
    });
    expect(current.query.mock.calls.map(([sql]) => sql)).toEqual([
      "begin read only",
      "set local role youone_request",
      "set local row_security = on",
      expect.stringContaining("request_context_clean"),
      "rollback"
    ]);
    expect(current.release).toHaveBeenCalledWith();
  });

  it("destroys a connection whose login or effective role can bypass RLS", async () => {
    const current = client({ ...validBoundary, login_not_superuser: false });
    const pool = { connect: vi.fn(async () => current), end: vi.fn(), on: vi.fn() } as unknown as Pool;

    await expect(new NodePostgresRequestPool(pool).probe()).rejects.toMatchObject({
      reasonCode: "REQUEST_DATABASE_PRINCIPAL_INVALID"
    });
    expect(current.release).toHaveBeenCalledWith(true);
  });

  it("normalizes connection failures without returning provider details", async () => {
    const pool = {
      connect: vi.fn(async () => {
        throw new Error("postgresql://operator:secret@database.example/internal");
      }),
      on: vi.fn()
    } as unknown as Pool;

    const error = await new NodePostgresRequestPool(pool).probe().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RequestDatabaseBoundaryError);
    expect(error).toMatchObject({ reasonCode: "REQUEST_DATABASE_CONNECTION_FAILED" });
    expect(String(error)).not.toContain("secret");
  });

  it("rejects connection URL options that could override trusted TLS or timeout settings", async () => {
    expect(() => createNodePostgresRequestPool({
      connectionString: "postgresql://request:secret@database.example/app?sslmode=no-verify",
      tls: "verify-full"
    })).toThrow(RequestDatabaseBoundaryError);
    expect(() => createNodePostgresRequestPool({
      connectionString: "postgresql://request:secret@database.example/app?statement_timeout=0",
      tls: "verify-full"
    })).toThrow(RequestDatabaseBoundaryError);
    const matching = createNodePostgresRequestPool({
      connectionString: "postgresql://request:secret@database.example/app?sslmode=verify-full",
      tls: "verify-full"
    });
    expect(matching).toBeInstanceOf(NodePostgresRequestPool);
    await matching.close();
  });

  it("handles idle-client errors with stable secretless telemetry", async () => {
    const pool = Object.assign(new EventEmitter(), {
      end: vi.fn(async () => undefined)
    }) as unknown as Pool;
    const telemetry = vi.fn();
    const adapter = new NodePostgresRequestPool(pool, telemetry);

    expect(() => pool.emit("error", new Error("postgresql://request:secret@database/app"))).not.toThrow();
    expect(telemetry).toHaveBeenCalledWith({
      event: "REQUEST_DATABASE_IDLE_CLIENT_ERROR",
      reasonCode: "REQUEST_DATABASE_CONNECTION_FAILED"
    });
    expect(JSON.stringify(telemetry.mock.calls)).not.toContain("secret");
    await adapter.close();
  });
});

describe("R01 web request database composition", () => {
  it("reports ready only after the concrete principal probe succeeds", async () => {
    const probe = vi.fn(async () => ({ principal: "youone_request", ready: true, rowSecurity: true } as const));
    const poolFactory = vi.fn(() => ({ probe }) as unknown as NodePostgresRequestPool);
    const readiness = await probeRequestDatabase({
      NODE_ENV: "test",
      REQUEST_DATABASE_URL: "postgresql://redacted",
      REQUEST_DATABASE_TLS_MODE: "disable",
      REQUEST_DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS: "12000",
      REQUEST_DATABASE_POOL_MAX: "4"
    }, poolFactory);

    expect(readiness).toEqual({ ready: true });
    expect(poolFactory).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: "postgresql://redacted",
      max: 4,
      idleInTransactionTimeoutMillis: 12_000,
      tls: "disable"
    }));
    expect(probe).toHaveBeenCalledOnce();
  });

  it("fails closed for missing, invalid, and production plaintext configuration", async () => {
    await expect(probeRequestDatabase({})).resolves.toEqual({
      ready: false,
      reasonCode: "REQUEST_DATABASE_URL_MISSING"
    });
    await expect(probeRequestDatabase({
      NODE_ENV: "production",
      REQUEST_DATABASE_URL: "postgresql://redacted",
      REQUEST_DATABASE_TLS_MODE: "disable"
    })).resolves.toEqual({ ready: false, reasonCode: "REQUEST_DATABASE_CONFIG_INVALID" });
    await expect(probeRequestDatabase({
      REQUEST_DATABASE_URL: "postgresql://redacted",
      REQUEST_DATABASE_POOL_MAX: "unbounded"
    })).resolves.toEqual({ ready: false, reasonCode: "REQUEST_DATABASE_CONFIG_INVALID" });
  });
});

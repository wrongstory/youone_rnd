import { describe, expect, it, vi } from "vitest";

import {
  NodePostgresWorkerPool,
  WorkerDatabaseBoundaryError,
  createNodePostgresWorkerPool
} from "../../packages/infrastructure/postgres/src/node-worker-pool.js";
import { probeWorkerDatabase } from "../../apps/worker/src/composition/worker-database.js";

const validBoundary = Object.freeze({
  worker_role_active: true,
  row_security_on: true,
  worker_role_nologin: true,
  worker_role_not_superuser: true,
  worker_role_no_bypassrls: true,
  worker_role_noinherit: true,
  worker_role_no_admin_capability: true,
  login_can_login: true,
  login_not_superuser: true,
  login_no_bypassrls: true,
  login_noinherit: true,
  login_no_admin_capability: true,
  login_owns_no_database_objects: true,
  login_can_set_worker_role: true,
  login_can_set_only_worker_role: true,
  worker_has_no_direct_business_table_access: true,
  worker_outbox_capability_ready: true,
  worker_context_clean: true
});

function fakePool(row = validBoundary) {
  const release = vi.fn();
  const query = vi.fn(async (sql: string) => sql.includes("worker_role_active")
    ? { rows: [row], rowCount: 1 }
    : { rows: [], rowCount: null });
  let idleError: (() => void) | undefined;
  const pool = {
    connect: vi.fn(async () => ({ query, release })),
    end: vi.fn(async () => undefined),
    on: vi.fn((_event: string, listener: () => void) => { idleError = listener; })
  };
  return { pool, query, release, idleError: () => idleError };
}

describe("R05 concrete Worker PostgreSQL boundary", () => {
  it("verifies the exact no-bypass Worker principal before releasing a connection", async () => {
    const fake = fakePool();
    const adapter = new NodePostgresWorkerPool(fake.pool as never);
    await expect(adapter.probe()).resolves.toEqual({ principal: "youone_privileged_writer", ready: true, rowSecurity: true });
    expect(fake.query.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
      "begin read only",
      "set local role youone_privileged_writer",
      "set local row_security = on",
      "rollback"
    ]));
    expect(fake.release).toHaveBeenCalledWith();
  });

  it("destroys a connection when any principal invariant fails", async () => {
    const fake = fakePool({ ...validBoundary, login_noinherit: false });
    const adapter = new NodePostgresWorkerPool(fake.pool as never);
    await expect(adapter.probe()).rejects.toBeInstanceOf(WorkerDatabaseBoundaryError);
    expect(fake.release).toHaveBeenCalledWith(true);
  });

  it("fails closed for missing, invalid and production plaintext configuration", async () => {
    await expect(probeWorkerDatabase()).resolves.toEqual({ ready: false, reasonCode: "WORKER_DATABASE_URL_MISSING" });
    await expect(probeWorkerDatabase({
      NODE_ENV: "production",
      WORKER_DATABASE_URL: "postgresql://worker:secret@db.example/app",
      WORKER_DATABASE_TLS_MODE: "disable"
    })).resolves.toEqual({ ready: false, reasonCode: "WORKER_DATABASE_CONFIG_INVALID" });
    expect(() => createNodePostgresWorkerPool({
      connectionString: "https://not-postgres.example",
      tls: "verify-full"
    })).toThrowError(WorkerDatabaseBoundaryError);
  });

  it("contains idle-client telemetry to a fixed event", () => {
    const fake = fakePool();
    const observed = vi.fn(() => { throw new Error("telemetry failed"); });
    new NodePostgresWorkerPool(fake.pool as never, observed);
    expect(() => fake.idleError()?.()).not.toThrow();
    expect(observed).toHaveBeenCalledWith({
      event: "WORKER_DATABASE_IDLE_CLIENT_ERROR",
      reasonCode: "WORKER_DATABASE_CONNECTION_FAILED"
    });
  });
});

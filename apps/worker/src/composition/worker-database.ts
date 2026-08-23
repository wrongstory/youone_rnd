import { createHash } from "node:crypto";

import {
  WorkerDatabaseBoundaryError,
  createNodePostgresWorkerPool,
  type NodePostgresWorkerPool,
  type NodePostgresWorkerPoolOptions
} from "@youone/infra-postgres/worker-pool";

import { writeWorkerSecurityLog } from "./security-log.js";

export type WorkerDatabaseReadiness = Readonly<
  | { ready: true }
  | {
      ready: false;
      reasonCode:
        | "WORKER_DATABASE_CONFIG_INVALID"
        | "WORKER_DATABASE_CONNECTION_FAILED"
        | "WORKER_DATABASE_PRINCIPAL_INVALID"
        | "WORKER_DATABASE_URL_MISSING";
    }
>;

type WorkerPoolFactory = (options: NodePostgresWorkerPoolOptions) => NodePostgresWorkerPool;
let singleton: Readonly<{ configurationKey: string; pool: NodePostgresWorkerPool }> | undefined;

export function getWorkerDatabasePool(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  factory: WorkerPoolFactory = createNodePostgresWorkerPool
): NodePostgresWorkerPool | null {
  const options = workerDatabaseOptions(environment);
  if (options === null) return null;
  const configurationKey = createHash("sha256").update(JSON.stringify(optionsWithoutCallback(options))).digest("hex");
  if (factory === createNodePostgresWorkerPool && singleton) {
    if (singleton.configurationKey !== configurationKey) {
      throw new WorkerDatabaseBoundaryError("WORKER_DATABASE_CONNECTION_FAILED");
    }
    return singleton.pool;
  }
  const pool = factory(options);
  if (factory === createNodePostgresWorkerPool) singleton = Object.freeze({ configurationKey, pool });
  return pool;
}

export async function probeWorkerDatabase(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  factory: WorkerPoolFactory = createNodePostgresWorkerPool
): Promise<WorkerDatabaseReadiness> {
  if (!environment.WORKER_DATABASE_URL) {
    return Object.freeze({ ready: false, reasonCode: "WORKER_DATABASE_URL_MISSING" });
  }
  let pool: NodePostgresWorkerPool | null;
  try {
    pool = getWorkerDatabasePool(environment, factory);
  } catch (error) {
    return Object.freeze({
      ready: false,
      reasonCode: error instanceof WorkerDatabaseBoundaryError
        ? error.reasonCode
        : "WORKER_DATABASE_CONFIG_INVALID"
    });
  }
  if (pool === null) return Object.freeze({ ready: false, reasonCode: "WORKER_DATABASE_URL_MISSING" });
  try {
    await pool.probe();
    return Object.freeze({ ready: true });
  } catch (error) {
    return Object.freeze({
      ready: false,
      reasonCode: error instanceof WorkerDatabaseBoundaryError
        ? error.reasonCode
        : "WORKER_DATABASE_CONNECTION_FAILED"
    });
  }
}

function workerDatabaseOptions(
  environment: Readonly<Record<string, string | undefined>>
): NodePostgresWorkerPoolOptions | null {
  const connectionString = environment.WORKER_DATABASE_URL;
  if (!connectionString) return null;
  const tls = environment.WORKER_DATABASE_TLS_MODE ?? "verify-full";
  if (tls !== "disable" && tls !== "verify-full") throw new Error("invalid Worker database TLS mode");
  if (environment.NODE_ENV === "production" && tls !== "verify-full") {
    throw new Error("Worker database TLS must use verify-full in production");
  }
  return Object.freeze({
    applicationName: "youone-worker",
    connectionString,
    tls,
    max: positiveInteger(environment.WORKER_DATABASE_POOL_MAX, 5, 1, 20),
    connectionTimeoutMillis: positiveInteger(environment.WORKER_DATABASE_CONNECTION_TIMEOUT_MS, 5_000, 100, 60_000),
    idleTimeoutMillis: positiveInteger(environment.WORKER_DATABASE_IDLE_TIMEOUT_MS, 30_000, 1_000, 300_000),
    idleInTransactionTimeoutMillis: positiveInteger(environment.WORKER_DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS, 15_000, 1_000, 120_000),
    queryTimeoutMillis: positiveInteger(environment.WORKER_DATABASE_QUERY_TIMEOUT_MS, 15_000, 100, 120_000),
    statementTimeoutMillis: positiveInteger(environment.WORKER_DATABASE_STATEMENT_TIMEOUT_MS, 10_000, 100, 120_000),
    onIdleClientError: () => writeWorkerSecurityLog({
      component: "database",
      correlationId: "system:worker-database-pool",
      event: "WORKER_DATABASE_IDLE_CLIENT_ERROR",
      outcome: "WORKER_DATABASE_CONNECTION_FAILED",
      status: 503
    })
  });
}

function optionsWithoutCallback(options: NodePostgresWorkerPoolOptions): object {
  return {
    applicationName: options.applicationName,
    connectionString: options.connectionString,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
    idleInTransactionTimeoutMillis: options.idleInTransactionTimeoutMillis,
    idleTimeoutMillis: options.idleTimeoutMillis,
    max: options.max,
    queryTimeoutMillis: options.queryTimeoutMillis,
    statementTimeoutMillis: options.statementTimeoutMillis,
    tls: options.tls
  };
}

function positiveInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error("invalid Worker database numeric setting");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error("Worker database numeric setting is outside the allowed range");
  }
  return value;
}

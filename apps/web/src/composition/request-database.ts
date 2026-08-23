import {
  RequestDatabaseBoundaryError,
  createNodePostgresRequestPool,
  createTrustedRequestUnitOfWork,
  type NodePostgresRequestPool,
  type NodePostgresRequestPoolOptions,
  type TrustedRequestUnitOfWork
} from "@youone/infra-postgres/request";

import { writeSecurityLog } from "./security-log";

export type RequestDatabaseReadiness = Readonly<
  | { ready: true }
  | {
      ready: false;
      reasonCode:
        | "REQUEST_DATABASE_CONFIG_INVALID"
        | "REQUEST_DATABASE_CONNECTION_FAILED"
        | "REQUEST_DATABASE_PRINCIPAL_INVALID"
        | "REQUEST_DATABASE_URL_MISSING";
    }
>;

export type RequestDatabaseComposition = Readonly<{
  pool: NodePostgresRequestPool;
  unitOfWork: TrustedRequestUnitOfWork;
}>;

type RequestPoolFactory = (options: NodePostgresRequestPoolOptions) => NodePostgresRequestPool;

let singleton:
  | Readonly<{
      configurationKey: string;
      composition: RequestDatabaseComposition;
    }>
  | undefined;

export function getRequestDatabaseComposition(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  poolFactory: RequestPoolFactory = createNodePostgresRequestPool
): RequestDatabaseComposition | null {
  const configuration = requestDatabaseConfiguration(environment);
  if (configuration === null) return null;

  const configurationKey = JSON.stringify(configuration);
  if (poolFactory === createNodePostgresRequestPool && singleton?.configurationKey === configurationKey) {
    return singleton.composition;
  }

  const pool = poolFactory(configuration);
  const composition = Object.freeze({
    pool,
    unitOfWork: createTrustedRequestUnitOfWork(pool)
  });
  if (poolFactory === createNodePostgresRequestPool) {
    singleton = Object.freeze({ configurationKey, composition });
  }
  return composition;
}

export async function probeRequestDatabase(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  poolFactory: RequestPoolFactory = createNodePostgresRequestPool
): Promise<RequestDatabaseReadiness> {
  if (!environment.REQUEST_DATABASE_URL) {
    return Object.freeze({ ready: false, reasonCode: "REQUEST_DATABASE_URL_MISSING" });
  }

  let composition: RequestDatabaseComposition | null;
  try {
    composition = getRequestDatabaseComposition(environment, poolFactory);
  } catch {
    return Object.freeze({ ready: false, reasonCode: "REQUEST_DATABASE_CONFIG_INVALID" });
  }
  if (composition === null) {
    return Object.freeze({ ready: false, reasonCode: "REQUEST_DATABASE_URL_MISSING" });
  }

  try {
    await composition.pool.probe();
    return Object.freeze({ ready: true });
  } catch (error) {
    if (error instanceof RequestDatabaseBoundaryError) {
      return Object.freeze({ ready: false, reasonCode: error.reasonCode });
    }
    return Object.freeze({ ready: false, reasonCode: "REQUEST_DATABASE_CONNECTION_FAILED" });
  }
}

function requestDatabaseConfiguration(
  environment: Readonly<Record<string, string | undefined>>
): NodePostgresRequestPoolOptions | null {
  const connectionString = environment.REQUEST_DATABASE_URL;
  if (!connectionString) return null;

  const tls = environment.REQUEST_DATABASE_TLS_MODE ?? "verify-full";
  if (tls !== "disable" && tls !== "verify-full") {
    throw new Error("invalid request database TLS mode");
  }
  if (environment.NODE_ENV === "production" && tls === "disable") {
    throw new Error("request database TLS cannot be disabled in production");
  }

  return Object.freeze({
    connectionString,
    tls,
    applicationName: "youone-web-request",
    max: positiveInteger(environment.REQUEST_DATABASE_POOL_MAX, 10, 1, 50),
    connectionTimeoutMillis: positiveInteger(
      environment.REQUEST_DATABASE_CONNECTION_TIMEOUT_MS,
      5_000,
      100,
      60_000
    ),
    idleTimeoutMillis: positiveInteger(
      environment.REQUEST_DATABASE_IDLE_TIMEOUT_MS,
      30_000,
      1_000,
      300_000
    ),
    idleInTransactionTimeoutMillis: positiveInteger(
      environment.REQUEST_DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS,
      15_000,
      1_000,
      120_000
    ),
    queryTimeoutMillis: positiveInteger(
      environment.REQUEST_DATABASE_QUERY_TIMEOUT_MS,
      15_000,
      100,
      120_000
    ),
    statementTimeoutMillis: positiveInteger(
      environment.REQUEST_DATABASE_STATEMENT_TIMEOUT_MS,
      10_000,
      100,
      120_000
    ),
    onIdleClientError: () => writeSecurityLog({
      event: "REQUEST_DATABASE_IDLE_CLIENT_ERROR",
      correlationId: "system:request-database-pool",
      route: "runtime:request-database",
      outcome: "REQUEST_DATABASE_CONNECTION_FAILED",
      status: 503
    })
  });
}

function positiveInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error("invalid request database numeric setting");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error("request database numeric setting is outside the allowed range");
  }
  return value;
}

import { Pool, type PoolClient, type PoolConfig, type QueryResult } from "pg";

import type { SqlConnection, SqlPool, SqlQueryResult } from "./driver";

const LOGIN_PROBE_SQL = `
select
  current_user = session_user as login_is_effective,
  not login_role.rolsuper as login_not_superuser,
  not login_role.rolbypassrls as login_not_bypassrls,
  not login_role.rolinherit as login_not_inherit,
  not login_role.rolcreaterole and not login_role.rolcreatedb and not login_role.rolreplication
    as login_no_admin_capability,
  not exists(select 1 from pg_database database where database.datdba = login_role.oid)
    and not exists(select 1 from pg_namespace namespace where namespace.nspowner = login_role.oid)
    and not exists(select 1 from pg_class relation where relation.relowner = login_role.oid)
    as login_owns_no_database_objects,
  pg_has_role(session_user, 'youone_activation', 'SET') as login_can_set_activation_role,
  not exists(
    select 1 from pg_roles candidate
    where candidate.rolname not in (session_user, 'youone_activation')
      and pg_has_role(session_user, candidate.oid, 'SET')
  ) as login_can_set_only_activation_role
from pg_roles login_role
where login_role.rolname = session_user
`;

const ACTIVATION_PROBE_SQL = `
select
  current_user = 'youone_activation' as activation_role_effective,
  not activation_role.rolcanlogin as activation_role_no_login,
  not activation_role.rolsuper as activation_role_not_superuser,
  not activation_role.rolbypassrls as activation_role_not_bypassrls,
  not activation_role.rolinherit as activation_role_noinherit,
  current_setting('row_security') = 'on' as row_security_on,
  app_private.resolve_activation_context_snapshot(
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000000',
    clock_timestamp()
  ) is null as activation_context_capability_ready,
  app_private.load_effective_device_trust_policy(clock_timestamp()) is null
    as missing_policy_fails_closed
from pg_roles activation_role
where activation_role.rolname = 'youone_activation'
`;

type LoginProbeRow = Readonly<{
  login_can_set_activation_role: boolean;
  login_can_set_only_activation_role: boolean;
  login_is_effective: boolean;
  login_no_admin_capability: boolean;
  login_not_bypassrls: boolean;
  login_not_inherit: boolean;
  login_not_superuser: boolean;
  login_owns_no_database_objects: boolean;
}>;

type ActivationProbeRow = Readonly<{
  activation_context_capability_ready: boolean;
  activation_role_effective: boolean;
  activation_role_no_login: boolean;
  activation_role_noinherit: boolean;
  activation_role_not_bypassrls: boolean;
  activation_role_not_superuser: boolean;
  missing_policy_fails_closed: boolean;
  row_security_on: boolean;
}>;

export type NodePostgresActivationPoolOptions = Readonly<{
  applicationName?: string;
  connectionString: string;
  connectionTimeoutMillis?: number;
  idleInTransactionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
  onIdleClientError?: (event: ActivationDatabaseOperationalEvent) => void;
  queryTimeoutMillis?: number;
  statementTimeoutMillis?: number;
  tls: "disable" | "verify-full";
}>;

export type ActivationDatabaseOperationalEvent = Readonly<{
  event: "ACTIVATION_DATABASE_IDLE_CLIENT_ERROR";
  reasonCode: "ACTIVATION_DATABASE_CONNECTION_FAILED";
}>;

const IDLE_CLIENT_ERROR_EVENT: ActivationDatabaseOperationalEvent = Object.freeze({
  event: "ACTIVATION_DATABASE_IDLE_CLIENT_ERROR",
  reasonCode: "ACTIVATION_DATABASE_CONNECTION_FAILED"
});

export class ActivationDatabaseBoundaryError extends Error {
  public constructor(
    public readonly reasonCode:
      | "ACTIVATION_DATABASE_CONNECTION_FAILED"
      | "ACTIVATION_DATABASE_CAPABILITY_UNAVAILABLE"
      | "ACTIVATION_DATABASE_PRINCIPAL_INVALID",
    options?: ErrorOptions
  ) {
    super(reasonCode, options);
    this.name = "ActivationDatabaseBoundaryError";
  }
}

class ActivationConnection implements SqlConnection {
  public constructor(private readonly client: PoolClient) {}

  public async query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = []
  ): Promise<SqlQueryResult<Row>> {
    const result: QueryResult<Row> = await this.client.query<Row>({ text: sql, values: [...parameters] });
    return Object.freeze({ rows: Object.freeze([...result.rows]), rowCount: result.rowCount ?? 0 });
  }

  public release(destroy = false): void {
    this.client.release(destroy);
  }
}

export class NodePostgresActivationPool implements SqlPool {
  public constructor(
    private readonly pool: Pool,
    onIdleClientError?: NodePostgresActivationPoolOptions["onIdleClientError"]
  ) {
    this.pool.on("error", () => {
      try {
        onIdleClientError?.(IDLE_CLIENT_ERROR_EVENT);
      } catch {
        // Operational telemetry must not turn an idle-client failure into an uncaught exception.
      }
    });
  }

  public async connect(): Promise<SqlConnection> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new ActivationDatabaseBoundaryError("ACTIVATION_DATABASE_CONNECTION_FAILED", { cause: error });
    }

    let began = false;
    try {
      await client.query("begin read only");
      began = true;
      const login = await client.query<LoginProbeRow>(LOGIN_PROBE_SQL);
      await client.query("set local role youone_activation");
      await client.query("set local row_security = on");
      const activation = await client.query<ActivationProbeRow>(ACTIVATION_PROBE_SQL);
      if (!validProbe(login.rows[0]) || !validProbe(activation.rows[0])) {
        throw new ActivationDatabaseBoundaryError("ACTIVATION_DATABASE_PRINCIPAL_INVALID");
      }
      await client.query("rollback");
      began = false;
      return new ActivationConnection(client);
    } catch (error) {
      if (began) {
        try {
          await client.query("rollback");
        } catch {
          // The client is destroyed below.
        }
      }
      client.release(true);
      if (error instanceof ActivationDatabaseBoundaryError) throw error;
      if (postgresErrorCode(error) === "55000") {
        throw new ActivationDatabaseBoundaryError("ACTIVATION_DATABASE_CAPABILITY_UNAVAILABLE", { cause: error });
      }
      throw new ActivationDatabaseBoundaryError("ACTIVATION_DATABASE_PRINCIPAL_INVALID", { cause: error });
    }
  }

  public async probe(): Promise<Readonly<{ ready: true }>> {
    const connection = await this.connect();
    connection.release();
    return Object.freeze({ ready: true });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createNodePostgresActivationPool(
  options: NodePostgresActivationPoolOptions
): NodePostgresActivationPool {
  const config: PoolConfig = {
    application_name: options.applicationName ?? "youone-activation",
    connectionString: hardenedConnectionString(options.connectionString, options.tls),
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    idle_in_transaction_session_timeout: options.idleInTransactionTimeoutMillis ?? 15_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    max: options.max ?? 5,
    query_timeout: options.queryTimeoutMillis ?? 15_000,
    statement_timeout: options.statementTimeoutMillis ?? 10_000,
    ssl: options.tls === "verify-full" ? { rejectUnauthorized: true } : false
  };
  return new NodePostgresActivationPool(new Pool(config), options.onIdleClientError);
}

function validProbe(row: Record<string, boolean> | undefined): boolean {
  return row !== undefined && Object.values(row).every((value) => value === true);
}

function postgresErrorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function hardenedConnectionString(
  connectionString: string,
  tls: NodePostgresActivationPoolOptions["tls"]
): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch (error) {
    throw new ActivationDatabaseBoundaryError("ACTIVATION_DATABASE_CONNECTION_FAILED", { cause: error });
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new ActivationDatabaseBoundaryError("ACTIVATION_DATABASE_CONNECTION_FAILED");
  }
  if (url.hash || [...url.searchParams].some(([name, value]) =>
    name !== "sslmode" || value !== (tls === "verify-full" ? "verify-full" : "disable")
  )) {
    throw new ActivationDatabaseBoundaryError("ACTIVATION_DATABASE_CONNECTION_FAILED");
  }
  url.search = "";
  return url.toString();
}

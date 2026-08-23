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
  pg_has_role(session_user, 'youone_identity_resolver', 'SET') as login_can_set_resolver_role,
  not exists(
    select 1 from pg_roles candidate
    where candidate.rolname not in (session_user, 'youone_identity_resolver')
      and pg_has_role(session_user, candidate.oid, 'SET')
  ) as login_can_set_only_resolver_role
from pg_roles login_role
where login_role.rolname = session_user
`;

const RESOLVER_PROBE_SQL = `
select
  current_user = 'youone_identity_resolver' as resolver_role_effective,
  not resolver_role.rolcanlogin as resolver_role_no_login,
  not resolver_role.rolsuper as resolver_role_not_superuser,
  not resolver_role.rolbypassrls as resolver_role_not_bypassrls,
  current_setting('row_security') = 'on' as row_security_on,
  app_private.resolve_active_actor_context_snapshot(
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000000',
    clock_timestamp()
  ) is null as active_session_capability_ready
from pg_roles resolver_role
where resolver_role.rolname = 'youone_identity_resolver'
`;

type LoginProbeRow = Readonly<{
  login_can_set_only_resolver_role: boolean;
  login_can_set_resolver_role: boolean;
  login_is_effective: boolean;
  login_no_admin_capability: boolean;
  login_not_bypassrls: boolean;
  login_not_inherit: boolean;
  login_not_superuser: boolean;
  login_owns_no_database_objects: boolean;
}>;

type ResolverProbeRow = Readonly<{
  active_session_capability_ready: boolean;
  resolver_role_effective: boolean;
  resolver_role_no_login: boolean;
  resolver_role_not_bypassrls: boolean;
  resolver_role_not_superuser: boolean;
  row_security_on: boolean;
}>;

export type NodePostgresIdentityResolverPoolOptions = Readonly<{
  applicationName?: string;
  connectionString: string;
  connectionTimeoutMillis?: number;
  idleInTransactionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
  onIdleClientError?: (event: IdentityResolverDatabaseOperationalEvent) => void;
  queryTimeoutMillis?: number;
  statementTimeoutMillis?: number;
  tls: "disable" | "verify-full";
}>;

export type IdentityResolverDatabaseOperationalEvent = Readonly<{
  event: "IDENTITY_RESOLVER_IDLE_CLIENT_ERROR";
  reasonCode: "IDENTITY_RESOLVER_CONNECTION_FAILED";
}>;

const IDLE_CLIENT_ERROR_EVENT: IdentityResolverDatabaseOperationalEvent = Object.freeze({
  event: "IDENTITY_RESOLVER_IDLE_CLIENT_ERROR",
  reasonCode: "IDENTITY_RESOLVER_CONNECTION_FAILED"
});

export class IdentityResolverDatabaseBoundaryError extends Error {
  public constructor(
    public readonly reasonCode:
      | "IDENTITY_RESOLVER_CONNECTION_FAILED"
      | "IDENTITY_RESOLVER_CAPABILITY_UNAVAILABLE"
      | "IDENTITY_RESOLVER_PRINCIPAL_INVALID",
    options?: ErrorOptions
  ) {
    super(reasonCode, options);
    this.name = "IdentityResolverDatabaseBoundaryError";
  }
}

class IdentityResolverConnection implements SqlConnection {
  public constructor(private readonly client: PoolClient) {}

  public async query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = []
  ): Promise<SqlQueryResult<Row>> {
    const result: QueryResult<Row> = await this.client.query<Row>({
      text: sql,
      values: [...parameters]
    });
    return { rowCount: result.rowCount ?? 0, rows: result.rows };
  }

  public release(destroy = false): void {
    this.client.release(destroy);
  }
}

export class NodePostgresIdentityResolverPool implements SqlPool {
  public constructor(
    private readonly pool: Pool,
    onIdleClientError?: NodePostgresIdentityResolverPoolOptions["onIdleClientError"]
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
      throw new IdentityResolverDatabaseBoundaryError("IDENTITY_RESOLVER_CONNECTION_FAILED", { cause: error });
    }

    let began = false;
    try {
      await client.query("begin read only");
      began = true;
      const login = await client.query<LoginProbeRow>(LOGIN_PROBE_SQL);
      await client.query("set local role youone_identity_resolver");
      await client.query("set local row_security = on");
      const resolver = await client.query<ResolverProbeRow>(RESOLVER_PROBE_SQL);
      if (!validLogin(login.rows[0]) || !validResolver(resolver.rows[0])) {
        throw new IdentityResolverDatabaseBoundaryError("IDENTITY_RESOLVER_PRINCIPAL_INVALID");
      }
      await client.query("rollback");
      began = false;
      return new IdentityResolverConnection(client);
    } catch (error) {
      if (began) {
        try {
          await client.query("rollback");
        } catch {
          // The client is destroyed below.
        }
      }
      client.release(true);
      if (error instanceof IdentityResolverDatabaseBoundaryError) throw error;
      if (postgresErrorCode(error) === "55000") {
        throw new IdentityResolverDatabaseBoundaryError("IDENTITY_RESOLVER_CAPABILITY_UNAVAILABLE", { cause: error });
      }
      throw new IdentityResolverDatabaseBoundaryError("IDENTITY_RESOLVER_PRINCIPAL_INVALID", { cause: error });
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

function postgresErrorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

export function createNodePostgresIdentityResolverPool(
  options: NodePostgresIdentityResolverPoolOptions
): NodePostgresIdentityResolverPool {
  const config: PoolConfig = {
    application_name: options.applicationName ?? "youone-identity-resolver",
    connectionString: hardenedConnectionString(options.connectionString, options.tls),
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    idle_in_transaction_session_timeout: options.idleInTransactionTimeoutMillis ?? 15_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    max: options.max ?? 5,
    query_timeout: options.queryTimeoutMillis ?? 15_000,
    statement_timeout: options.statementTimeoutMillis ?? 10_000,
    ssl: options.tls === "verify-full" ? { rejectUnauthorized: true } : false
  };
  return new NodePostgresIdentityResolverPool(new Pool(config), options.onIdleClientError);
}

function validLogin(row: LoginProbeRow | undefined): row is LoginProbeRow {
  return row !== undefined && Object.values(row).every((value) => value === true);
}

function validResolver(row: ResolverProbeRow | undefined): row is ResolverProbeRow {
  return row !== undefined && Object.values(row).every((value) => value === true);
}

function hardenedConnectionString(
  connectionString: string,
  tls: NodePostgresIdentityResolverPoolOptions["tls"]
): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch (error) {
    throw new IdentityResolverDatabaseBoundaryError("IDENTITY_RESOLVER_CONNECTION_FAILED", { cause: error });
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new IdentityResolverDatabaseBoundaryError("IDENTITY_RESOLVER_CONNECTION_FAILED");
  }
  if (url.hash || [...url.searchParams].some(([name, value]) =>
    name !== "sslmode" || value !== (tls === "verify-full" ? "verify-full" : "disable")
  )) {
    throw new IdentityResolverDatabaseBoundaryError("IDENTITY_RESOLVER_CONNECTION_FAILED");
  }
  url.search = "";
  return url.toString();
}

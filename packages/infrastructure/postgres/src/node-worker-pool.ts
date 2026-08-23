import { Pool, type PoolClient, type PoolConfig, type QueryResult } from "pg";

import type { SqlConnection, SqlPool, SqlQueryResult } from "./driver.js";

const WORKER_ROLE = "youone_privileged_writer";
const WORKER_BOUNDARY_SQL = `
select
  current_user = 'youone_privileged_writer' as worker_role_active,
  current_setting('row_security') = 'on' as row_security_on,
  worker_role.rolcanlogin = false as worker_role_nologin,
  worker_role.rolsuper = false as worker_role_not_superuser,
  worker_role.rolbypassrls = false as worker_role_no_bypassrls,
  worker_role.rolinherit = false as worker_role_noinherit,
  worker_role.rolcreatedb = false
    and worker_role.rolcreaterole = false
    and worker_role.rolreplication = false as worker_role_no_admin_capability,
  login_role.rolcanlogin = true as login_can_login,
  login_role.rolsuper = false as login_not_superuser,
  login_role.rolbypassrls = false as login_no_bypassrls,
  login_role.rolinherit = false as login_noinherit,
  login_role.rolcreatedb = false
    and login_role.rolcreaterole = false
    and login_role.rolreplication = false as login_no_admin_capability,
  not exists(select 1 from pg_database database where database.datdba = login_role.oid)
    and not exists(select 1 from pg_namespace namespace where namespace.nspowner = login_role.oid)
    and not exists(select 1 from pg_class relation where relation.relowner = login_role.oid)
    as login_owns_no_database_objects,
  pg_has_role(session_user, 'youone_privileged_writer', 'SET') as login_can_set_worker_role,
  not exists(
    select 1
    from pg_roles candidate
    where candidate.rolname not in (session_user, 'youone_privileged_writer')
      and pg_has_role(session_user, candidate.oid, 'SET')
  ) as login_can_set_only_worker_role,
  not exists(
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and has_table_privilege(current_user, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) as worker_has_no_direct_business_table_access,
  to_regprocedure('app_private.claim_outbox(text,integer,integer)') is not null
    and has_function_privilege(current_user, 'app_private.claim_outbox(text,integer,integer)', 'EXECUTE')
    as worker_outbox_capability_ready,
  coalesce(current_setting('app.actor_user_id', true), '') = ''
    and coalesce(current_setting('app.effective_actor_user_id', true), '') = ''
    and coalesce(current_setting('app.correlation_id', true), '') = ''
    and coalesce(current_setting('app.system_actor_id', true), '') = ''
    as worker_context_clean
from pg_roles worker_role
join pg_roles login_role on login_role.rolname = session_user
where worker_role.rolname = 'youone_privileged_writer'
`;

type WorkerBoundaryRow = Readonly<{
  worker_role_active: boolean;
  row_security_on: boolean;
  worker_role_nologin: boolean;
  worker_role_not_superuser: boolean;
  worker_role_no_bypassrls: boolean;
  worker_role_noinherit: boolean;
  worker_role_no_admin_capability: boolean;
  login_can_login: boolean;
  login_not_superuser: boolean;
  login_no_bypassrls: boolean;
  login_noinherit: boolean;
  login_no_admin_capability: boolean;
  login_owns_no_database_objects: boolean;
  login_can_set_worker_role: boolean;
  login_can_set_only_worker_role: boolean;
  worker_has_no_direct_business_table_access: boolean;
  worker_outbox_capability_ready: boolean;
  worker_context_clean: boolean;
}>;

export type WorkerDatabaseProbe = Readonly<{
  principal: typeof WORKER_ROLE;
  ready: true;
  rowSecurity: true;
}>;

export type NodePostgresWorkerPoolOptions = Readonly<{
  applicationName?: string;
  connectionString: string;
  connectionTimeoutMillis?: number;
  idleInTransactionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
  onIdleClientError?: (event: WorkerDatabaseOperationalEvent) => void;
  queryTimeoutMillis?: number;
  statementTimeoutMillis?: number;
  tls: "disable" | "verify-full";
}>;

export type WorkerDatabaseOperationalEvent = Readonly<{
  event: "WORKER_DATABASE_IDLE_CLIENT_ERROR";
  reasonCode: "WORKER_DATABASE_CONNECTION_FAILED";
}>;

const IDLE_CLIENT_ERROR_EVENT: WorkerDatabaseOperationalEvent = Object.freeze({
  event: "WORKER_DATABASE_IDLE_CLIENT_ERROR",
  reasonCode: "WORKER_DATABASE_CONNECTION_FAILED"
});

export class WorkerDatabaseBoundaryError extends Error {
  public constructor(
    public readonly reasonCode:
      | "WORKER_DATABASE_CONNECTION_FAILED"
      | "WORKER_DATABASE_PRINCIPAL_INVALID",
    options?: ErrorOptions
  ) {
    super(reasonCode, options);
    this.name = "WorkerDatabaseBoundaryError";
  }
}

class NodePostgresWorkerConnection implements SqlConnection {
  public constructor(private readonly client: PoolClient) {}

  public async query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = []
  ): Promise<SqlQueryResult<Row>> {
    const result: QueryResult<Row> = await this.client.query<Row>(sql, [...parameters]);
    return Object.freeze({ rows: Object.freeze([...result.rows]), rowCount: result.rowCount ?? result.rows.length });
  }

  public release(destroy = false): void {
    this.client.release(destroy);
  }
}

export class NodePostgresWorkerPool implements SqlPool {
  public constructor(
    private readonly pool: Pool,
    onIdleClientError?: NodePostgresWorkerPoolOptions["onIdleClientError"]
  ) {
    this.pool.on("error", () => {
      try {
        onIdleClientError?.(IDLE_CLIENT_ERROR_EVENT);
      } catch {
        // Telemetry must never convert an idle client failure into an uncaught exception.
      }
    });
  }

  public async connect(): Promise<SqlConnection> {
    return new NodePostgresWorkerConnection(await this.acquireVerifiedClient());
  }

  public async probe(): Promise<WorkerDatabaseProbe> {
    const client = await this.acquireVerifiedClient();
    client.release();
    return Object.freeze({ principal: WORKER_ROLE, ready: true, rowSecurity: true });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  private async acquireVerifiedClient(): Promise<PoolClient> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new WorkerDatabaseBoundaryError("WORKER_DATABASE_CONNECTION_FAILED", { cause: error });
    }
    let began = false;
    try {
      await client.query("begin read only");
      began = true;
      await client.query("set local role youone_privileged_writer");
      await client.query("set local row_security = on");
      const result = await client.query<WorkerBoundaryRow>(WORKER_BOUNDARY_SQL);
      if (result.rowCount !== 1 || !validBoundary(result.rows[0])) {
        throw new WorkerDatabaseBoundaryError("WORKER_DATABASE_PRINCIPAL_INVALID");
      }
      await client.query("rollback");
      began = false;
      return client;
    } catch (error) {
      if (began) {
        try {
          await client.query("rollback");
        } catch {
          // The client is destroyed below.
        }
      }
      client.release(true);
      if (error instanceof WorkerDatabaseBoundaryError) throw error;
      throw new WorkerDatabaseBoundaryError("WORKER_DATABASE_PRINCIPAL_INVALID", { cause: error });
    }
  }
}

export function createNodePostgresWorkerPool(options: NodePostgresWorkerPoolOptions): NodePostgresWorkerPool {
  const config: PoolConfig = {
    application_name: options.applicationName ?? "youone-worker",
    connectionString: hardenedConnectionString(options.connectionString, options.tls),
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    idle_in_transaction_session_timeout: options.idleInTransactionTimeoutMillis ?? 15_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    max: options.max ?? 5,
    query_timeout: options.queryTimeoutMillis ?? 15_000,
    statement_timeout: options.statementTimeoutMillis ?? 10_000,
    ssl: options.tls === "verify-full" ? { rejectUnauthorized: true } : false
  };
  return new NodePostgresWorkerPool(new Pool(config), options.onIdleClientError);
}

function validBoundary(row: WorkerBoundaryRow | undefined): row is WorkerBoundaryRow {
  return row !== undefined && Object.values(row).every((value) => value === true);
}

function hardenedConnectionString(connectionString: string, tls: NodePostgresWorkerPoolOptions["tls"]): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch (error) {
    throw new WorkerDatabaseBoundaryError("WORKER_DATABASE_CONNECTION_FAILED", { cause: error });
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new WorkerDatabaseBoundaryError("WORKER_DATABASE_CONNECTION_FAILED");
  }
  if (url.hash || [...url.searchParams].some(([name, value]) =>
    name !== "sslmode" || value !== (tls === "verify-full" ? "verify-full" : "disable")
  )) {
    throw new WorkerDatabaseBoundaryError("WORKER_DATABASE_CONNECTION_FAILED");
  }
  url.search = "";
  return url.toString();
}

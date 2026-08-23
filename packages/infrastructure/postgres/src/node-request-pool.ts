import { Pool, type PoolClient, type PoolConfig, type QueryResult } from "pg";

import type { SqlConnection, SqlPool, SqlQueryResult } from "./driver";

const REQUEST_ROLE = "youone_request";
const PROBE_TRANSACTION = "begin read only";
const APPLY_REQUEST_ROLE = "set local role youone_request";
const APPLY_ROW_SECURITY = "set local row_security = on";
const VERIFY_REQUEST_BOUNDARY = `
select
  current_user = 'youone_request' as request_role_active,
  current_setting('row_security') = 'on' as row_security_on,
  request_role.rolsuper = false as request_not_superuser,
  request_role.rolbypassrls = false as request_no_bypassrls,
  request_role.rolinherit = false as request_noinherit,
  request_role.rolcanlogin = false as request_nologin,
  request_role.rolcreatedb = false
    and request_role.rolcreaterole = false
    and request_role.rolreplication = false as request_no_admin_capability,
  login_role.rolsuper = false as login_not_superuser,
  login_role.rolbypassrls = false as login_no_bypassrls,
  login_role.rolinherit = false as login_noinherit,
  login_role.rolcanlogin = true as login_can_login,
  login_role.rolcreatedb = false
    and login_role.rolcreaterole = false
    and login_role.rolreplication = false as login_no_admin_capability,
  not exists(select 1 from pg_database database where database.datdba = login_role.oid)
    and not exists(select 1 from pg_namespace namespace where namespace.nspowner = login_role.oid)
    and not exists(select 1 from pg_class relation where relation.relowner = login_role.oid)
    as login_owns_no_database_objects,
  pg_has_role(session_user, 'youone_request', 'SET') as login_can_set_request_role,
  coalesce(current_setting('app.actor_user_id', true), '') = ''
    and coalesce(current_setting('app.effective_actor_user_id', true), '') = ''
    and coalesce(current_setting('app.session_id', true), '') = ''
    and coalesce(current_setting('app.correlation_id', true), '') = ''
    and coalesce(current_setting('app.acting_authority_id', true), '') = ''
    as request_context_clean
from pg_roles request_role
join pg_roles login_role on login_role.rolname = session_user
where request_role.rolname = 'youone_request'
`;

type BoundaryProbeRow = Readonly<{
  request_role_active: boolean;
  row_security_on: boolean;
  request_not_superuser: boolean;
  request_no_bypassrls: boolean;
  request_noinherit: boolean;
  request_nologin: boolean;
  request_no_admin_capability: boolean;
  login_not_superuser: boolean;
  login_no_bypassrls: boolean;
  login_noinherit: boolean;
  login_can_login: boolean;
  login_no_admin_capability: boolean;
  login_owns_no_database_objects: boolean;
  login_can_set_request_role: boolean;
  request_context_clean: boolean;
}>;

export type RequestDatabaseProbe = Readonly<{
  principal: typeof REQUEST_ROLE;
  ready: true;
  rowSecurity: true;
}>;

export type NodePostgresRequestPoolOptions = Readonly<{
  connectionString: string;
  applicationName?: string;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
  queryTimeoutMillis?: number;
  statementTimeoutMillis?: number;
  tls: "disable" | "verify-full";
}>;

export class RequestDatabaseBoundaryError extends Error {
  public readonly reasonCode:
    | "REQUEST_DATABASE_CONNECTION_FAILED"
    | "REQUEST_DATABASE_PRINCIPAL_INVALID";

  public constructor(
    reasonCode: RequestDatabaseBoundaryError["reasonCode"],
    options?: ErrorOptions
  ) {
    super("request database boundary is unavailable", options);
    this.name = "RequestDatabaseBoundaryError";
    this.reasonCode = reasonCode;
  }
}

class NodePostgresConnection implements SqlConnection {
  public constructor(private readonly client: PoolClient) {}

  public async query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = []
  ): Promise<SqlQueryResult<Row>> {
    const result: QueryResult<Row> = await this.client.query<Row>(sql, [...parameters]);
    return Object.freeze({
      rows: Object.freeze([...result.rows]),
      rowCount: result.rowCount ?? result.rows.length
    });
  }

  public release(): void {
    this.client.release();
  }
}

export class NodePostgresRequestPool implements SqlPool {
  public constructor(private readonly pool: Pool) {}

  public async connect(): Promise<SqlConnection> {
    const client = await this.acquireVerifiedClient();
    return new NodePostgresConnection(client);
  }

  public async probe(): Promise<RequestDatabaseProbe> {
    const client = await this.acquireVerifiedClient();
    client.release();
    return Object.freeze({ principal: REQUEST_ROLE, ready: true, rowSecurity: true });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  private async acquireVerifiedClient(): Promise<PoolClient> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new RequestDatabaseBoundaryError("REQUEST_DATABASE_CONNECTION_FAILED", { cause: error });
    }

    let began = false;
    try {
      await client.query(PROBE_TRANSACTION);
      began = true;
      await client.query(APPLY_REQUEST_ROLE);
      await client.query(APPLY_ROW_SECURITY);
      const result = await client.query<BoundaryProbeRow>(VERIFY_REQUEST_BOUNDARY);
      if (result.rowCount !== 1 || !isValidBoundary(result.rows[0])) {
        throw new RequestDatabaseBoundaryError("REQUEST_DATABASE_PRINCIPAL_INVALID");
      }
      await client.query("rollback");
      began = false;
      return client;
    } catch (error) {
      if (began) {
        try {
          await client.query("rollback");
        } catch {
          // The client is destroyed below; the original failure remains the cause.
        }
      }
      client.release(true);
      if (error instanceof RequestDatabaseBoundaryError) throw error;
      throw new RequestDatabaseBoundaryError("REQUEST_DATABASE_PRINCIPAL_INVALID", { cause: error });
    }
  }
}

export function createNodePostgresRequestPool(
  options: NodePostgresRequestPoolOptions
): NodePostgresRequestPool {
  const config: PoolConfig = {
    application_name: options.applicationName ?? "youone-web-request",
    connectionString: options.connectionString,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    max: options.max ?? 10,
    query_timeout: options.queryTimeoutMillis ?? 15_000,
    statement_timeout: options.statementTimeoutMillis ?? 10_000,
    ssl: options.tls === "verify-full" ? { rejectUnauthorized: true } : false
  };
  return new NodePostgresRequestPool(new Pool(config));
}

function isValidBoundary(row: BoundaryProbeRow | undefined): row is BoundaryProbeRow {
  return row !== undefined && Object.values(row).every((value) => value === true);
}

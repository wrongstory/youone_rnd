import type { SqlPool } from "./driver.js";
import { PostgresUnitOfWork } from "./transaction.js";

export type RequestDatabaseBoundary = Readonly<{
  bypassRls: false;
  principal: "youone_request";
}>;

export const REQUEST_DATABASE_BOUNDARY: RequestDatabaseBoundary = Object.freeze({
  bypassRls: false,
  principal: "youone_request"
});

export function createRequestUnitOfWork(pool: SqlPool): PostgresUnitOfWork {
  return new PostgresUnitOfWork(pool);
}

export type { SqlConnection, SqlPool, SqlQueryResult } from "./driver.js";
export { StaleVersionError } from "./driver.js";
export type { PostgresTransactionScope } from "./transaction.js";

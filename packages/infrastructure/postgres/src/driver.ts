export type SqlQueryResult<Row extends object = Record<string, unknown>> = Readonly<{
  rows: readonly Row[];
  rowCount: number;
}>;

export interface SqlConnection {
  query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[]
  ): Promise<SqlQueryResult<Row>>;
  release(destroy?: boolean): void;
}

export interface SqlPool {
  connect(): Promise<SqlConnection>;
}

export class StaleVersionError extends Error {
  public constructor() {
    super("the aggregate was changed by another transaction");
    this.name = "StaleVersionError";
  }
}

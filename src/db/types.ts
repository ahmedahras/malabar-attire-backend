import type { QueryResult, QueryResultRow } from "pg";

export type QueryRunner = {
  query<T extends QueryResultRow = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};


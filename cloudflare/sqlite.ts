import type { SqlDatabase, SqlValue } from "../server/records";
export class DurableSqlDatabase implements SqlDatabase {
  constructor(private sql: SqlStorage) {}
  exec(query: string) {
    this.sql.exec(query);
  }
  prepare(query: string) {
    return {
      get: (...values: SqlValue[]) =>
        this.sql.exec(query, ...values).toArray()[0],
      all: (...values: SqlValue[]) => this.sql.exec(query, ...values).toArray(),
      run: (...values: SqlValue[]) => {
        const cursor = this.sql.exec(query, ...values);
        cursor.toArray();
        return { changes: cursor.rowsWritten };
      },
    };
  }
  close() {
    /* Storage lifecycle belongs to the Durable Object. */
  }
}

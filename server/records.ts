export type SqlValue = string | number | null;
export interface SqlDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: SqlValue[]): unknown;
    all(...values: SqlValue[]): unknown[];
    run(...values: SqlValue[]): { changes: number | bigint };
  };
  close(): void;
}
export class RecordStore {
  constructor(
    readonly db: SqlDatabase,
    private transaction?: <T>(fn: () => T) => T,
  ) {
    db.exec(` CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,owner TEXT NOT NULL,body TEXT NOT NULL, PRIMARY KEY(kind,id));
 CREATE INDEX IF NOT EXISTS records_owner ON records(kind,owner);
 CREATE TABLE IF NOT EXISTS approvals(owner TEXT NOT NULL,account TEXT NOT NULL,plan TEXT NOT NULL,version INTEGER NOT NULL,intent TEXT NOT NULL,PRIMARY KEY(account,plan,version));
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,owner TEXT NOT NULL,mode TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,address TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY,intent TEXT NOT NULL,role TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(intent,role));
 CREATE TABLE IF NOT EXISTS runtime(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT body FROM records WHERE kind=? AND id=?")
      .get(kind, id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  put(kind: string, id: string, owner: string, body: unknown) {
    this.db
      .prepare(
        "INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,owner=excluded.owner",
      )
      .run(kind, id, owner, JSON.stringify(body));
  }
  list<T>(kind: string, owner?: string): T[] {
    const rows = (
      owner
        ? this.db
            .prepare("SELECT body FROM records WHERE kind=? AND owner=?")
            .all(kind, owner)
        : this.db.prepare("SELECT body FROM records WHERE kind=?").all(kind)
    ) as { body: string }[];
    return rows.map((r) => JSON.parse(r.body));
  }
  atomic<T>(fn: () => T): T {
    if (this.transaction) return this.transaction(fn);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  id() {
    return crypto.randomUUID();
  }
  close() {
    this.db.close();
  }
}

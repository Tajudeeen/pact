import type { RecordStore } from "../records";
import type { AccessAuditEvent, AccessAuditWriter } from "./contracts";

/** Persists only the allowlisted, non-identity fields of an access event. */
export class SqlAccessAuditWriter implements AccessAuditWriter {
  constructor(private readonly store: RecordStore) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS pact_access_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        state TEXT NOT NULL,
        at TEXT NOT NULL,
        reason_code TEXT,
        proof_reference TEXT,
        registry_reference TEXT,
        payment_reference TEXT
      );
      CREATE INDEX IF NOT EXISTS pact_access_audit_request
        ON pact_access_audit(request_id, id);
    `);
  }

  async append(event: AccessAuditEvent): Promise<void> {
    this.store.db.prepare(
      `INSERT INTO pact_access_audit
        (request_id, state, at, reason_code, proof_reference, registry_reference, payment_reference)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      event.requestId,
      event.state,
      event.at,
      event.reasonCode ?? null,
      event.proofReference ?? null,
      event.registryReference ?? null,
      event.paymentReference ?? null,
    );
  }

  async list(requestId: string): Promise<AccessAuditEvent[]> {
    const rows = this.store.db.prepare(
      `SELECT request_id, state, at, reason_code, proof_reference, registry_reference, payment_reference
       FROM pact_access_audit
       WHERE request_id = ?
       ORDER BY id ASC`,
    ).all(requestId) as Array<{
      request_id: string;
      state: AccessAuditEvent["state"];
      at: string;
      reason_code: string | null;
      proof_reference: string | null;
      registry_reference: string | null;
      payment_reference: string | null;
    }>;

    return rows.map((row) => ({
      requestId: row.request_id,
      state: row.state,
      at: row.at,
      ...(row.reason_code ? { reasonCode: row.reason_code } : {}),
      ...(row.proof_reference ? { proofReference: row.proof_reference } : {}),
      ...(row.registry_reference ? { registryReference: row.registry_reference } : {}),
      ...(row.payment_reference ? { paymentReference: row.payment_reference } : {}),
    }));
  }
}

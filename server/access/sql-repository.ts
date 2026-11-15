import type { RecordStore } from "../records";
import type {
  AccessChallengeRepository,
  AccessContext,
  AccountOwnershipPolicy,
} from "./contracts";
import type { AccessRequestProvisioner } from "./challenge";
import {
  createAccessRequest,
  transitionAccessRequest,
  type AccessEvent,
  type AccessRequestState,
} from "./state-machine";
import type { AccessRequestRepository } from "./pipeline";

/**
 * SQLite-backed persistence for the initial Node deployment.
 * Mutations use BEGIN IMMEDIATE through RecordStore.atomic so request transitions,
 * challenge consumption, and delivery claims are serialized across connections.
 */
export class SqlAccessRepository
  implements
    AccessRequestRepository,
    AccessRequestProvisioner,
    AccessChallengeRepository
{
  constructor(
    private readonly store: RecordStore,
    private readonly now: () => Date = () => new Date(),
  ) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS pact_access_requests (
        request_id TEXT PRIMARY KEY,
        seller_id TEXT NOT NULL,
        state TEXT NOT NULL,
        state_json TEXT NOT NULL,
        context_json TEXT NOT NULL,
        policy_json TEXT NOT NULL,
        delivery_claimed INTEGER NOT NULL DEFAULT 0,
        delivered_at TEXT
      );
      CREATE INDEX IF NOT EXISTS pact_access_requests_state
        ON pact_access_requests(state);
      CREATE TABLE IF NOT EXISTS pact_access_challenges (
        request_id TEXT PRIMARY KEY,
        challenge TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
      );
    `);
  }

  async create(context: AccessContext, policy: AccountOwnershipPolicy): Promise<void> {
    this.store.atomic(() => {
      const initial = transitionAccessRequest(
        createAccessRequest(context.requestId),
        "challenge",
      );
      this.store.db.prepare(
        `INSERT INTO pact_access_requests
          (request_id, seller_id, state, state_json, context_json, policy_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        context.requestId,
        context.sellerId,
        initial.state,
        JSON.stringify(initial),
        JSON.stringify(context),
        JSON.stringify(policy),
      );
      this.store.db.prepare(
        `INSERT INTO pact_access_challenges
          (request_id, challenge, expires_at, consumed_at)
         VALUES (?, ?, ?, NULL)`,
      ).run(context.requestId, context.challenge, context.expiresAt);
    });
  }

  async get(requestId: string): Promise<AccessRequestState | null> {
    const row = this.store.db.prepare(
      "SELECT state_json FROM pact_access_requests WHERE request_id = ?",
    ).get(requestId) as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) as AccessRequestState : null;
  }

  async context(requestId: string): Promise<AccessContext> {
    const row = this.store.db.prepare(
      "SELECT context_json FROM pact_access_requests WHERE request_id = ?",
    ).get(requestId) as { context_json: string } | undefined;
    if (!row) throw new Error("Access request context not found.");
    return JSON.parse(row.context_json) as AccessContext;
  }

  async policyFor(context: AccessContext): Promise<AccountOwnershipPolicy> {
    const row = this.store.db.prepare(
      "SELECT policy_json FROM pact_access_requests WHERE request_id = ?",
    ).get(context.requestId) as { policy_json: string } | undefined;
    if (!row) throw new Error("Access request policy not found.");
    return JSON.parse(row.policy_json) as AccountOwnershipPolicy;
  }

  async transition(
    requestId: string,
    expected: AccessRequestState["state"],
    event: AccessEvent,
    details?: { reason?: string; paymentReference?: string; deliveredAt?: string },
  ): Promise<AccessRequestState> {
    return this.store.atomic(() => {
      const row = this.store.db.prepare(
        "SELECT state_json FROM pact_access_requests WHERE request_id = ? AND state = ?",
      ).get(requestId, expected) as { state_json: string } | undefined;
      if (!row) throw new Error("Access request state changed or does not exist.");
      const current = JSON.parse(row.state_json) as AccessRequestState;
      const next = transitionAccessRequest(current, event, details);
      const result = this.store.db.prepare(
        "UPDATE pact_access_requests SET state = ?, state_json = ? WHERE request_id = ? AND state = ?",
      ).run(next.state, JSON.stringify(next), requestId, expected);
      if (Number(result.changes) !== 1)
        throw new Error("Access request transition lost its compare-and-set race.");
      return next;
    });
  }

  async consume(requestId: string, challenge: string): Promise<boolean> {
    const now = this.now().toISOString();
    const result = this.store.db.prepare(
      `UPDATE pact_access_challenges
       SET consumed_at = ?
       WHERE request_id = ? AND challenge = ? AND consumed_at IS NULL AND expires_at > ?`,
    ).run(now, requestId, challenge, now);
    return Number(result.changes) === 1;
  }

  async claimDelivery(requestId: string): Promise<boolean> {
    const result = this.store.db.prepare(
      `UPDATE pact_access_requests
       SET delivery_claimed = 1
       WHERE request_id = ? AND state = 'paid'
         AND delivery_claimed = 0 AND delivered_at IS NULL`,
    ).run(requestId);
    return Number(result.changes) === 1;
  }

  async completeDelivery(requestId: string, deliveredAt: string): Promise<void> {
    const result = this.store.db.prepare(
      `UPDATE pact_access_requests
       SET delivered_at = ?
       WHERE request_id = ? AND state = 'delivered'
         AND delivery_claimed = 1 AND delivered_at IS NULL`,
    ).run(deliveredAt, requestId);
    if (Number(result.changes) !== 1)
      throw new Error("Delivery completion did not match a claimed delivered request.");
  }

  async releaseDeliveryClaim(requestId: string): Promise<void> {
    this.store.db.prepare(
      "UPDATE pact_access_requests SET delivery_claimed = 0 WHERE request_id = ? AND delivered_at IS NULL",
    ).run(requestId);
  }
}

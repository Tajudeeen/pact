import Decimal from "decimal.js";
import type { RecordStore } from "../records";
import type { SpendLimitLedger, SpendLimitPolicy } from "./contracts";

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_DOWN });

/**
 * Deterministic spend cap layered on top of the owner/identity proof.
 *
 * The proof answers "is this buyer agent authorized". This answers
 * "is this specific amount still within what the seller allows this buyer
 * to spend, per request and over a rolling window", regardless of whether
 * the proof is valid. The two checks are independent on purpose: a change
 * to one must never silently relax the other.
 *
 * A reservation is written before settlement is attempted, so two
 * concurrent requests from the same buyer cannot both race past the same
 * window cap. A reservation is permanent once recorded; Pact does not
 * refund window capacity on a failed or reconciled settlement, since the
 * cap is a seller-side risk control, not a billing ledger.
 */
export function resolvePolicy(
  policies: Record<string, SpendLimitPolicy>,
  sellerId: string,
): SpendLimitPolicy | undefined {
  return policies[sellerId];
}

export class InMemorySpendLimitLedger implements SpendLimitLedger {
  private readonly reservations = new Map<
    string,
    Array<{ amount: string; at: number }>
  >();

  constructor(private readonly policies: Record<string, SpendLimitPolicy>) {}

  async reserve(input: {
    sellerId: string;
    buyerAgentId: string;
    amount: string;
    asset: string;
    now: Date;
  }) {
    const policy = resolvePolicy(this.policies, input.sellerId);
    // No configured policy means no cap beyond the proof itself. This keeps
    // the check additive: sellers opt in per-seller rather than it being a
    // silent global default that could surprise an existing integration.
    if (!policy) return { allowed: true as const };

    const amount = new D(input.amount);
    if (amount.gt(new D(policy.maxAmountPerRequest)))
      return {
        allowed: false as const,
        reason: "PER_REQUEST_LIMIT_EXCEEDED" as const,
      };

    const key = `${input.sellerId}:${input.buyerAgentId}`;
    const cutoff = input.now.getTime() - policy.windowMs;
    const existing = (this.reservations.get(key) ?? []).filter(
      (r) => r.at > cutoff,
    );

    const spent = existing.reduce((sum, r) => sum.plus(r.amount), new D(0));
    if (spent.plus(amount).gt(new D(policy.maxAmountPerWindow)))
      return {
        allowed: false as const,
        reason: "ROLLING_WINDOW_LIMIT_EXCEEDED" as const,
      };

    existing.push({ amount: input.amount, at: input.now.getTime() });
    this.reservations.set(key, existing);
    return { allowed: true as const };
  }
}

/**
 * SQLite/D1-backed ledger for the Cloudflare Worker deployment, using the
 * same RecordStore.atomic serialization as SqlAccessRepository so a
 * reservation read-then-write cannot race across concurrent requests.
 */
export class SqlSpendLimitLedger implements SpendLimitLedger {
  constructor(
    private readonly store: RecordStore,
    private readonly policies: Record<string, SpendLimitPolicy>,
  ) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS pact_access_spend_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id TEXT NOT NULL,
        buyer_agent_id TEXT NOT NULL,
        amount TEXT NOT NULL,
        reserved_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS pact_access_spend_ledger_window
        ON pact_access_spend_ledger(seller_id, buyer_agent_id, reserved_at);
    `);
  }

  async reserve(input: {
    sellerId: string;
    buyerAgentId: string;
    amount: string;
    asset: string;
    now: Date;
  }) {
    const policy = resolvePolicy(this.policies, input.sellerId);
    if (!policy) return { allowed: true as const };

    const amount = new D(input.amount);
    if (amount.gt(new D(policy.maxAmountPerRequest)))
      return {
        allowed: false as const,
        reason: "PER_REQUEST_LIMIT_EXCEEDED" as const,
      };

    return this.store.atomic(() => {
      const cutoff = input.now.getTime() - policy.windowMs;
      const rows = this.store.db
        .prepare(
          `SELECT amount FROM pact_access_spend_ledger
           WHERE seller_id = ? AND buyer_agent_id = ? AND reserved_at > ?`,
        )
        .all(input.sellerId, input.buyerAgentId, cutoff) as {
        amount: string;
      }[];
      const spent = rows.reduce((sum, r) => sum.plus(r.amount), new D(0));

      if (spent.plus(amount).gt(new D(policy.maxAmountPerWindow)))
        return {
          allowed: false as const,
          reason: "ROLLING_WINDOW_LIMIT_EXCEEDED" as const,
        };

      this.store.db
        .prepare(
          `INSERT INTO pact_access_spend_ledger (seller_id, buyer_agent_id, amount, reserved_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(
          input.sellerId,
          input.buyerAgentId,
          input.amount,
          input.now.getTime(),
        );
      return { allowed: true as const };
    });
  }
}

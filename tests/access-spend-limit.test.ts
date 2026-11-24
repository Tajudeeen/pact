import { afterEach, describe, expect, it } from "vitest";
import { Store } from "../server/store";
import {
  InMemorySpendLimitLedger,
  SqlSpendLimitLedger,
} from "../server/access/spend-limit";
import type {
  SpendLimitLedger,
  SpendLimitPolicy,
} from "../server/access/contracts";

const policy: SpendLimitPolicy = {
  maxAmountPerRequest: "1000000",
  maxAmountPerWindow: "2500000",
  windowMs: 60_000,
};

function sharedBehaviour(makeLedger: () => SpendLimitLedger) {
  it("allows a request within both caps", async () => {
    const ledger = makeLedger();
    const result = await ledger.reserve({
      sellerId: "seller-1",
      buyerAgentId: "agent-1",
      amount: "500000",
      asset: "CCD",
      now: new Date("2026-11-15T12:00:00.000Z"),
    });
    expect(result).toEqual({ allowed: true });
  });

  it("rejects a single request above the per-request cap", async () => {
    const ledger = makeLedger();
    const result = await ledger.reserve({
      sellerId: "seller-1",
      buyerAgentId: "agent-1",
      amount: "1000001",
      asset: "CCD",
      now: new Date("2026-11-15T12:00:00.000Z"),
    });
    expect(result).toEqual({
      allowed: false,
      reason: "PER_REQUEST_LIMIT_EXCEEDED",
    });
  });

  it("rejects once the rolling window total would be exceeded", async () => {
    const ledger = makeLedger();
    const t0 = new Date("2026-11-15T12:00:00.000Z");
    for (const amount of ["900000", "900000"]) {
      const r = await ledger.reserve({
        sellerId: "seller-1",
        buyerAgentId: "agent-1",
        amount,
        asset: "CCD",
        now: t0,
      });
      expect(r).toEqual({ allowed: true });
    }
    // 900000 + 900000 + 900000 = 2700000 > 2500000 window cap
    const third = await ledger.reserve({
      sellerId: "seller-1",
      buyerAgentId: "agent-1",
      amount: "900000",
      asset: "CCD",
      now: t0,
    });
    expect(third).toEqual({
      allowed: false,
      reason: "ROLLING_WINDOW_LIMIT_EXCEEDED",
    });
  });

  it("lets spend age out of the rolling window", async () => {
    const ledger = makeLedger();
    const t0 = new Date("2026-11-15T12:00:00.000Z");
    await ledger.reserve({
      sellerId: "seller-1",
      buyerAgentId: "agent-1",
      amount: "900000",
      asset: "CCD",
      now: t0,
    });
    await ledger.reserve({
      sellerId: "seller-1",
      buyerAgentId: "agent-1",
      amount: "900000",
      asset: "CCD",
      now: t0,
    });
    const afterWindow = new Date(t0.getTime() + policy.windowMs + 1);
    const result = await ledger.reserve({
      sellerId: "seller-1",
      buyerAgentId: "agent-1",
      amount: "900000",
      asset: "CCD",
      now: afterWindow,
    });
    expect(result).toEqual({ allowed: true });
  });

  it("keeps per-buyer caps independent across sellers and buyers", async () => {
    const ledger = makeLedger();
    const t0 = new Date("2026-11-15T12:00:00.000Z");
    await ledger.reserve({
      sellerId: "seller-1",
      buyerAgentId: "agent-1",
      amount: "1000000",
      asset: "CCD",
      now: t0,
    });
    const otherBuyer = await ledger.reserve({
      sellerId: "seller-1",
      buyerAgentId: "agent-2",
      amount: "1000000",
      asset: "CCD",
      now: t0,
    });
    const otherSeller = await ledger.reserve({
      sellerId: "seller-2",
      buyerAgentId: "agent-1",
      amount: "1000000",
      asset: "CCD",
      now: t0,
    });
    expect(otherBuyer).toEqual({ allowed: true });
    expect(otherSeller.allowed).toBe(true);
  });

  it("does not cap a seller with no configured policy", async () => {
    const ledger = makeLedger();
    const result = await ledger.reserve({
      sellerId: "unconfigured-seller",
      buyerAgentId: "agent-1",
      amount: "999999999",
      asset: "CCD",
      now: new Date("2026-11-15T12:00:00.000Z"),
    });
    expect(result).toEqual({ allowed: true });
  });
}

describe("InMemorySpendLimitLedger", () => {
  sharedBehaviour(() => new InMemorySpendLimitLedger({ "seller-1": policy }));
});

describe("SqlSpendLimitLedger", () => {
  let store: Store | undefined;
  afterEach(() => {
    store?.close();
    store = undefined;
  });

  sharedBehaviour(() => {
    store = new Store(":memory:");
    return new SqlSpendLimitLedger(store, { "seller-1": policy });
  });

  it("serializes concurrent reservations through the same atomic window check", async () => {
    store = new Store(":memory:");
    const ledger = new SqlSpendLimitLedger(store, { "seller-1": policy });
    const now = new Date("2026-11-15T12:00:00.000Z");
    const results = await Promise.all([
      ledger.reserve({
        sellerId: "seller-1",
        buyerAgentId: "agent-1",
        amount: "900000",
        asset: "CCD",
        now,
      }),
      ledger.reserve({
        sellerId: "seller-1",
        buyerAgentId: "agent-1",
        amount: "900000",
        asset: "CCD",
        now,
      }),
      ledger.reserve({
        sellerId: "seller-1",
        buyerAgentId: "agent-1",
        amount: "900000",
        asset: "CCD",
        now,
      }),
    ]);
    const allowedCount = results.filter((r) => r.allowed).length;
    // 900000 x 2 = 1800000 fits under 2500000; a third would not (2700000).
    expect(allowedCount).toBe(2);
  });
});

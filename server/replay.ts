import type { Account, MarketSnapshot, Plan } from "../src/core/types";
export function replaySnapshot(
  plan: Plan,
  account: Account,
  now: number,
): MarketSnapshot {
  const btc = plan.market === "BTC-PERP";
  const late = account.scenario === "late";
  return {
    market: plan.market,
    bid: btc ? (late ? "69490" : "67590") : late ? "2600" : "2499",
    ask: btc ? (late ? "69500" : "67600") : late ? "2601" : "2500",
    mark: btc ? "67595" : "2499.5",
    markValid: true,
    tick: btc ? "0.1" : "0.01",
    lot: btc ? "0.00001" : "0.001",
    minQty: btc ? "0.00013" : "0.004",
    maxQty: btc ? "2" : "50",
    depth:
      account.scenario === "thin"
        ? btc
          ? "0.00013"
          : "0.004"
        : btc
          ? "0.5"
          : "10",
    fundingHourly: "0.00001",
    observedAt: account.scenario === "stale" ? now - 15000 : now,
    marginAvailable: account.balance,
    initialMarginRate: "0.05",
    position: "0",
    permitted: true,
  };
}

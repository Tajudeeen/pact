import Decimal from "decimal.js";
import type { Intent, Receipt } from "./types";
export function receiptOf(intent: Intent): Receipt {
  const entries = intent.fills.filter((f) => f.role === "entry"),
    exits = intent.fills.filter((f) => f.role === "close");
  const size = (xs: typeof entries) =>
    xs.reduce((a, f) => a.plus(f.quantity), new Decimal(0));
  const value = (xs: typeof entries) =>
    xs.reduce(
      (a, f) => a.plus(new Decimal(f.quantity).mul(f.price)),
      new Decimal(0),
    );
  const flat =
    size(entries).gt(0) &&
    size(entries).eq(size(exits)) &&
    intent.state === "closed";
  const feesKnown =
    intent.mode === "replay" && intent.fills.every((f) => f.fee !== null);
  const fees = intent.fills.reduce(
    (a, f) => a.plus(f.fee ?? "0"),
    new Decimal(0),
  );
  const gross = flat
    ? value(exits)
        .minus(value(entries))
        .mul(intent.plan.direction === "long" ? 1 : -1)
    : null;
  const incomplete = [
    ...(flat ? [] : ["Position has not been fully closed and reconciled."]),
    ...(intent.mode === "testnet"
      ? [
          "Trading fees have not been independently attributed from fee events.",
          "Actual funding settlements have not been attributed.",
          "Native gas costs are not included in USDso PnL.",
        ]
      : []),
  ];
  return {
    schemaVersion: 2,
    owner: intent.owner,
    plan: intent.plan,
    chainProofs: intent.chainProofs ?? [],
    id: intent.id,
    mode: intent.mode,
    chainId: intent.mode === "testnet" ? 50383 : null,
    state: intent.state,
    planDigest: intent.planDigest,
    planVersion: intent.planVersion,
    account: intent.accountId,
    market: intent.plan.market,
    direction: intent.plan.direction,
    approvedQuantity: intent.decision.quantity,
    approvedLimit: intent.decision.limit,
    executionLimit: intent.execution?.limit ?? null,
    executionPlannedLoss: intent.execution?.plannedLoss ?? null,
    fills: intent.fills,
    grossPnl: gross?.toFixed() ?? null,
    tradingFees: feesKnown ? fees.toFixed() : null,
    fundingPaid: intent.mode === "replay" ? "0" : null,
    netPnl:
      flat && intent.mode === "replay" ? gross!.minus(fees).toFixed() : null,
    incomplete,
    transactions: [intent.txHash, intent.closeHash].filter(
      (h): h is string => !!h,
    ),
    protection: intent.protection,
    note:
      intent.mode === "replay"
        ? "Deterministic simulation. No blockchain transaction or funds."
        : "Testnet execution. Monitored exits require the executor to remain online. Planned risk is an estimate, not a maximum loss.",
  };
}

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
  const settled =
    intent.mode === "testnet" && intent.settlement?.status === "complete"
      ? intent.settlement
      : null;
  const feesKnown =
    settled !== null ||
    (intent.mode === "replay" && intent.fills.every((f) => f.fee !== null));
  const fees = intent.fills.reduce(
    (a, f) => a.plus(f.fee ?? "0"),
    new Decimal(0),
  );
  const gross =
    flat && settled
      ? new Decimal(settled.realizedPnl)
      : flat
        ? value(exits)
            .minus(value(entries))
            .mul(intent.plan.direction === "long" ? 1 : -1)
        : null;
  const incomplete = [
    ...(flat ? [] : ["Position has not been fully closed and reconciled."]),
    ...(intent.mode === "testnet" && !settled
      ? [
          "Trading fees have not been independently attributed from fee events.",
          "Actual funding settlements have not been attributed.",
        ]
      : []),
  ];
  return {
    schemaVersion: 2,
    owner: intent.owner,
    plan: intent.plan,
    chainProofs: intent.chainProofs ?? [],
    settlement: intent.settlement,
    rebates: settled?.rebates ?? (intent.mode === "replay" ? "0" : null),
    netPnlScope: "USDso trading result; STT gas separate",
    nativeGasWei:
      intent.mode === "testnet" && intent.chainProofs?.length
        ? intent.chainProofs
            .reduce((n, p) => n + BigInt(p.gasCostNativeWei), 0n)
            .toString()
        : null,
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
    tradingFees: settled?.fees ?? (feesKnown ? fees.toFixed() : null),
    fundingPaid:
      settled?.fundingPaid ?? (intent.mode === "replay" ? "0" : null),
    netPnl:
      flat && settled
        ? gross!
            .minus(settled.fees)
            .plus(settled.rebates)
            .minus(settled.fundingPaid)
            .toFixed()
        : flat && intent.mode === "replay"
          ? gross!.minus(fees).toFixed()
          : null,
    incomplete,
    transactions: [intent.txHash, intent.closeHash].filter(
      (h): h is string => !!h,
    ),
    protection: intent.protection,
    note:
      intent.mode === "replay"
        ? "Deterministic simulation. No blockchain transaction or funds."
        : "Testnet execution. USDso trading net includes reconciled fees, rebates and funding when accounting is complete. STT gas is separate with no invented fiat conversion. Monitored exits require the executor to remain online. Planned risk is an estimate, not a maximum loss.",
  };
}

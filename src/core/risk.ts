import Decimal from "decimal.js";
import type { Decision, MarketSnapshot, Plan, Policy } from "./types";
const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_DOWN });
export const floorStep = (value: string, step: string) =>
  new D(value).div(step).floor().mul(step).toFixed();
export function evaluate(
  plan: Plan,
  policy: Policy,
  snapshot: MarketSnapshot,
  now: number,
  exposure = { reserved: "0", dailyLoss: "0", busy: false },
): Decision {
  const base: Decision = {
    outcome: "blocked",
    reason: "",
    message: "",
    quantity: "0",
    limit: "0",
    notional: "0",
    plannedLoss: "0",
    stopLoss: "0",
    slippageReserve: "0",
    fundingReserve: "0",
    rewardRisk: "0",
    budget: "0",
    limitedBy: "",
    snapshot,
    evaluatedAt: now,
  };
  const block = (reason: string, message: string) => ({
    ...base,
    reason,
    message,
  });
  if (plan.revoked)
    return block("PLAN_REVOKED", "The author withdrew this setup.");
  if (now >= plan.expiresAt)
    return block("PLAN_EXPIRED", "The entry window has closed.");
  if (snapshot.market !== plan.market)
    return block("MARKET_CHANGED", "This quote belongs to another market.");
  if (now - snapshot.observedAt > 5000 || snapshot.observedAt > now + 1000)
    return block(
      "STALE_DATA",
      "Market or account data is too old. Refresh before deciding.",
    );
  if (
    !snapshot.markValid ||
    !new D(snapshot.mark).isFinite() ||
    new D(snapshot.mark).lte(0)
  )
    return block(
      "INVALID_MARK",
      "A valid mark price is required. Refresh before deciding.",
    );
  if (!snapshot.permitted)
    return block(
      "PROTOCOL_BLOCKED",
      snapshot.reason ?? "This account cannot place this order.",
    );
  if (exposure.busy || !new D(snapshot.position).isZero())
    return block(
      "ACCOUNT_BUSY",
      "This account already has an open or unresolved position.",
    );
  const touch = new D(plan.direction === "long" ? snapshot.ask : snapshot.bid);
  if (touch.lt(plan.entryMin) || touch.gt(plan.entryMax))
    return block(
      "OUTSIDE_ENTRY",
      "Price has left the entry range. This is a different trade now.",
    );
  const budget = D.min(
    policy.risk,
    new D(policy.totalRisk).minus(exposure.reserved),
    new D(policy.dailyLoss).minus(exposure.dailyLoss).minus(exposure.reserved),
  );
  if (budget.lte(0))
    return block("BUDGET_USED", "Your remaining planned-risk budget is used.");
  const slip = new D(policy.slippageBps).div(10000);
  const raw =
    plan.direction === "long"
      ? D.min(touch.mul(new D(1).plus(slip)), plan.entryMax)
      : D.max(touch.mul(new D(1).minus(slip)), plan.entryMin);
  const limit = new D(raw)
    .div(snapshot.tick)
    [plan.direction === "long" ? "floor" : "ceil"]()
    .mul(snapshot.tick);
  if (
    (plan.direction === "long" && limit.lt(touch)) ||
    (plan.direction === "short" && limit.gt(touch))
  )
    return block(
      "NO_TICK",
      "No executable price tick fits the approved range.",
    );
  const distance =
    plan.direction === "long"
      ? limit.minus(plan.stop)
      : new D(plan.stop).minus(limit);
  const reserve = new D(plan.stop).mul(slip);
  const funding = limit
    .mul(new D(snapshot.fundingHourly).abs())
    .mul(policy.fundingHours);
  const unit = distance.plus(reserve).plus(funding);
  if (unit.lte(0) || distance.lte(0))
    return block(
      "INVALID_STOP",
      "The stop must be on the loss side of the entry.",
    );
  const bounds = [
    ["risk", budget.div(unit)],
    ["protocol", new D(snapshot.maxQty)],
    ["liquidity", new D(snapshot.depth)],
    [
      "margin",
      new D(snapshot.marginAvailable).div(
        limit.mul(snapshot.initialMarginRate),
      ),
    ],
    ["notional cap", new D(policy.maxNotional).div(limit)],
  ] as const;
  const [limitedBy, max] = bounds.reduce((a, b) => (b[1].lt(a[1]) ? b : a));
  const quantity = new D(floorStep(D.max(0, max).toFixed(), snapshot.lot));
  if (quantity.lt(snapshot.minQty) || quantity.eq(0))
    return block(
      "BELOW_MINIMUM",
      "Your allowed size is below this market’s minimum.",
    );
  const grossReward =
    plan.direction === "long"
      ? new D(plan.target).minus(limit)
      : limit.minus(plan.target);
  const rr = grossReward.minus(funding).div(unit);
  if (rr.lt(policy.minRewardRisk))
    return block(
      "REWARD_RISK",
      "The remaining reward does not meet your reward-to-risk rule.",
    );
  return {
    ...base,
    outcome: limitedBy === "risk" ? "ready" : "resized",
    reason: limitedBy === "risk" ? "WITHIN_TERMS" : "SIZE_REDUCED",
    message:
      limitedBy === "risk"
        ? "This setup fits your current account and rules."
        : `A smaller size fits your ${limitedBy}.`,
    quantity: quantity.toFixed(),
    limit: limit.toFixed(),
    notional: quantity.mul(limit).toFixed(),
    plannedLoss: quantity.mul(unit).toFixed(),
    stopLoss: quantity.mul(distance).toFixed(),
    slippageReserve: quantity.mul(reserve).toFixed(),
    fundingReserve: quantity.mul(funding).toFixed(),
    rewardRisk: rr.toFixed(2),
    budget: budget.toFixed(),
    limitedBy,
  };
}
export function insideApproval(
  next: Decision,
  approved: Decision,
  direction: Plan["direction"],
) {
  return (
    next.outcome !== "blocked" &&
    new D(next.quantity).lte(approved.quantity) &&
    new D(next.plannedLoss).lte(approved.plannedLoss) &&
    (direction === "long"
      ? new D(next.limit).lte(approved.limit)
      : new D(next.limit).gte(approved.limit))
  );
}

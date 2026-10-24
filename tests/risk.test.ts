import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { evaluate, insideApproval } from "../src/core/risk";
import { DEFAULT_POLICY, type Account } from "../src/core/types";
import { seededPlans } from "../server/plans";
import { replaySnapshot } from "../server/replay";
const now = 1800000000000;
const p = seededPlans(now)[0],
  a: Account = {
    id: "a",
    owner: "u",
    label: "test",
    mode: "replay",
    scenario: "clean",
    balance: "1000",
  };
const s = replaySnapshot(p, a, now);
describe("personal risk admission", () => {
  it.each([
    { mark: "0", markValid: false },
    { mark: "67595", markValid: false },
    { mark: "NaN", markValid: true },
    { mark: "0", markValid: true },
  ])(
    "rejects an invalid mark even if entry permission is true: %j",
    (invalid) => {
      const result = evaluate(
        p,
        DEFAULT_POLICY,
        { ...s, ...invalid, permitted: true },
        now,
      );
      expect(result.reason).toBe("INVALID_MARK");
      expect(result.quantity).toBe("0");
    },
  );
  it("bounds planned loss and quantity grid across risk budgets", () => {
    for (let n = 1; n <= 100; n++) {
      const risk = (n / 10).toFixed(1),
        d = evaluate(p, { ...DEFAULT_POLICY, risk }, s, now);
      if (d.outcome === "blocked") continue;
      expect(new Decimal(d.plannedLoss).lte(risk)).toBe(true);
      expect(new Decimal(d.quantity).mod(s.lot).isZero()).toBe(true);
    }
  });
  it("never increases quantity when risk is reduced", () => {
    let previous = new Decimal(0);
    for (let n = 1; n <= 100; n++) {
      const d = evaluate(
        p,
        { ...DEFAULT_POLICY, risk: String(n / 10) },
        s,
        now,
      );
      const q = new Decimal(d.quantity);
      expect(q.gte(previous)).toBe(true);
      previous = q;
    }
  });
  it.each(["late", "stale"] as const)("rejects %s observations", (scenario) => {
    const d = evaluate(
      p,
      DEFAULT_POLICY,
      replaySnapshot(p, { ...a, scenario }, now),
      now,
    );
    expect(d.outcome).toBe("blocked");
    expect(d.quantity).toBe("0");
  });
  it("rejects future-dated observations", () =>
    expect(
      evaluate(p, DEFAULT_POLICY, { ...s, observedAt: now + 20000 }, now)
        .reason,
    ).toBe("STALE_DATA"));
  it("refuses revoked and expired plans", () => {
    expect(
      evaluate({ ...p, revoked: true }, DEFAULT_POLICY, s, now).reason,
    ).toBe("PLAN_REVOKED");
    expect(
      evaluate({ ...p, expiresAt: now }, DEFAULT_POLICY, s, now).reason,
    ).toBe("PLAN_EXPIRED");
  });
  it("does not confuse protocol restrictions with low balance", () =>
    expect(
      evaluate(
        p,
        DEFAULT_POLICY,
        { ...s, permitted: false, reason: "Voucher blocked." },
        now,
      ).message,
    ).toBe("Voucher blocked."));
  it("reduces thin-liquidity quantity without rounding it up", () => {
    const d = evaluate(p, DEFAULT_POLICY, { ...s, depth: s.minQty }, now);
    expect(d.outcome).toBe("resized");
    expect(d.quantity).toBe(s.minQty);
  });
  it("refuses unknown existing exposure", () => {
    expect(
      evaluate(p, DEFAULT_POLICY, { ...s, position: "0.1" }, now).reason,
    ).toBe("ACCOUNT_BUSY");
    expect(
      evaluate(p, DEFAULT_POLICY, s, now, {
        reserved: "0",
        dailyLoss: "0",
        busy: true,
      }).reason,
    ).toBe("ACCOUNT_BUSY");
  });
  it("counts committed and realized loss against budgets", () =>
    expect(
      evaluate(p, DEFAULT_POLICY, s, now, {
        reserved: "25",
        dailyLoss: "30",
        busy: false,
      }).reason,
    ).toBe("BUDGET_USED"));
  it("keeps shorts bounded by their own price direction", () => {
    const short = {
      ...p,
      direction: "short" as const,
      stop: "69000",
      target: "64000",
    };
    const d = evaluate(short, DEFAULT_POLICY, s, now);
    expect(d.outcome).not.toBe("blocked");
    expect(new Decimal(d.limit).gte(short.entryMin)).toBe(true);
    expect(new Decimal(d.plannedLoss).lte(DEFAULT_POLICY.risk)).toBe(true);
    expect(
      insideApproval(
        { ...d, limit: new Decimal(d.limit).minus(1).toFixed() },
        d,
        "short",
      ),
    ).toBe(false);
  });
  it("does not accept a worse price or more risk under old consent", () => {
    const d = evaluate(p, DEFAULT_POLICY, s, now);
    expect(
      insideApproval(
        { ...d, limit: new Decimal(d.limit).plus(1).toFixed() },
        d,
        "long",
      ),
    ).toBe(false);
    expect(insideApproval({ ...d, plannedLoss: "999" }, d, "long")).toBe(false);
  });
});

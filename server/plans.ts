import { createHash } from "node:crypto";
import type { Plan } from "../src/core/types";
export const digest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, val]) => JSON.stringify(k) + ":" + canonical(val))
      .join(",") +
    "}"
  );
}
export function seededPlans(now: number): Plan[] {
  return [
    {
      id: "btc-pullback",
      version: 1,
      author: "Pact practice",
      title: "BTC, wait for the pullback",
      market: "BTC-PERP",
      direction: "long",
      entryMin: "67400",
      entryMax: "67800",
      stop: "66400",
      target: "71000",
      expiresAt: now + 86400000,
      rationale:
        "A practice setup for learning how entry price and personal risk change the decision. All market values here are simulated.",
      mode: "replay",
      createdAt: now,
      revoked: false,
      digest: "",
    },
    {
      id: "eth-range",
      version: 1,
      author: "Pact practice",
      title: "ETH, the range reclaim",
      market: "ETH-PERP",
      direction: "long",
      entryMin: "2480",
      entryMax: "2520",
      stop: "2430",
      target: "2710",
      expiresAt: now + 86400000,
      rationale:
        "Practice a bounded entry with a clear invalidation level. This is a simulated example, not a market recommendation.",
      mode: "replay",
      createdAt: now,
      revoked: false,
      digest: "",
    },
  ].map((p) => ({ ...p, digest: digest(p) }) as Plan);
}

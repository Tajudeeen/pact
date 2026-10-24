import { z } from "zod";
import Decimal from "decimal.js";
const positive = z
  .string()
  .max(40)
  .regex(/^(?:[1-9]\d*|0)(?:\.\d+)?$/)
  .refine(
    (v) => new Decimal(v).gt(0) && new Decimal(v).lt("1e20"),
    "Enter a positive decimal.",
  );
export const planSchema = z
  .object({
    title: z.string().trim().min(4).max(80),
    market: z.enum(["BTC-PERP", "ETH-PERP"]),
    direction: z.enum(["long", "short"]),
    entryMin: positive,
    entryMax: positive,
    stop: positive,
    target: positive,
    expiresAt: z.number().int(),
    rationale: z.string().trim().max(1000),
    mode: z.enum(["replay", "testnet"]),
  })
  .strict()
  .superRefine((p, c) => {
    if (new Decimal(p.entryMin).gt(p.entryMax))
      c.addIssue({
        code: "custom",
        message: "Entry minimum must not exceed entry maximum.",
        path: ["entryMin"],
      });
    const ok =
      p.direction === "long"
        ? new Decimal(p.stop).lt(p.entryMin) &&
          new Decimal(p.target).gt(p.entryMax)
        : new Decimal(p.stop).gt(p.entryMax) &&
          new Decimal(p.target).lt(p.entryMin);
    if (!ok)
      c.addIssue({
        code: "custom",
        message: "Place stop and target on the correct sides of the entry.",
        path: ["stop"],
      });
  });
export const policySchema = z
  .object({
    risk: positive,
    totalRisk: positive,
    dailyLoss: positive,
    slippageBps: z.number().int().min(1).max(100),
    fundingHours: z.number().int().min(1).max(72),
    minRewardRisk: positive,
    maxNotional: positive,
  })
  .strict();

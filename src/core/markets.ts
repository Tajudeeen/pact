import { z } from "zod";

export const WATCH_MARKETS = ["BTC-PERP", "ETH-PERP"] as const;
export const QUOTE_REFRESH_MS = 10_000;
export const QUOTE_MAX_AGE_MS = 30_000;
const positive = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0);
export const quoteObservationSchema = z.object({
  market: z.enum(WATCH_MARKETS),
  pool: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .nullable(),
  mark: positive.nullable(),
  bid: positive.nullable(),
  ask: positive.nullable(),
  index: positive.nullable(),
  oracleUpdatedAt: z.number().int().nonnegative().nullable(),
  observedAt: z.number().int().nonnegative().nullable(),
  markValid: z.boolean(),
  error: z.string().nullable(),
});
export type QuoteObservation = z.infer<typeof quoteObservationSchema>;
export const marketBoardSchema = z.object({
  source: z.literal("dreamDEX"),
  chainId: z.literal(50383),
  readAt: z.number().int().nonnegative(),
  pollAfterMs: z.number().int().positive(),
  rows: z.array(
    quoteObservationSchema.extend({
      status: z.enum(["live", "stale", "unavailable"]),
    }),
  ),
});
export type MarketBoard = z.infer<typeof marketBoardSchema>;
export function emptyQuote(
  market: QuoteObservation["market"],
  error: string,
): QuoteObservation {
  return {
    market,
    pool: null,
    mark: null,
    bid: null,
    ask: null,
    index: null,
    oracleUpdatedAt: null,
    observedAt: null,
    markValid: false,
    error,
  };
}
export function quoteStatus(
  row: QuoteObservation,
  now: number,
): "live" | "stale" | "unavailable" {
  if (!row.mark || row.observedAt === null) return "unavailable";
  if (
    !row.markValid ||
    row.error ||
    row.observedAt > now + 1000 ||
    now - row.observedAt > QUOTE_MAX_AGE_MS
  )
    return "stale";
  return "live";
}

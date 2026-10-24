import {
  WATCH_MARKETS,
  QUOTE_REFRESH_MS,
  quoteObservationSchema,
  quoteStatus,
  emptyQuote,
  type QuoteObservation,
  type MarketBoard,
} from "../src/core/markets";

export interface QuoteReader {
  quotes(): Promise<QuoteObservation[]>;
  shutdown(): Promise<void>;
}
export async function readQuotes(
  factory: () => QuoteReader,
  timeoutMs = 12000,
): Promise<QuoteObservation[]> {
  const reader = factory();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      reader.quotes(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Market read timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
    await reader.shutdown();
  }
}
/** Coalesces public reads. It never has an account, approval or signing key. */
export class MarketFeed {
  private rows: QuoteObservation[];
  private pending?: Promise<void>;
  private nextRead = 0;
  constructor(
    private readSource: () => Promise<QuoteObservation[]>,
    private now = () => Date.now(),
    saved: QuoteObservation[] = [],
    private save = (_rows: QuoteObservation[]) => {},
  ) {
    this.rows = WATCH_MARKETS.map(
      (m) =>
        saved.find((r) => r.market === m) ??
        emptyQuote(m, "Waiting for the first market read."),
    );
  }
  async read(): Promise<MarketBoard> {
    if (this.now() >= this.nextRead && !this.pending) {
      this.pending = this.refresh().finally(() => {
        this.pending = undefined;
      });
    }
    if (this.pending) await this.pending;
    const now = this.now();
    return {
      source: "dreamDEX",
      chainId: 50383,
      readAt: now,
      pollAfterMs: QUOTE_REFRESH_MS,
      rows: this.rows.map((r) => ({ ...r, status: quoteStatus(r, now) })),
    };
  }
  private async refresh() {
    try {
      const fresh = await this.readSource();
      this.rows = WATCH_MARKETS.map((m) => {
        const previous = this.rows.find((r) => r.market === m)!;
        const parsed = quoteObservationSchema.safeParse(
          fresh.find((r) => r.market === m),
        );
        if (!parsed.success)
          return {
            ...previous,
            markValid: false,
            error: "Market response could not be validated.",
          };
        const row = parsed.data;
        if (quoteStatus(row, this.now()) !== "live")
          return {
            ...previous,
            markValid: false,
            error: row.error ?? "The protocol mark feed is not valid.",
          };
        return row;
      });
    } catch {
      this.rows = this.rows.map((r) => ({
        ...r,
        markValid: false,
        error: "dreamDEX market reads are temporarily unavailable.",
      }));
    }
    this.nextRead = this.now() + QUOTE_REFRESH_MS;
    this.save(this.rows);
  }
}

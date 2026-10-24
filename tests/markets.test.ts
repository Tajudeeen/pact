import { describe, it, expect, vi } from "vitest";
import { MarketFeed, readQuotes } from "../server/market-feed";
import {
  WATCH_MARKETS,
  quoteStatus,
  type QuoteObservation,
} from "../src/core/markets";
import { DreamDex } from "../server/dreamdex";

const start = 1800000000000;
function quotes(now = start): QuoteObservation[] {
  return WATCH_MARKETS.map((market, i) => ({
    market,
    pool: "0x" + "11".repeat(20),
    mark: i ? "2500" : "67000",
    index: i ? "2501" : "67001",
    bid: i ? "2499" : "66999",
    ask: i ? "2501" : "67001",
    observedAt: now,
    oracleUpdatedAt: now - 2000,
    markValid: true,
    error: null,
  }));
}
describe("live market freshness and failure behavior", () => {
  it("coalesces concurrent readers and caches one upstream observation", async () => {
    let release!: (r: QuoteObservation[]) => void;
    const source = vi.fn(
      () =>
        new Promise<QuoteObservation[]>((resolve) => {
          release = resolve;
        }),
    );
    const feed = new MarketFeed(source, () => start);
    const a = feed.read(),
      b = feed.read();
    release(quotes());
    expect((await a).rows[0].status).toBe("live");
    expect((await b).rows[0].mark).toBe("67000");
    await feed.read();
    expect(source).toHaveBeenCalledTimes(1);
  });
  it("retains last valid prices and their original timestamps after a source outage", async () => {
    let now = start;
    const source = vi
      .fn()
      .mockResolvedValueOnce(quotes())
      .mockRejectedValueOnce(new Error("offline"));
    const feed = new MarketFeed(source, () => now);
    await feed.read();
    now += 10001;
    const failed = await feed.read();
    expect(failed.rows[0]).toMatchObject({
      mark: "67000",
      observedAt: start,
      status: "stale",
      markValid: false,
    });
    expect(failed.rows[0].error).toContain("unavailable");
  });
  it("does not display zero, malformed or protocol-invalid marks as live", async () => {
    const bad = quotes();
    bad[0].mark = "0";
    bad[1].markValid = false;
    const feed = new MarketFeed(
      async () => bad,
      () => start,
    );
    const data = await feed.read();
    expect(
      data.rows.every((r) => r.status === "unavailable" && r.mark === null),
    ).toBe(true);
  });
  it("keeps a healthy market live when its neighboring market fails", async () => {
    let now = start;
    const next = quotes(start + 10001);
    next[0].error = "BTC read failed";
    next[0].markValid = false;
    const source = vi
      .fn()
      .mockResolvedValueOnce(quotes())
      .mockResolvedValueOnce(next);
    const feed = new MarketFeed(source, () => now);
    await feed.read();
    now += 10001;
    const data = await feed.read();
    expect(data.rows[0].status).toBe("stale");
    expect(data.rows[1].status).toBe("live");
  });
  it("a persisted old quote and a future-dated quote cannot become live on a new read", async () => {
    const saved = quotes();
    const feed = new MarketFeed(
      async () => {
        throw Error("offline");
      },
      () => start + 60000,
      saved,
    );
    expect((await feed.read()).rows[0].status).toBe("stale");
    expect(quoteStatus({ ...saved[0], observedAt: start + 60000 }, start)).toBe(
      "stale",
    );
  });
  it("closes its read-only transport when the quote read times out", async () => {
    const shutdown = vi.fn(async () => {});
    await expect(
      readQuotes(() => ({ quotes: () => new Promise(() => {}), shutdown }), 5),
    ).rejects.toThrow("timed out");
    expect(shutdown).toHaveBeenCalledOnce();
  });
  it("rejects a different chain before discovering markets", async () => {
    const listPerpMarkets = vi.fn();
    const adapter = Object.assign(
      Object.create(DreamDex.prototype) as DreamDex,
      {
        publicClient: { getChainId: async () => 1 },
        sdk: { client: { listPerpMarkets } },
      },
    );
    await expect(adapter.quotes()).rejects.toThrow("Wrong quote network");
    expect(listPerpMarkets).not.toHaveBeenCalled();
  });
  it("formats on-chain mark and book units and refuses invalid mark sentinels", async () => {
    const adapter = Object.assign(
      Object.create(DreamDex.prototype) as DreamDex,
      {
        publicClient: { getChainId: async () => 50383 },
        sdk: {
          client: {
            listPerpMarkets: async () =>
              WATCH_MARKETS.map((market, i) => ({
                baseSymbol: market.split("-")[0],
                poolAddress: "0x" + String(i + 1).repeat(40),
                quoteDecimals: 2,
              })),
            getPerpState: async (pool: string) => ({
              markPrice: pool.includes("1") ? 6750045n : 0n,
              markPriceOk: pool.includes("1"),
              indexPrice: 6750010n,
              indexUpdatedAt: 1800000000n,
            }),
            getSpotOrderBook: async () => ({
              bids: [{ price: 6749999n }],
              asks: [{ price: 6750050n }],
            }),
          },
        },
      },
    );
    const data = await adapter.quotes();
    expect(data[0]).toMatchObject({
      mark: "67500.45",
      bid: "67499.99",
      ask: "67500.5",
      markValid: true,
      oracleUpdatedAt: 1800000000000,
    });
    expect(data[1]).toMatchObject({ mark: null, markValid: false });
    expect(data[1].error).toContain("invalid mark");
  });
});

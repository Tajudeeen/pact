// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { MarketProvider, MarketWatch } from "../src/components/LiveMarkets";
const now = 1800000000000;
function board() {
  return {
    source: "dreamDEX",
    chainId: 50383,
    readAt: now,
    pollAfterMs: 10000,
    rows: ["BTC-PERP", "ETH-PERP"].map((market, i) => ({
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
      status: "live",
    })),
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("visible live quote integrity", () => {
  it("labels retained prices stale when a later refresh fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(board())))
        .mockRejectedValue(new Error("offline")),
    );
    await act(async () => {
      render(
        <MarketProvider>
          <MarketWatch />
        </MarketProvider>,
      );
    });
    expect(screen.getByText("$67,000")).toBeTruthy();
    expect(screen.getAllByText("LIVE")).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10001);
    });
    expect(screen.getByText("$67,000")).toBeTruthy();
    expect(screen.queryByText("LIVE")).toBeNull();
    expect(screen.getAllByText("STALE")).toHaveLength(2);
  });
  it("rejects prices from a mismatched network instead of displaying them", async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ...board(), chainId: 1 })),
        ),
    );
    await act(async () => {
      render(
        <MarketProvider>
          <MarketWatch />
        </MarketProvider>,
      );
    });
    expect(screen.queryByText("$67,000")).toBeNull();
    expect(screen.getAllByText("UNAVAILABLE")).toHaveLength(2);
  });
});

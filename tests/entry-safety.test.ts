import { it, expect, vi } from "vitest";
import { DreamDex } from "../server/dreamdex";
import { setup, cleanupExecution } from "./helpers/execution";
import { afterEach } from "vitest";
afterEach(cleanupExecution);
function adapter() {
  const x = setup();
  const projection = {
    priceable: true,
    asOfBlock: 10n,
    currentSize: 0n,
    projectedSize: 100n,
    projectedEquity: 100000n,
    projectedLiquidationPrice: 0n as bigint | null,
  };
  const preview = vi.fn(async () => projection);
  const venue = Object.assign(Object.create(DreamDex.prototype) as DreamDex, {
    publicClient: {
      getChainId: async () => 50383,
      readContract: async () => true,
    },
    key: { address: "0x2222222222222222222222222222222222222222" },
    market: async () => ({
      poolAddress: "0x3333333333333333333333333333333333333333",
      marginBank: "0x1111111111111111111111111111111111111111",
      baseDecimals: 2,
      quoteDecimals: 2,
      initialMarginBps: 500,
      tickSize: "1",
      lotSize: "1",
      minQuantity: "1",
    }),
    sdk: {
      client: {
        previewPerpLiquidationPrice: preview,
        getPerpState: async () => ({
          markPrice: 10000n,
          markPriceOk: true,
          fundingRate: 0n,
          fundingWindowSec: 28800,
        }),
        getMarginAccount: async () => ({
          withdrawable: 1000000n,
          activePerpPools: [],
          marginStatus: "Healthy",
        }),
        getPerpPosition: async () => ({ size: 0n }),
        getSpotOrderBook: async () => ({
          asks: [{ price: 10000n, quantity: 100n }],
          bids: [{ price: 9990n, quantity: 100n }],
        }),
        getOpenOrdersOnchain: async () => ({ orders: [] }),
        getPerpHealthSnapshot: async () => ({
          priceable: true,
          effectiveImfBps: 2500n,
        }),
        getPerpRiskParams: async () => ({ takerFeeBpsTimes1k: 1500n }),
        getMaxPerpOrderSize: async () => ({
          priceable: true,
          placeable: true,
          maxQuantity: 1000n,
        }),
      },
    },
  });
  return { x, venue, projection, preview };
}
it("uses current dynamic margin and converts the protocol fee unit exactly", async () => {
  const { x, venue } = adapter();
  const s = await venue.snapshot(x.plan, x.account);
  expect(s.initialMarginRate).toBe("0.25");
  expect(s.takerFeeRate).toBe("0.00015");
});
it.each([
  {
    direction: "long" as const,
    stop: "90",
    liquidation: 0n,
    size: 100n,
    allowed: true,
  },
  {
    direction: "long" as const,
    stop: "90",
    liquidation: 8950n,
    size: 100n,
    allowed: false,
  },
  {
    direction: "short" as const,
    stop: "110",
    liquidation: 11200n,
    size: -100n,
    allowed: true,
  },
  {
    direction: "short" as const,
    stop: "110",
    liquidation: 11050n,
    size: -100n,
    allowed: false,
  },
])(
  "checks liquidation on the correct side of the stop: $direction / $allowed",
  async (p) => {
    const { x, venue, projection } = adapter();
    const decision = {
      ...(await x.service.preview("owner", x.plan.id, x.account.id)).decision,
      quantity: "1",
      limit: "100",
    };
    projection.projectedLiquidationPrice = p.liquidation;
    projection.projectedSize = p.size;
    const result = await venue.entrySafety(
      { ...x.plan, direction: p.direction, stop: p.stop },
      x.account,
      decision,
    );
    expect(result.allowed).toBe(p.allowed);
    expect(result.asOfBlock).toBe("10");
  },
);
it("refuses a projection that reveals outside exposure", async () => {
  const { x, venue, projection } = adapter();
  const decision = {
    ...(await x.service.preview("owner", x.plan.id, x.account.id)).decision,
    quantity: "1",
    limit: "100",
  };
  projection.currentSize = 1n;
  expect((await venue.entrySafety(x.plan, x.account, decision)).allowed).toBe(
    false,
  );
});

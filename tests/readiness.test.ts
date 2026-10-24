import { describe, it, expect, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { DreamDex } from "../server/dreamdex";
import { Store } from "../server/store";
import { PactService } from "../server/service";
import { createApp } from "../server/app";
import type { Venue } from "../server/venue";

const owner = "0x1111111111111111111111111111111111111111";
const pool = "0x3333333333333333333333333333333333333333";
function adapter() {
  const reads = {
    getChainId: vi.fn(async () => 50383),
    getBalance: vi.fn(async () => 100000000n),
    getGasPrice: vi.fn(async () => 2n),
    readContract: vi.fn(async () => true),
  };
  const sdk = {
    getPerpState: vi.fn(async () => ({
      markPriceOk: true,
      markPrice: 100000n,
    })),
    getMarginAccount: vi.fn(async () => ({
      marginStatus: "Healthy",
      withdrawable: 25000000n,
      activePerpPools: [] as string[],
    })),
    getPerpPosition: vi.fn(async () => ({ size: 0n })),
    getOpenOrdersOnchain: vi.fn(async () => ({ orders: [] as unknown[] })),
    getSpotOrderBook: vi.fn(async () => ({
      asks: [{ price: 100001n }],
      bids: [{ price: 99999n }],
    })),
  };
  const market = vi.fn(async () => ({
    poolAddress: pool,
    marginBank: owner,
    quoteDecimals: 6,
  }));
  const venue = Object.assign(Object.create(DreamDex.prototype) as DreamDex, {
    key: { address: "0x2222222222222222222222222222222222222222" },
    publicClient: reads,
    sdk: { client: sdk },
    market,
  });
  return { venue, reads, sdk, market };
}
describe("read-only trading access checks", () => {
  it("reports actual setup blockers without signing or placing orders", async () => {
    const x = adapter();
    x.reads.readContract.mockResolvedValue(false);
    x.reads.getBalance.mockResolvedValue(0n);
    x.sdk.getMarginAccount.mockResolvedValue({
      marginStatus: "Healthy",
      withdrawable: 0n,
      activePerpPools: [pool],
    });
    x.sdk.getPerpPosition.mockResolvedValue({ size: 1n });
    const report = await x.venue.readiness(owner, "BTC-PERP");
    expect(report.ready).toBe(false);
    expect(report.readOnly).toBe(true);
    expect(
      report.checks.filter((c) => c.status === "blocked").map((c) => c.id),
    ).toEqual([
      "permission-0",
      "permission-1",
      "permission-2",
      "gas",
      "margin",
      "position",
    ]);
    expect(x.reads.readContract).toHaveBeenCalledTimes(3);
  });
  it("passes a funded, flat, permitted account and bounds the report lifetime", async () => {
    const x = adapter();
    const report = await x.venue.readiness(owner, "ETH-PERP");
    expect(report.ready).toBe(true);
    expect(report.checks).toHaveLength(10);
    expect(report.validForMs).toBeGreaterThan(0);
    expect(report.validForMs).toBeLessThanOrEqual(30000);
    expect(report.pool).toBe(pool);
  });
  it("refuses wrong-chain reads before market discovery", async () => {
    const x = adapter();
    x.reads.getChainId.mockResolvedValue(1);
    await expect(x.venue.readiness(owner, "BTC-PERP")).rejects.toThrow(
      "Tokyo testnet",
    );
    expect(x.market).not.toHaveBeenCalled();
    expect(x.sdk.getMarginAccount).not.toHaveBeenCalled();
  });
  it("does not return a ready report when a required RPC read fails", async () => {
    const x = adapter();
    x.reads.getBalance.mockRejectedValue(new Error("RPC unavailable"));
    await expect(x.venue.readiness(owner, "BTC-PERP")).rejects.toThrow(
      "RPC unavailable",
    );
  });
  it("requires wallet authentication and checks only the signed-in owner", async () => {
    const db = new Store();
    try {
      const x = adapter();
      const readiness = vi.fn(x.venue.readiness.bind(x.venue));
      const venue = { readiness } as unknown as Venue;
      const origin = "http://pact.test";
      const app = createApp(new PactService(db, venue, true), origin);
      expect((await app.request("/api/readiness?market=BTC-PERP")).status).toBe(
        401,
      );
      const practice = await app.request("/api/auth/practice", {
        method: "POST",
        headers: { origin },
      });
      expect(
        (
          await app.request("/api/readiness?market=BTC-PERP", {
            headers: {
              cookie: practice.headers.get("set-cookie")!.split(";")[0],
            },
          })
        ).status,
      ).toBe(403);
      expect(readiness).not.toHaveBeenCalled();
      const signer = privateKeyToAccount(
        ("0x" + "11".repeat(32)) as `0x${string}`,
      );
      const headers = { origin, "Content-Type": "application/json" };
      const challenge = await (
        await app.request("/api/auth/challenge", {
          method: "POST",
          headers,
          body: JSON.stringify({ address: signer.address }),
        })
      ).json();
      const login = await app.request("/api/auth/verify", {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: challenge.id,
          signature: await signer.signMessage({ message: challenge.message }),
        }),
      });
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      expect(
        (
          await (
            await app.request("/api/entry-control", { headers: { cookie } })
          ).json()
        ).paused,
      ).toBe(false);
      expect(
        (
          await app.request("/api/entry-control", {
            method: "PUT",
            headers: { cookie, "Content-Type": "application/json" },
            body: JSON.stringify({ paused: true }),
          })
        ).status,
      ).toBe(403);
      const paused = await app.request("/api/entry-control", {
        method: "PUT",
        headers: { ...headers, cookie },
        body: JSON.stringify({ paused: true }),
      });
      expect(paused.status).toBe(200);
      expect((await paused.json()).paused).toBe(true);
      expect(
        (
          await (
            await app.request("/api/entry-control", { headers: { cookie } })
          ).json()
        ).paused,
      ).toBe(true);
      const response = await app.request(
        "/api/readiness?market=BTC-PERP&owner=" + owner,
        { headers: { cookie } },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(readiness).toHaveBeenCalledWith(
        signer.address.toLowerCase(),
        "BTC-PERP",
      );
      expect((await response.json()).readOnly).toBe(true);
      expect(
        (
          await app.request("/api/readiness?market=INVALID", {
            headers: { cookie },
          })
        ).status,
      ).toBe(400);
      expect(readiness).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
    }
  });
});

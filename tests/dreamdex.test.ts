import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, parseAbi, parseUnits } from "viem";
import {
  DreamDex,
  TOKYO_BANK,
  TOKYO_COLLATERAL,
  TOKYO_FACTORY,
} from "../server/dreamdex";
import { seededPlans } from "../server/plans";
import { replaySnapshot } from "../server/replay";
import { evaluate } from "../src/core/risk";
import { DEFAULT_POLICY, type Account, type Intent } from "../src/core/types";

const now = 1800000000000;
const owner = "0x1111111111111111111111111111111111111111";
function intent(): Intent {
  const plan = { ...seededPlans(now)[0], mode: "testnet" as const };
  const account: Account = {
    id: owner,
    owner,
    mode: "testnet",
    scenario: "clean",
    balance: "1000",
    label: "Test",
  };
  const snapshot = replaySnapshot(plan, account, now);
  const policy = { ...DEFAULT_POLICY, maxNotional: "25" };
  return {
    id: "test",
    owner,
    accountId: owner,
    planId: plan.id,
    planVersion: plan.version,
    planDigest: plan.digest,
    mode: "testnet",
    state: "reserved",
    decision: evaluate(plan, policy, snapshot, now),
    execution: evaluate(
      plan,
      policy,
      { ...snapshot, ask: "67590", bid: "67580", fundingHourly: "0.00002" },
      now,
    ),
    plan,
    policy,
    createdAt: now,
    updatedAt: now,
    protection: "not_armed",
    fills: [],
    events: [],
  };
}
function adapter() {
  const simulateContract = vi.fn(async () => ({ result: [true, 1n] }));
  const prepareTransactionRequest = vi.fn(async (request: object) => ({
    ...request,
    maxFeePerGas: 2n,
  }));
  const signTransaction = vi.fn(async () => "0x01");
  const getBalance = vi.fn(async () => 1000000000000000000n);
  const venue = Object.assign(Object.create(DreamDex.prototype) as DreamDex, {
    key: { address: "0x2222222222222222222222222222222222222222" },
    publicClient: {
      getChainId: vi.fn(async () => 50383),
      simulateContract,
      getTransactionCount: vi.fn(async () => 4),
      getBalance,
    },
    wallet: {
      prepareTransactionRequest,
      signTransaction,
    },
    market: vi.fn(async () => ({
      poolAddress: "0x3333333333333333333333333333333333333333",
      marginBank: owner,
      baseDecimals: 5,
      quoteDecimals: 1,
      tickSize: "1",
    })),
  });
  return {
    venue,
    simulateContract,
    prepareTransactionRequest,
    signTransaction,
    getBalance,
  };
}
describe("real dreamDEX adapter payload with mocked transports", () => {
  it("refuses a non-reverting failed FOK simulation before nonce preparation or signing", async () => {
    const x = adapter();
    x.simulateContract.mockResolvedValue({ result: [false, 0n] });
    await expect(x.venue.prepare(intent(), "entry")).rejects.toThrow(
      "simulation refused",
    );
    expect(x.prepareTransactionRequest).not.toHaveBeenCalled();
    expect(x.signTransaction).not.toHaveBeenCalled();
  });
  it("refuses to sign when the operator cannot cover the prepared gas ceiling", async () => {
    const x = adapter();
    x.getBalance.mockResolvedValue(19999999n);
    await expect(x.venue.prepare(intent(), "entry")).rejects.toThrow(
      "STT balance",
    );
    expect(x.signTransaction).not.toHaveBeenCalled();
  });
  it("simulates and signs the fresh approved execution price in the actual calldata", async () => {
    const x = adapter(),
      i = intent();
    const prepared = await x.venue.prepare(i, "entry");
    const request = x.prepareTransactionRequest.mock.calls[0][0] as {
      data: `0x${string}`;
    };
    const decoded = decodeFunctionData({
      abi: parseAbi([
        "function placeOrderFor(address owner,bool isBid,uint64 userData,uint256 price,uint256 quantity,uint64 expireTimestampNs,uint8 orderType,uint8 selfMatchingOption,address builder,uint96 builderFeeBpsTimes1k) payable returns (bool success,uint128 orderId)",
      ]),
      data: request.data,
    });
    expect(decoded.args[3]).toBe(BigInt(Number(i.execution!.limit) * 10));
    expect(decoded.args[3]).not.toBe(BigInt(Number(i.decision.limit) * 10));
    expect(decoded.args[4]).toBe(BigInt(Number(i.decision.quantity) * 100000));
    expect(decoded.args[6]).toBe(1); // Fill or kill.
    expect(
      (x.simulateContract.mock.calls[0] as unknown as [{ args: unknown[] }])[0]
        .args,
    ).toEqual(decoded.args);
    expect(prepared.nonce).toBe(4);
  });
  it("gets monitoring validity directly from perp state without entry or margin admission", async () => {
    const x = adapter();
    Object.assign(x.venue, {
      sdk: {
        client: {
          getPerpState: vi.fn(async () => ({
            markPrice: 0n,
            markPriceOk: false,
          })),
          getPerpPosition: vi.fn(async () => ({ size: 36n })),
        },
      },
    });
    const result = await x.venue.position(intent().plan, {
      id: owner,
      owner,
      mode: "testnet",
      scenario: "clean",
      balance: "0",
      label: "test",
    });
    expect(result.markValid).toBe(false);
    expect(result.position).toBe("0.00036");
    expect(result.mark).toBe("0");
  });
});

describe("bounded close preparation", () => {
  function closeAdapter(short = false) {
    const x = adapter(),
      i = intent();
    i.plan.direction = short ? "short" : "long";
    const qty = parseUnits((i.execution ?? i.decision).quantity, 5);
    Object.assign(x.venue, {
      market: vi.fn(async () => ({
        poolAddress: "0x3333333333333333333333333333333333333333",
        baseDecimals: 5,
        quoteDecimals: 1,
        tickSize: "10",
        marginBank: owner,
      })),
      sdk: {
        client: {
          getPerpPosition: vi.fn(async () => ({ size: short ? -qty : qty })),
          getSpotOrderBook: vi.fn(async () => ({
            asks: [{ price: 10011n, quantity: qty }],
            bids: [{ price: 10009n, quantity: qty }],
          })),
        },
      },
    });
    return { ...x, i, qty };
  }
  it.each([false, true])(
    "rounds the close tick inside the slippage bound, short=%s",
    async (short) => {
      const x = closeAdapter(short);
      await x.venue.prepare(x.i, "close");
      const request = x.prepareTransactionRequest.mock.calls[0][0] as {
        data: `0x${string}`;
      };
      const { orderAbi } = await import("../server/chain-proof");
      const { args } = decodeFunctionData({
        abi: orderAbi,
        data: request.data,
      });
      const slip = BigInt(x.i.policy.slippageBps),
        raw = short
          ? (10011n * (10000n + slip)) / 10000n
          : (10009n * (10000n - slip)) / 10000n;
      expect(args[3]).toBe(
        short ? (raw / 10n) * 10n : ((raw + 9n) / 10n) * 10n,
      );
      expect(args[1]).toBe(short);
    },
  );
  it("does not sign when depth inside the close limit cannot fill the entire position", async () => {
    const x = closeAdapter();
    x.venue.sdk.client.getSpotOrderBook = vi.fn(async () => ({
      asks: [{ price: 10011n, quantity: 0n }],
      bids: [{ price: 10009n, quantity: x.qty - 1n }],
    })) as never;
    await expect(x.venue.prepare(x.i, "close")).rejects.toThrow(
      "Insufficient close depth",
    );
    expect(x.signTransaction).not.toHaveBeenCalled();
  });
});

describe("published Tokyo market identity", () => {
  function identity() {
    const m = {
      baseSymbol: "BTC",
      poolAddress: "0x3333333333333333333333333333333333333333",
      marginBank: TOKYO_BANK,
      quoteToken: TOKYO_COLLATERAL,
    };
    const config = {
      fullyWired: true,
      collateralToken: TOKYO_COLLATERAL,
      perpPoolFactory: TOKYO_FACTORY,
      liquidationEngine: "0xA66d3C24Ad4a389d863846905D8173e1017e9F4D",
      insuranceFund: "0x50826894D47C6D4f3BeA38BFDC7Dc5c5be171b80",
    };
    const registered = vi.fn(async () => true),
      code = vi.fn(async () => "0x6000");
    const venue = Object.assign(Object.create(DreamDex.prototype) as DreamDex, {
      sdk: {
        client: {
          listPerpMarkets: async () => [m],
          getPerpSystemConfig: async () => config,
          isPerpPoolRegistered: registered,
        },
      },
      publicClient: { getBytecode: code },
    });
    return { venue, m, config, registered, code };
  }
  it("accepts a discovered registered pool using the published system", async () => {
    const x = identity();
    expect((await x.venue.market("BTC-PERP")).poolAddress).toBe(
      x.m.poolAddress,
    );
  });
  it.each([
    "bank",
    "collateral",
    "factory",
    "engine",
    "unregistered",
    "no-code",
  ])("rejects %s mismatch", async (kind) => {
    const x = identity();
    if (kind === "bank") x.m.marginBank = owner as typeof TOKYO_BANK;
    if (kind === "collateral")
      x.m.quoteToken = owner as typeof TOKYO_COLLATERAL;
    if (kind === "factory")
      x.config.perpPoolFactory = owner as typeof TOKYO_FACTORY;
    if (kind === "engine") x.config.liquidationEngine = owner;
    if (kind === "unregistered") x.registered.mockResolvedValue(false);
    if (kind === "no-code") x.code.mockResolvedValue("0x");
    await expect(x.venue.market("BTC-PERP")).rejects.toThrow(
      /published|wiring/,
    );
  });
});

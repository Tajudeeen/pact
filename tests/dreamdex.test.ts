import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
import { DreamDex } from "../server/dreamdex";
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

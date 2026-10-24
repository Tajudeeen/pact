import { vi } from "vitest";
import { marginBankEventsAbi } from "@somnia-chain/markets-sdk";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type Log,
} from "viem";
import {
  scanSettlement,
  type SettlementContext,
  type SettlementReader,
} from "../../server/settlement";
import { chainFixture, owner, pool, operator } from "./chain";
import type { ChainProof } from "../../src/core/types";
export const bank = ("0x" + "55".repeat(20)) as Address;
export const bh = (n: number) =>
  ("0x" + n.toString(16).padStart(64, "0")) as Hex;
export function bankLog(
  kind: "PositionUpdated" | "FeeCharged" | "RebatePaid" | "FundingSettled",
  block: number,
  hash: Hex,
  index: number,
  amount: bigint,
  size = 0n,
): Log {
  const ts = encodeEventTopics({
    abi: marginBankEventsAbi,
    eventName: kind,
    args: { account: owner, perpPool: pool },
  }).filter((t): t is Hex => typeof t === "string");
  const data =
    kind === "PositionUpdated"
      ? encodeAbiParameters(
          [
            { type: "int128" },
            { type: "uint128" },
            { type: "int256" },
            { type: "int256" },
          ],
          [size, 10000n, amount, 0n],
        )
      : kind === "FeeCharged"
        ? encodeAbiParameters(
            [{ type: "uint256" }, { type: "uint256" }],
            [amount, 0n],
          )
        : kind === "FundingSettled"
          ? encodeAbiParameters([{ type: "int256" }], [amount])
          : encodeAbiParameters([{ type: "uint256" }], [amount]);
  return {
    address: bank,
    blockNumber: BigInt(block),
    blockHash: bh(block),
    transactionHash: hash,
    transactionIndex: 0,
    logIndex: index,
    removed: false,
    topics: [ts[0], ...ts.slice(1)] as [Hex, ...Hex[]],
    data,
  };
}
export function settlementFixture() {
  const x = chainFixture();
  const [entry, close] = x.expectations;
  const proof = (n: number, e: typeof entry): ChainProof => ({
    ...e,
    owner,
    chainId: 50383,
    blockNumber: String(n),
    blockHash: bh(n),
    confirmations: 2,
    gasUsed: "100",
    effectiveGasPrice: "2",
    gasCostNativeWei: "200",
    observedAt: 1800000000000,
  });
  let logs = [
    bankLog("PositionUpdated", 10, entry.hash, 0, 0n, 100n),
    bankLog("FeeCharged", 10, entry.hash, 1, 60n),
    bankLog("FundingSettled", 11, bh(99), 0, 50n),
    bankLog("FeeCharged", 12, close.hash, 0, 40n),
    bankLog("RebatePaid", 12, close.hash, 1, 20n),
    bankLog("PositionUpdated", 12, close.hash, 2, 300n, 0n),
  ];
  const getLogs = vi.fn(
    async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) =>
      logs.filter(
        (l) => l.blockNumber! >= fromBlock && l.blockNumber! <= toBlock,
      ),
  );
  const reader: SettlementReader = {
    getChainId: async () => 50383,
    getTransactionReceipt: async ({ hash }) => ({
      ...x.receipt(x.expectations.find((e) => e.hash === hash)!),
      blockNumber: hash === entry.hash ? 10n : 12n,
      blockHash: bh(hash === entry.hash ? 10 : 12),
    }),
    getBlock: async ({ blockNumber }) => ({ hash: bh(Number(blockNumber)) }),
    getLogs,
  };
  const ctx: SettlementContext = {
    owner,
    pool,
    marginBank: bank,
    quoteDecimals: 2,
    entry: proof(10, entry),
    close: proof(12, close),
    expectedPosition: 100n,
  };
  return {
    reader,
    ctx,
    getLogs,
    setLogs: (next: Log[]) => {
      logs = next;
    },
    get logs() {
      return logs;
    },
  };
}

import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  zeroAddress,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { orderBookEventsAbi } from "@somnia-chain/markets-sdk";
import {
  orderAbi,
  type ProofReader,
  type ExpectedOrder,
} from "../../server/chain-proof";
import { digest } from "../../server/plans";
import type { Plan } from "../../src/core/types";
export const owner = ("0x" + "11".repeat(20)) as Address;
export const operator = ("0x" + "22".repeat(20)) as Address;
export const pool = ("0x" + "33".repeat(20)) as Address;
export function chainFixture() {
  const terms = {
    title: "BTC test execution",
    market: "BTC-PERP",
    direction: "long" as const,
    entryMin: "99",
    entryMax: "101",
    stop: "90",
    target: "120",
    expiresAt: 1800003600000,
    rationale: "Test fixture",
    mode: "testnet" as const,
    author: owner,
    version: 1,
  };
  const plan: Plan = {
    ...terms,
    id: "test",
    createdAt: 1800000000000,
    revoked: false,
    digest: digest(terms),
  };
  const expected = (role: "entry" | "close"): ExpectedOrder => ({
    hash: ("0x" + (role === "entry" ? "aa" : "bb").repeat(32)) as Hex,
    pool,
    operator,
    nonce: role === "entry" ? 4 : 5,
    role,
    input: encodeFunctionData({
      abi: orderAbi,
      functionName: "placeOrderFor",
      args: [
        owner,
        role === "entry",
        BigInt("0x" + plan.digest.slice(0, 16)),
        10000n,
        100n,
        1800003000000000000n,
        1,
        0,
        zeroAddress,
        0n,
      ],
    }),
  });
  const expectations = [expected("entry"), expected("close")];
  const receipt = (e: ExpectedOrder): TransactionReceipt => ({
    transactionHash: e.hash,
    from: operator,
    to: pool,
    blockHash: ("0x" + "cc".repeat(32)) as Hex,
    blockNumber: 10n,
    transactionIndex: 0,
    gasUsed: 100n,
    cumulativeGasUsed: 100n,
    effectiveGasPrice: 2n,
    contractAddress: null,
    status: "success",
    type: "eip1559",
    logsBloom: "0x",
    logs: [
      {
        address: pool,
        blockHash: ("0x" + "cc".repeat(32)) as Hex,
        blockNumber: 10n,
        transactionHash: e.hash,
        transactionIndex: 0,
        logIndex: 0,
        removed: false,
        topics: (() => {
          const topics = encodeEventTopics({
            abi: orderBookEventsAbi,
            eventName: "OrderFilled",
            args: { takerOrderId: 1n, makerOrderId: 2n },
          }).filter((t): t is Hex => typeof t === "string");
          return [topics[0], ...topics.slice(1)] as [Hex, ...Hex[]];
        })(),
        data: encodeAbiParameters(
          [
            { type: "uint256" },
            { type: "uint256" },
            { type: "uint256" },
            { type: "uint256" },
          ],
          [100n, 0n, 0n, 10000n],
        ),
      },
    ],
  });
  const find = (hash: Hex) => expectations.find((e) => e.hash === hash)!;
  const reader: ProofReader = {
    getChainId: async () => 50383,
    getTransactionReceipt: async ({ hash }) => receipt(find(hash)),
    getTransaction: async ({ hash }) => {
      const e = find(hash);
      return {
        hash,
        from: operator,
        to: pool,
        input: e.input,
        nonce: e.nonce,
        value: 0n,
      };
    },
    getBlock: async () => ({
      hash: ("0x" + "cc".repeat(32)) as Hex,
      timestamp: 1800000000n,
    }),
    getBlockNumber: async () => 11n,
  };
  return { reader, expectations, receipt, plan };
}

import {
  decodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import type { ChainProof } from "../src/core/types";
export const orderAbi = parseAbi([
  "function placeOrderFor(address owner,bool isBid,uint64 userData,uint256 price,uint256 quantity,uint64 expireTimestampNs,uint8 orderType,uint8 selfMatchingOption,address builder,uint96 builderFeeBpsTimes1k) payable returns (bool success,uint128 orderId)",
]);
export const EXECUTION_CHAIN_ID = 50383;
export const MIN_CONFIRMATIONS = 2;
export interface ProofReader {
  getChainId(): Promise<number>;
  getTransactionReceipt(args: { hash: Hex }): Promise<TransactionReceipt>;
  getTransaction(args: {
    hash: Hex;
  }): Promise<{
    hash: Hex;
    from: Address;
    to: Address | null;
    input: Hex;
    nonce: number;
    value: bigint;
  }>;
  getBlock(args: {
    blockNumber: bigint;
  }): Promise<{ hash: Hex | null; timestamp: bigint }>;
  getBlockNumber(): Promise<bigint>;
}
export interface ExpectedOrder {
  hash: Hex;
  pool: Address;
  operator: Address;
  input: Hex;
  nonce: number;
  role: "entry" | "close";
}
export async function confirmedOrder(
  reader: ProofReader,
  expected: ExpectedOrder,
) {
  if ((await reader.getChainId()) !== EXECUTION_CHAIN_ID)
    throw new Error(
      "Proof RPC is not the supported Tokyo testnet. Mainnet is not enabled.",
    );
  const receipt = await reader.getTransactionReceipt({ hash: expected.hash });
  const [tx, block, head] = await Promise.all([
    reader.getTransaction({ hash: expected.hash }),
    reader.getBlock({ blockNumber: receipt.blockNumber }),
    reader.getBlockNumber(),
  ]);
  const same = (a: string | null, b: string) =>
    a?.toLowerCase() === b.toLowerCase();
  if (
    !same(receipt.transactionHash, expected.hash) ||
    !same(tx.hash, expected.hash) ||
    !same(receipt.to, expected.pool) ||
    !same(tx.to, expected.pool) ||
    !same(receipt.from, expected.operator) ||
    !same(tx.from, expected.operator) ||
    tx.nonce !== expected.nonce ||
    tx.value !== 0n ||
    !same(tx.input, expected.input)
  )
    throw new Error(
      "Transaction identity, sender, destination, value, nonce or calldata does not match the recorded order.",
    );
  if (!same(block.hash, receipt.blockHash))
    throw new Error(
      "Receipt block is no longer canonical. No confirmed result is claimed.",
    );
  const confirmations =
    head >= receipt.blockNumber ? Number(head - receipt.blockNumber + 1n) : 0;
  if (confirmations < MIN_CONFIRMATIONS)
    return {
      state: "pending" as const,
      receipt,
      at: Number(block.timestamp) * 1000,
    };
  const decoded = decodeFunctionData({ abi: orderAbi, data: tx.input });
  if (
    decoded.args[6] !== 1 ||
    decoded.args[9] !== 0n ||
    decoded.args[8] !== "0x0000000000000000000000000000000000000000"
  )
    throw new Error(
      "Order is not the expected FOK path with zero builder fee.",
    );
  const proof: ChainProof = {
    ...expected,
    owner: decoded.args[0],
    chainId: EXECUTION_CHAIN_ID,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    confirmations,
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: receipt.effectiveGasPrice.toString(),
    gasCostNativeWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    observedAt: Date.now(),
  };
  return {
    state:
      receipt.status === "success"
        ? ("confirmed" as const)
        : ("reverted" as const),
    receipt,
    proof,
    order: decoded.args,
    at: Number(block.timestamp) * 1000,
  };
}

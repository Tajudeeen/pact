import Decimal from "decimal.js";
import { z } from "zod";
import { decodePlaceOrder } from "@somnia-chain/markets-sdk";
import { parseUnits, formatUnits, type Address, type Hex } from "viem";
import { confirmedOrder, type ProofReader } from "./chain-proof";
import { digest } from "./plans";
import { planSchema } from "../src/core/validation";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const positive = z.string().refine((v) => {
  try {
    return new Decimal(v).isFinite() && new Decimal(v).gt(0);
  } catch {
    return false;
  }
});
const proofSchema = z
  .object({
    role: z.enum(["entry", "close"]),
    chainId: z.literal(50383),
    hash,
    pool: address,
    operator: address,
    owner: address,
    input: z.string().regex(/^0x[0-9a-fA-F]+$/),
    nonce: z.number().int().nonnegative(),
    blockNumber: z.string().regex(/^\d+$/),
    blockHash: hash,
  })
  .passthrough();
const receiptSchema = z
  .object({
    schemaVersion: z.literal(2),
    mode: z.literal("testnet"),
    chainId: z.literal(50383),
    state: z.literal("closed"),
    owner: address,
    market: z.string(),
    direction: z.enum(["long", "short"]),
    planDigest: z.string().regex(/^[0-9a-f]{64}$/),
    planVersion: z.number().int(),
    plan: planSchema.extend({
      id: z.string(),
      author: z.string(),
      version: z.number().int(),
      createdAt: z.number(),
      revoked: z.boolean(),
      digest: z.string(),
    }),
    approvedQuantity: positive,
    approvedLimit: positive,
    executionLimit: positive,
    transactions: z.array(hash).length(2),
    chainProofs: z.array(proofSchema).length(2),
    fills: z.array(
      z
        .object({
          role: z.enum(["entry", "close"]),
          quantity: positive,
          price: positive,
          txHash: hash,
        })
        .passthrough(),
    ),
  })
  .passthrough();
export interface ReceiptVerifier {
  reader: ProofReader;
  market(symbol: string): Promise<{
    poolAddress: Address;
    baseDecimals: number;
    quoteDecimals: number;
  }>;
}
export async function verifyReceipt(input: unknown, source: ReceiptVerifier) {
  const r = receiptSchema.parse(input);
  if ((await source.reader.getChainId()) !== 50383)
    throw new Error(
      "Receipt verification requires Tokyo testnet. Mainnet is not enabled.",
    );
  const { id, createdAt, revoked, digest: planDigest, ...terms } = r.plan;
  if (
    r.plan.mode !== "testnet" ||
    r.plan.market !== r.market ||
    r.plan.direction !== r.direction ||
    r.plan.version !== r.planVersion ||
    planDigest !== r.planDigest ||
    digest(terms) !== r.planDigest
  )
    throw new Error("Setup terms or digest do not match this receipt.");
  if (
    r.chainProofs[0].role === r.chainProofs[1].role ||
    new Set(r.transactions.map((h) => h.toLowerCase())).size !== 2
  )
    throw new Error(
      "Receipt must identify separate entry and close transactions.",
    );
  const m = await source.market(r.market);
  const exact = (value: string, decimals: number) => {
    const raw = parseUnits(value, decimals);
    if (!new Decimal(formatUnits(raw, decimals)).eq(value))
      throw new Error(
        "Receipt quantity or price is not exactly representable in this market.",
      );
    return raw;
  };
  const quantity = exact(r.approvedQuantity, m.baseDecimals);
  const entryLimit = exact(r.executionLimit, m.quoteDecimals);
  if (
    r.direction === "long"
      ? new Decimal(r.executionLimit).gt(r.approvedLimit)
      : new Decimal(r.executionLimit).lt(r.approvedLimit)
  )
    throw new Error("Execution limit exceeds the recorded approval.");
  const observations = [];
  for (const p of r.chainProofs) {
    if (
      !r.transactions.some((h) => h.toLowerCase() === p.hash.toLowerCase()) ||
      p.pool.toLowerCase() !== m.poolAddress.toLowerCase() ||
      p.owner.toLowerCase() !== r.owner.toLowerCase()
    )
      throw new Error(
        "Proof transaction, pool or owner does not match the receipt and discovered market.",
      );
    const observed = await confirmedOrder(source.reader, {
      ...p,
      hash: p.hash as Hex,
      pool: p.pool as Address,
      operator: p.operator as Address,
      input: p.input as Hex,
    });
    if (observed.state !== "confirmed")
      throw new Error(
        "Transaction is reverted or does not yet have two confirmations.",
      );
    if (
      observed.proof!.blockHash.toLowerCase() !== p.blockHash.toLowerCase() ||
      observed.proof!.blockNumber !== p.blockNumber
    )
      throw new Error(
        "Receipt's recorded block differs from the canonical transaction.",
      );
    const args = observed.order!;
    if (
      p.role === "entry" &&
      (observed.at > r.plan.expiresAt ||
        args[5] > BigInt(Math.floor(r.plan.expiresAt / 1000)) * 1000000000n)
    )
      throw new Error(
        "Entry inclusion or signed expiry exceeds the supplied setup window.",
      );
    const bid =
      p.role === "entry" ? r.direction === "long" : r.direction !== "long";
    if (
      args[0].toLowerCase() !== r.owner.toLowerCase() ||
      args[1] !== bid ||
      args[2] !== BigInt("0x" + r.planDigest.slice(0, 16)) ||
      args[4] !== quantity ||
      (p.role === "entry" && args[3] !== entryLimit)
    )
      throw new Error(
        "On-chain owner, side, setup tag, quantity or entry price bound differs from the supplied receipt.",
      );
    const fills = decodePlaceOrder(observed.receipt, m.poolAddress).fills;
    const recorded = r.fills.filter((f) => f.role === p.role);
    if (
      !fills.length ||
      fills.reduce((sum, f) => sum + f.quantityFilled, 0n) !== quantity ||
      fills.length !== recorded.length ||
      fills.some(
        (f, n) =>
          (bid ? f.fillPrice > args[3] : f.fillPrice < args[3]) ||
          f.quantityFilled !== exact(recorded[n].quantity, m.baseDecimals) ||
          f.fillPrice !== exact(recorded[n].price, m.quoteDecimals) ||
          recorded[n].txHash.toLowerCase() !== p.hash.toLowerCase(),
      )
    )
      throw new Error(
        "Recorded fills differ from the chain's FOK quantity, price or transaction evidence.",
      );
    observations.push(observed.proof!);
  }
  return {
    verifiedAt: new Date().toISOString(),
    chainId: 50383,
    result: "matching_onchain_execution",
    observations,
    limits: [
      "RPC-relative verification, not an independent consensus or security audit.",
      "Does not prove off-chain consent, historical flat position, profitability, funding attribution or mainnet readiness.",
    ],
  };
}

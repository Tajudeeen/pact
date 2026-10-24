import { it, expect, vi } from "vitest";
import { confirmedOrder } from "../server/chain-proof";
import { verifyReceipt } from "../server/verify-receipt";
import { scanSettlement } from "../server/settlement";
import { settlementFixture, bank } from "./helpers/settlement";
import { chainFixture, owner, pool } from "./helpers/chain";
async function setup() {
  const x = chainFixture();
  const proofs = await Promise.all(
    x.expectations.map((e) => confirmedOrder(x.reader, e)),
  );
  const r = {
    schemaVersion: 2,
    mode: "testnet",
    chainId: 50383,
    state: "closed",
    owner,
    market: "BTC-PERP",
    direction: "long",
    plan: x.plan,
    planVersion: 1,
    planDigest: x.plan.digest,
    approvedQuantity: "1",
    approvedLimit: "100",
    executionLimit: "100",
    transactions: x.expectations.map((e) => e.hash),
    chainProofs: proofs.map((p) => p.proof!),
    fills: x.expectations.map((e) => ({
      role: e.role,
      quantity: "1",
      price: "100",
      txHash: e.hash,
    })),
  };
  return {
    x,
    r,
    source: {
      reader: x.reader,
      market: async () => ({
        poolAddress: pool,
        baseDecimals: 2,
        quoteDecimals: 2,
      }),
    },
  };
}
it("independently re-reads both transactions and decodes matching real SDK fill events", async () => {
  const { r, source } = await setup();
  const result = await verifyReceipt(r, source);
  expect(result.result).toBe("matching_onchain_execution");
  expect(result.observations).toHaveLength(2);
  expect(result.limits.join(" ")).toContain("Does not prove off-chain consent");
});
it.each(["plan", "fill", "owner", "block", "duplicate"])(
  "refuses a tampered %s in the exported receipt",
  async (kind) => {
    const { r, source } = await setup();
    if (kind === "plan") r.plan.stop = "89";
    if (kind === "fill") r.fills[0].price = "99";
    if (kind === "owner") r.owner = pool;
    if (kind === "block") r.chainProofs[0].blockHash = "0x" + "dd".repeat(32);
    if (kind === "duplicate") r.chainProofs[1] = r.chainProofs[0];
    await expect(verifyReceipt(r, source)).rejects.toThrow(
      /digest|fills|owner|block|separate/i,
    );
  },
);
it("refuses to verify a practice receipt as chain evidence", async () => {
  const { r, source } = await setup();
  r.mode = "replay";
  await expect(verifyReceipt(r, source)).rejects.toThrow();
});

async function accounted() {
  const { x, r, source } = await setup(),
    ledger = settlementFixture();
  const reader = {
    ...x.reader,
    ...ledger.reader,
    getBlock: async (args: { blockNumber: bigint }) => ({
      ...(await ledger.reader.getBlock(args)),
      timestamp: 1800000000n,
    }),
    getBlockNumber: async () => 13n,
  };
  const proofs = await Promise.all(
    x.expectations.map((e) => confirmedOrder(reader, e)),
  );
  const settlement = await scanSettlement(reader, ledger.ctx);
  return {
    r: {
      ...r,
      chainProofs: proofs.map((p) => p.proof!),
      settlement,
      grossPnl: "3",
      tradingFees: "1",
      rebates: "0.2",
      fundingPaid: "0.5",
      netPnl: "1.7",
      nativeGasWei: "400",
    },
    source: {
      reader,
      market: async () => ({ ...(await source.market()), marginBank: bank }),
    },
  };
}
it("rebuilds the entire bank ledger without trusting the exported events or totals", async () => {
  const { r, source } = await accounted();
  const v = await verifyReceipt(r, source);
  expect(v.result).toBe("matching_onchain_execution_and_accounting");
  expect(v.accounting?.fundingPaid).toBe("0.5");
  expect(v.nativeGasWei).toBe("400");
});
it.each(["net", "fee", "event", "gas", "bank"])(
  "rejects tampered %s accounting",
  async (kind) => {
    const { r, source } = await accounted();
    if (kind === "net") r.netPnl = "100";
    if (kind === "fee") r.settlement.fees = "0";
    if (kind === "event") r.settlement.events[0].amount = "1000";
    if (kind === "gas") r.nativeGasWei = "0";
    if (kind === "bank") r.settlement.marginBank = owner;
    await expect(verifyReceipt(r, source)).rejects.toThrow(/differs|differ/);
  },
);
it("refuses net PnL without a complete independently verifiable ledger", async () => {
  const { r, source } = await accounted();
  r.settlement.status = "pending";
  await expect(verifyReceipt(r, source)).rejects.toThrow("requires complete");
});

it("independently reduces failed log pages rather than trusting the receipt cursor", async () => {
  const { r, source } = await accounted();
  const original = source.reader.getLogs;
  source.reader.getLogs = vi
    .fn(original)
    .mockRejectedValueOnce(new Error("RPC range too large"));
  vi.mocked(source.reader.getLogs).mockClear();
  expect((await verifyReceipt(r, source)).result).toBe(
    "matching_onchain_execution_and_accounting",
  );
  expect(source.reader.getLogs).toHaveBeenCalledTimes(2);
});

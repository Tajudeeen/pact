import { it, expect } from "vitest";
import { confirmedOrder } from "../server/chain-proof";
import { verifyReceipt } from "../server/verify-receipt";
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

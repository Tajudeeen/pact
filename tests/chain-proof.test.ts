import { describe, it, expect } from "vitest";
import { confirmedOrder } from "../server/chain-proof";
import { chainFixture, owner } from "./helpers/chain";
describe("canonical on-chain transaction evidence", () => {
  it("binds confirmed evidence to the exact order and records actual native gas", async () => {
    const x = chainFixture();
    const r = await confirmedOrder(x.reader, x.expectations[0]);
    expect(r.state).toBe("confirmed");
    expect(r.proof).toMatchObject({
      chainId: 50383,
      owner,
      blockNumber: "10",
      confirmations: 2,
      gasCostNativeWei: "200",
    });
  });
  it("waits without claiming a fill before two confirmations", async () => {
    const x = chainFixture();
    x.reader.getBlockNumber = async () => 10n;
    expect((await confirmedOrder(x.reader, x.expectations[0])).state).toBe(
      "pending",
    );
  });
  it("rejects a reorg instead of accepting the receipt at its old block hash", async () => {
    const x = chainFixture();
    x.reader.getBlock = async () => ({
      hash: "0x1234",
      timestamp: 1800000000n,
    });
    await expect(confirmedOrder(x.reader, x.expectations[0])).rejects.toThrow(
      "no longer canonical",
    );
  });
  it.each(["sender", "pool", "input", "nonce", "value"])(
    "rejects changed transaction %s",
    async (kind) => {
      const x = chainFixture();
      const read = x.reader.getTransaction;
      x.reader.getTransaction = async (args) => ({
        ...(await read(args)),
        ...{
          sender: { from: owner },
          pool: { to: owner },
          input: { input: "0x01" as const },
          nonce: { nonce: 99 },
          value: { value: 1n },
        }[kind],
      });
      await expect(confirmedOrder(x.reader, x.expectations[0])).rejects.toThrow(
        "does not match",
      );
    },
  );
  it("rejects mainnet before querying any receipt", async () => {
    const x = chainFixture();
    x.reader.getChainId = async () => 5031;
    x.reader.getTransactionReceipt = async () => {
      throw new Error("must not be called");
    };
    await expect(confirmedOrder(x.reader, x.expectations[0])).rejects.toThrow(
      "Mainnet is not enabled",
    );
  });
});

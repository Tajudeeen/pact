import { it, expect, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, type Hex } from "viem";
import { DreamDex } from "../server/dreamdex";
import { chainFixture, pool } from "./helpers/chain";
import type { PreparedAction } from "../server/venue";
async function setup(chainId = 50383) {
  const key = privateKeyToAccount(("0x" + "11".repeat(32)) as Hex);
  const raw = await key.signTransaction({
    chainId,
    type: "eip1559",
    nonce: 4,
    to: pool,
    data: chainFixture().expectations[0].input,
    gas: 10000000n,
    maxFeePerGas: 2n,
    maxPriorityFeePerGas: 1n,
    value: 0n,
  });
  const sendRawTransaction = vi.fn(async () => keccak256(raw));
  const getChainId = vi.fn(async () => 50383);
  const venue = Object.assign(Object.create(DreamDex.prototype) as DreamDex, {
    key,
    publicClient: { getChainId, sendRawTransaction },
  });
  const action: PreparedAction = {
    raw,
    hash: keccak256(raw),
    pool,
    nonce: 4,
    role: "entry",
    baseDecimals: 2,
    quoteDecimals: 2,
  };
  return { venue, action, sendRawTransaction, getChainId };
}
it("broadcasts the exact valid persisted Tokyo payload with signature verification", async () => {
  const x = await setup();
  await x.venue.broadcast(x.action);
  expect(x.sendRawTransaction).toHaveBeenCalledWith({
    serializedTransaction: x.action.raw,
  });
});
it("refuses a mainnet-signed transaction even through a Tokyo RPC", async () => {
  const x = await setup(5031);
  await expect(x.venue.broadcast(x.action)).rejects.toThrow(
    "identity or execution network",
  );
  expect(x.sendRawTransaction).not.toHaveBeenCalled();
});
it("refuses a switched RPC network before broadcasting a valid payload", async () => {
  const x = await setup();
  x.getChainId.mockResolvedValue(5031);
  await expect(x.venue.broadcast(x.action)).rejects.toThrow(
    "Wrong broadcast network",
  );
  expect(x.sendRawTransaction).not.toHaveBeenCalled();
});
it("refuses a mismatched saved hash before any broadcast", async () => {
  const x = await setup();
  x.action.hash = "0x" + "ff".repeat(32);
  await expect(x.venue.broadcast(x.action)).rejects.toThrow(
    "identity or execution network",
  );
  expect(x.sendRawTransaction).not.toHaveBeenCalled();
});

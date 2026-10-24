import { it, expect, vi } from "vitest";
import { requireTokyo, confirmWallet, TOKYO_CHAIN_ID } from "../src/wallet";
it("switches to Tokyo and verifies the resulting network", async () => {
  let chain = "0x1";
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "wallet_switchEthereumChain") chain = TOKYO_CHAIN_ID;
    return chain;
  });
  await requireTokyo({ request });
  expect(
    request.mock.calls.some(([a]) => a.method === "wallet_switchEthereumChain"),
  ).toBe(true);
});
it("adds Tokyo only after the wallet reports an unknown chain", async () => {
  let chain = "0x1";
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "wallet_switchEthereumChain") throw { code: 4902 };
    if (method === "wallet_addEthereumChain") chain = TOKYO_CHAIN_ID;
    return chain;
  });
  await requireTokyo({ request });
  expect(
    request.mock.calls.some(([a]) => a.method === "wallet_addEthereumChain"),
  ).toBe(true);
});
it("does not continue when switching is rejected or leaves the wrong network", async () => {
  await expect(
    requireTokyo({
      request: async ({ method }) => {
        if (method === "wallet_switchEthereumChain") throw { code: 4001 };
        return "0x1";
      },
    }),
  ).rejects.toThrow("Switch your wallet");
  await expect(requireTokyo({ request: async () => "0x1" })).rejects.toThrow(
    "still on another network",
  );
});
it("refuses an account or network changed during sign-in", async () => {
  await expect(
    confirmWallet({ request: async () => ["0x222"] }, "0x111"),
  ).rejects.toThrow("account changed");
  await expect(
    confirmWallet(
      {
        request: async ({ method }) =>
          method === "eth_accounts" ? ["0x111"] : "0x1",
      },
      "0x111",
    ),
  ).rejects.toThrow("network changed");
});

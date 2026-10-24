export interface EvmProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
export const TOKYO_CHAIN_ID = "0xc4cf";
export async function requireTokyo(provider: EvmProvider) {
  if (
    String(await provider.request({ method: "eth_chainId" })).toLowerCase() !==
    TOKYO_CHAIN_ID
  ) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: TOKYO_CHAIN_ID }],
      });
    } catch (e) {
      if ((e as { code?: number }).code !== 4902)
        throw new Error(
          "Switch your wallet to Somnia Tokyo testnet to continue. No login signature was requested.",
        );
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: TOKYO_CHAIN_ID,
            chainName: "Somnia Tokyo Testnet",
            nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
            rpcUrls: ["https://api.hideki2.infra.testnet.somnia.network"],
            blockExplorerUrls: [
              "https://explorer.testnet.somnia.network/tokyo",
            ],
          },
        ],
      });
    }
  }
  if (
    String(await provider.request({ method: "eth_chainId" })).toLowerCase() !==
    TOKYO_CHAIN_ID
  )
    throw new Error("Wallet is still on another network. Nothing signed in.");
}
export async function confirmWallet(provider: EvmProvider, owner: string) {
  const accounts = await provider.request({ method: "eth_accounts" });
  if (
    !Array.isArray(accounts) ||
    typeof accounts[0] !== "string" ||
    accounts[0].toLowerCase() !== owner.toLowerCase()
  )
    throw new Error(
      "Wallet account changed during sign-in. Connect the intended owner again.",
    );
  if (
    String(await provider.request({ method: "eth_chainId" })).toLowerCase() !==
    TOKYO_CHAIN_ID
  )
    throw new Error(
      "Wallet network changed during sign-in. Reconnect on Tokyo testnet.",
    );
}

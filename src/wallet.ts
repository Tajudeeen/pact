export interface EvmProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}
export interface EvmWallet {
  id: string;
  name: string;
  rdns: string;
  icon?: string;
  provider: EvmProvider;
}
export const TOKYO_CHAIN_ID = "0xc4cf";

/** Discover injected wallets using EIP-6963, with a legacy EIP-1193 fallback. */
export async function discoverEvmWallets(): Promise<EvmWallet[]> {
  if (typeof window === "undefined") return [];
  const wallets = new Map<string, EvmWallet>();
  const announce = (event: Event) => {
    const detail = (event as CustomEvent<{
      info?: { uuid?: string; name?: string; rdns?: string; icon?: string };
      provider?: EvmProvider;
    }>).detail;
    const info = detail?.info;
    if (!detail?.provider || !info?.uuid || !info.name) return;
    wallets.set(info.uuid, {
      id: info.uuid,
      name: info.name,
      rdns: info.rdns ?? "",
      icon: info.icon,
      provider: detail.provider,
    });
  };
  window.addEventListener("eip6963:announceProvider", announce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  window.removeEventListener("eip6963:announceProvider", announce);

  const legacyProvider = (window as Window & { ethereum?: EvmProvider }).ethereum;
  if (wallets.size === 0 && legacyProvider) {
    wallets.set("legacy-injected", {
      id: "legacy-injected",
      name: "Browser wallet",
      rdns: "",
      provider: legacyProvider,
    });
  }
  return [...wallets.values()].sort((a, b) => a.name.localeCompare(b.name));
}

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

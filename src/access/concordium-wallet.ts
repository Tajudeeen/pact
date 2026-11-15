export interface ConcordiumBrowserWalletProvider {
  connect(): Promise<string>;
  signMessage(account: string, message: string): Promise<unknown>;
}

export type ConcordiumBrowserWalletLoader = () => Promise<{
  detectConcordiumProvider(): Promise<ConcordiumBrowserWalletProvider>;
}>;

declare global {
  interface Window {
    concordium?: ConcordiumBrowserWalletProvider;
  }
}

const loadBrowserWallet: ConcordiumBrowserWalletLoader = async () => ({
  detectConcordiumProvider: async () => {
    if (typeof window === "undefined") {
      throw new Error("Concordium Browser Wallet is only available in a browser.");
    }

    if (window.concordium) return window.concordium;

    return new Promise<ConcordiumBrowserWalletProvider>((resolve, reject) => {
      let interval = 0;
      const timeout = window.setTimeout(() => {
        window.clearInterval(interval);
        reject(new Error("Concordium Browser Wallet was not detected. Install or unlock the extension, then try again."));
      }, 10_000);

      interval = window.setInterval(() => {
        if (!window.concordium) return;
        window.clearTimeout(timeout);
        window.clearInterval(interval);
        resolve(window.concordium);
      }, 100);
    });
  },
});

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\\+/g, "-")
    .replace(/\\//g, "_")
    .replace(/=+$/g, "");
}

/** Connects the registered owner and signs the exact server-issued Pact message. */
export async function createConcordiumOwnerProof(
  message: string,
  loadWallet: ConcordiumBrowserWalletLoader = loadBrowserWallet,
): Promise<{
  account: string;
  signature: unknown;
  headerValue: string;
}> {
  if (!message || message.length > 4096)
    throw new Error("The Pact challenge message is missing or too large.");

  const wallet = await loadWallet();
  const provider = await wallet.detectConcordiumProvider();
  const account = await provider.connect();
  if (!account) throw new Error("No Concordium account was selected.");

  const signature = await provider.signMessage(account, message);
  if (!signature || typeof signature !== "object")
    throw new Error("The Concordium wallet returned an invalid signature.");

  return {
    account,
    signature,
    headerValue: encodeBase64Url(JSON.stringify({ account, signature })),
  };
}

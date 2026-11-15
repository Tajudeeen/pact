export interface ConcordiumBrowserWalletProvider {
  connect(): Promise<string>;
  signMessage(account: string, message: string): Promise<unknown>;
}

export type ConcordiumBrowserWalletLoader = () => Promise<{
  detectConcordiumProvider(): Promise<ConcordiumBrowserWalletProvider>;
}>;

const loadBrowserWallet: ConcordiumBrowserWalletLoader = async () => {
  const packageName = "@concordium/browser-wallet-api-helpers";
  return import(packageName) as unknown as ReturnType<ConcordiumBrowserWalletLoader>;
};

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
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

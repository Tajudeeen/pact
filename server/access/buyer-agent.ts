import type { AccessContext } from "./contracts";

interface ConcordiumClientSdk {
  AccountAddress: {
    fromBase58(value: string): unknown;
  };
  buildBasicAccountSigner(privateKey: string): unknown;
}

interface ConcordiumX402ClientScheme {
  ExactConcordiumScheme: new (signer: {
    accountAddress: unknown;
    signer: unknown;
  }) => unknown;
}

interface X402FetchPackage {
  x402Client: new () => {
    register(network: string, scheme: unknown): unknown;
  };
  wrapFetchWithPayment(
    fetcher: typeof fetch,
    client: unknown,
  ): typeof fetch;
}

export interface PactBuyerPaymentModules {
  sdk: ConcordiumClientSdk;
  scheme: ConcordiumX402ClientScheme;
  fetch: X402FetchPackage;
}

export type PactBuyerPaymentModuleLoader = () => Promise<PactBuyerPaymentModules>;

const loadBuyerPaymentModules: PactBuyerPaymentModuleLoader = async () => {
  const sdkPackage = "@concordium/web-sdk";
  const schemePackage = "@x402/concordium/exact/client";
  const fetchPackage = "@x402/fetch";
  const [sdk, scheme, paymentFetch] = await Promise.all([
    import(sdkPackage),
    import(schemePackage),
    import(fetchPackage),
  ]);
  return {
    sdk: sdk as unknown as ConcordiumClientSdk,
    scheme: scheme as unknown as ConcordiumX402ClientScheme,
    fetch: paymentFetch as unknown as X402FetchPackage,
  };
};

/**
 * Creates a server-side buyer-agent fetch wrapper. The private key must be
 * injected from the buyer-agent secret store and must belong to the currently
 * registered CIS-8004 agentWallet. Never call this in browser code.
 */
export async function createPactBuyerFetch(
  input: {
    agentWalletAddress: string;
    agentWalletPrivateKey: string;
    network: "ccd:4221332d34e1694168c2a0c0b3fd0f27";
    fetcher?: typeof fetch;
  },
  loadModules: PactBuyerPaymentModuleLoader = loadBuyerPaymentModules,
): Promise<typeof fetch> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{45,55}$/.test(input.agentWalletAddress))
    throw new Error("A valid Concordium agentWallet address is required.");
  if (!input.agentWalletPrivateKey || input.agentWalletPrivateKey.length < 16)
    throw new Error("The agentWallet private key is missing or malformed.");

  const modules = await loadModules();
  const signer = {
    accountAddress: modules.sdk.AccountAddress.fromBase58(input.agentWalletAddress),
    signer: modules.sdk.buildBasicAccountSigner(input.agentWalletPrivateKey),
  };
  const client = new modules.fetch.x402Client().register(
    input.network,
    new modules.scheme.ExactConcordiumScheme(signer),
  );
  return modules.fetch.wrapFetchWithPayment(
    input.fetcher ?? fetch,
    client,
  );
}

export function pactBuyerHeaders(input: {
  requestId: string;
  ownerProofHeader: string;
}): HeadersInit {
  if (!/^[A-Za-z0-9._:-]{1,150}$/.test(input.requestId))
    throw new Error("Invalid Pact access request id.");
  if (!input.ownerProofHeader || input.ownerProofHeader.length > 16_384)
    throw new Error("Invalid Pact owner proof header.");
  return {
    "x-pact-access-request": input.requestId,
    "x-pact-owner-proof": input.ownerProofHeader,
  };
}

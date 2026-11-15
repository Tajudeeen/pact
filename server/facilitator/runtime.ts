export const CONCORDIUM_TESTNET = "ccd:4221332d34e1694168c2a0c0b3fd0f27" as const;

interface FacilitatorInstance {
  register(network: string, scheme: unknown): FacilitatorInstance;
  getSupported(): unknown;
  verify(paymentPayload: unknown, paymentRequirements: unknown): Promise<unknown>;
  settle(paymentPayload: unknown, paymentRequirements: unknown): Promise<unknown>;
  onBeforeVerify(hook: (context: unknown) => unknown): FacilitatorInstance;
  onBeforeSettle(hook: (context: unknown) => unknown): FacilitatorInstance;
}

interface FacilitatorCore {
  x402Facilitator: new () => FacilitatorInstance;
}

interface ConcordiumFacilitatorPackage {
  ExactConcordiumScheme: new (config: {
    signer: unknown;
    requireFinalization: boolean;
    finalizationTimeoutMs?: number;
  }) => unknown;
  toConcordiumFacilitatorSigner(
    sponsorAddress: string,
    privateKey: string,
    grpcConfig: { host: string; port: number; useTls: boolean; network: string },
  ): unknown;
  getConcordiumGrpcUrl(network: string): string;
  parseGrpcUrl(url: string): [string, number];
}

export interface PactFacilitatorModules {
  core: FacilitatorCore;
  concordium: ConcordiumFacilitatorPackage;
}

export type PactFacilitatorModuleLoader = () => Promise<PactFacilitatorModules>;

const loadFacilitatorModules: PactFacilitatorModuleLoader = async () => {
  const corePackage = "@x402/core/facilitator";
  const concordiumPackage = "@x402/concordium";
  const [core, concordium] = await Promise.all([
    import(corePackage),
    import(concordiumPackage),
  ]);
  return {
    core: core as unknown as FacilitatorCore,
    concordium: concordium as unknown as ConcordiumFacilitatorPackage,
  };
};

export async function createPactConcordiumFacilitator(
  config: {
    sponsorAddress: string;
    sponsorPrivateKey: string;
    network?: typeof CONCORDIUM_TESTNET;
    finalizationTimeoutMs?: number;
    resourceUrl: string;
    payTo: string;
    amount: string;
    asset: string;
  },
  loadModules: PactFacilitatorModuleLoader = loadFacilitatorModules,
) {
  const network = config.network ?? CONCORDIUM_TESTNET;
  let resourceUrl: URL;
  try {
    resourceUrl = new URL(config.resourceUrl);
  } catch {
    throw new Error("The facilitator resource allowlist must be a valid HTTPS URL.");
  }
  if (
    resourceUrl.protocol !== "https:" ||
    resourceUrl.search ||
    resourceUrl.hash ||
    !/^[1-9A-HJ-NP-Za-km-z]{45,55}$/.test(config.payTo) ||
    !/^[1-9][0-9]*$/.test(config.amount) ||
    !config.asset.trim()
  ) throw new Error("The facilitator payment allowlist is invalid.");
  if (!/^[1-9A-HJ-NP-Za-km-z]{45,55}$/.test(config.sponsorAddress))
    throw new Error("A valid Concordium facilitator sponsor address is required.");
  if (!/^[a-fA-F0-9]{64}$/.test(config.sponsorPrivateKey))
    throw new Error("The facilitator sponsor key must be a 32-byte hex Ed25519 key.");

  const modules = await loadModules();
  const grpcUrl = modules.concordium.getConcordiumGrpcUrl(network);
  const [host, port] = modules.concordium.parseGrpcUrl(grpcUrl);
  const signer = modules.concordium.toConcordiumFacilitatorSigner(
    config.sponsorAddress,
    config.sponsorPrivateKey,
    { host, port, useTls: true, network },
  );
  const scheme = new modules.concordium.ExactConcordiumScheme({
    signer,
    requireFinalization: true,
    finalizationTimeoutMs: config.finalizationTimeoutMs ?? 60_000,
  });
  const facilitator = new modules.core.x402Facilitator().register(network, scheme);
  const validatePaymentPolicy = (input: unknown) => {
    if (!input || typeof input !== "object") {
      return {
        abort: true as const,
        reason: "pact_facilitator_invalid_context",
        message: "The payment context is invalid.",
      };
    }
    const context = input as Record<string, unknown>;
    const requirements = context.requirements as Record<string, unknown> | undefined;
    const paymentPayload = context.paymentPayload as Record<string, unknown> | undefined;
    const resource = paymentPayload?.resource as Record<string, unknown> | undefined;
    if (
      requirements?.scheme !== "exact" ||
      requirements.network !== network ||
      requirements.payTo !== config.payTo ||
      requirements.amount !== config.amount ||
      requirements.asset !== config.asset ||
      resource?.url !== config.resourceUrl
    ) {
      return {
        abort: true as const,
        reason: "pact_facilitator_policy_mismatch",
        message: "This facilitator only sponsors the configured Pact resource and price.",
      };
    }
    return;
  };
  facilitator
    .onBeforeVerify(validatePaymentPolicy)
    .onBeforeSettle(validatePaymentPolicy);

  return {
    facilitator,
    network,
    supported: () => facilitator.getSupported(),
    verify: (paymentPayload: unknown, paymentRequirements: unknown) =>
      facilitator.verify(paymentPayload, paymentRequirements),
    settle: (paymentPayload: unknown, paymentRequirements: unknown) =>
      facilitator.settle(paymentPayload, paymentRequirements),
  };
}

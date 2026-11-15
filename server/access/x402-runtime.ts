import type { AccessContext } from "./contracts";
import {
  createPactX402Hooks,
  type PactAccessPipeline,
} from "./x402-hooks";

export interface PactX402RouteConfig {
  network: AccessContext["network"];
  facilitatorUrl: string;
  facilitatorAuthToken: string;
  routePath: string;
  resourceUrl: string;
  description: string;
  mimeType: string;
  payTo: string;
  amount: string;
  asset: string;
  maxTimeoutSeconds?: number;
}

interface X402ResourceServerInstance {
  register(network: string, scheme: unknown): this;
  onBeforeSettle(hook: ReturnType<typeof createPactX402Hooks>["onBeforeSettle"]): this;
  onAfterSettle(hook: ReturnType<typeof createPactX402Hooks>["onAfterSettle"]): this;
  onSettleFailure(hook: ReturnType<typeof createPactX402Hooks>["onSettleFailure"]): this;
}

interface X402HttpServerInstance {
  onProtectedRequest(hook: ReturnType<typeof createPactX402Hooks>["onProtectedRequest"]): this;
}

export interface X402RuntimeModules {
  HTTPFacilitatorClient: new (options: {
    url: string;
    createAuthHeaders: () => Promise<{
      verify: Record<string, string>;
      settle: Record<string, string>;
      supported: Record<string, string>;
    }>;
  }) => unknown;
  ExactConcordiumScheme: new () => unknown;
  x402ResourceServer: new (client: unknown) => X402ResourceServerInstance;
  x402HTTPResourceServer: new (
    server: X402ResourceServerInstance,
    routes: Record<string, unknown>,
  ) => X402HttpServerInstance;
  paymentMiddlewareFromHTTPServer(
    server: X402HttpServerInstance,
    paywallConfig?: unknown,
    paywall?: unknown,
    syncFacilitatorOnStart?: boolean,
  ): unknown;
}

export type PactX402ModuleLoader = () => Promise<X402RuntimeModules>;

const loadX402Modules: PactX402ModuleLoader = async () => {
  const honoPackage = "@x402/hono";
  const corePackage = "@x402/core/server";
  const concordiumPackage = "@x402/concordium/exact/server";
  const [hono, core, concordium] = await Promise.all([
    import(honoPackage),
    import(corePackage),
    import(concordiumPackage),
  ]);
  return {
    HTTPFacilitatorClient: core.HTTPFacilitatorClient,
    ExactConcordiumScheme: concordium.ExactConcordiumScheme,
    x402ResourceServer: hono.x402ResourceServer,
    x402HTTPResourceServer: hono.x402HTTPResourceServer,
    paymentMiddlewareFromHTTPServer: hono.paymentMiddlewareFromHTTPServer,
  } as unknown as X402RuntimeModules;
};

/**
 * Creates the official x402 Hono middleware for one seller-owned resource.
 * Concordium's Exact scheme defaults to the authorization flow, which settles
 * before the resource handler. The handler can therefore release bytes only
 * after the onAfterSettle hook has persisted a finalized payment.
 */
export async function createPactX402Runtime(
  pipeline: PactAccessPipeline,
  config: PactX402RouteConfig,
  loadModules: PactX402ModuleLoader = loadX402Modules,
) {
  if (!config.facilitatorUrl.trim())
    throw new Error("A Concordium-capable x402 facilitator URL is required.");
  if (config.facilitatorAuthToken.length < 32)
    throw new Error("A 32-character minimum facilitator bearer token is required.");
  if (
    !config.routePath.startsWith("/api/") ||
    config.routePath === "/api/access/challenges" ||
    config.routePath.includes("?")
  ) throw new Error("The protected route must be a dedicated API path without a query string.");
  let resourceUrl: URL;
  try {
    resourceUrl = new URL(config.resourceUrl);
  } catch {
    throw new Error("The canonical protected resource URL must be a valid HTTPS URL.");
  }
  if (
    resourceUrl.protocol !== "https:" ||
    resourceUrl.pathname !== config.routePath ||
    resourceUrl.search ||
    resourceUrl.hash
  ) throw new Error("The canonical HTTPS resource URL must match the protected route path exactly.");
  if (!/^[1-9][0-9]*$/.test(config.amount))
    throw new Error("The configured price must be a positive integer in atomic units.");
  if (!config.asset.trim() || !config.payTo.trim())
    throw new Error("A seller payout account and asset are required.");

  const modules = await loadModules();
  const hooks = createPactX402Hooks(pipeline);
  const authorization = { Authorization: `Bearer ${config.facilitatorAuthToken}` };
  const facilitator = new modules.HTTPFacilitatorClient({
    url: config.facilitatorUrl,
    createAuthHeaders: async () => ({
      verify: authorization,
      settle: authorization,
      supported: authorization,
    }),
  });
  const resourceServer = new modules.x402ResourceServer(facilitator)
    .register(config.network, new modules.ExactConcordiumScheme())
    .onBeforeSettle(hooks.onBeforeSettle)
    .onAfterSettle(hooks.onAfterSettle)
    .onSettleFailure(hooks.onSettleFailure);

  const routeKey = `GET ${config.routePath}`;
  const httpServer = new modules.x402HTTPResourceServer(resourceServer, {
    [routeKey]: {
      accepts: [
        {
          scheme: "exact",
          network: config.network,
          price: { amount: config.amount, asset: config.asset },
          payTo: config.payTo,
          maxTimeoutSeconds: config.maxTimeoutSeconds ?? 90,
        },
      ],
      resource: config.resourceUrl,
      description: config.description,
      mimeType: config.mimeType,
    },
  }).onProtectedRequest(hooks.onProtectedRequest);

  const middleware = modules.paymentMiddlewareFromHTTPServer(
    httpServer,
    undefined,
    undefined,
    true,
  );

  return { middleware, resourceServer, httpServer, hooks };
}

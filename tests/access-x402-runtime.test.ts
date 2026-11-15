import { describe, expect, it, vi } from "vitest";
import {
  createPactX402Runtime,
  type X402RuntimeModules,
} from "../server/access/x402-runtime";

const config = {
  network: "ccd:4221332d34e1694168c2a0c0b3fd0f27" as const,
  facilitatorUrl: "https://ccd-facilitator.test",
  facilitatorAuthToken: "token-".padEnd(40, "x"),
  routePath: "/api/datasets/weather",
  resourceUrl: "https://pact.test/api/datasets/weather",
  description: "Weather dataset",
  mimeType: "application/json",
  payTo: "4".repeat(50),
  amount: "1000000",
  asset: "CCD",
};

function modulesHarness() {
  const events: string[] = [];
  const facilitator = vi.fn();
  const scheme = vi.fn();
  const resourceServer = {
    register: vi.fn(function (this: object) { events.push("register"); return this; }),
    onBeforeSettle: vi.fn(function (this: object) { events.push("before"); return this; }),
    onAfterSettle: vi.fn(function (this: object) { events.push("after"); return this; }),
    onSettleFailure: vi.fn(function (this: object) { events.push("failure"); return this; }),
  };
  const httpServer = {
    onProtectedRequest: vi.fn(function (this: object) { events.push("protected"); return this; }),
  };
  const x402ResourceServer = vi.fn(function () { return resourceServer; });
  const x402HTTPResourceServer = vi.fn(function () { return httpServer; });
  const middleware = vi.fn(() => "hono-payment-middleware");
  const loadModules = async () => ({
    HTTPFacilitatorClient: facilitator,
    ExactConcordiumScheme: scheme,
    x402ResourceServer,
    x402HTTPResourceServer,
    paymentMiddlewareFromHTTPServer: middleware,
  }) as unknown as X402RuntimeModules;
  return {
    events,
    facilitator,
    scheme,
    resourceServer,
    httpServer,
    x402ResourceServer,
    x402HTTPResourceServer,
    middleware,
    loadModules,
  };
}

describe("Pact x402 runtime", () => {
  it("registers the Concordium Exact scheme, owner gate, and pre-handler settlement hooks", async () => {
    const h = modulesHarness();
    const pipeline = {} as never;
    const runtime = await createPactX402Runtime(pipeline, config, h.loadModules);

    expect(runtime.middleware).toBe("hono-payment-middleware");
    expect(h.facilitator).toHaveBeenCalledWith({
      url: config.facilitatorUrl,
      createAuthHeaders: expect.any(Function),
    });
    const facilitatorOptions = h.facilitator.mock.calls[0]?.[0] as {
      createAuthHeaders: () => Promise<{
        verify: Record<string, string>;
        settle: Record<string, string>;
        supported: Record<string, string>;
      }>;
    };
    expect(await facilitatorOptions.createAuthHeaders()).toEqual({
      verify: { Authorization: `Bearer ${config.facilitatorAuthToken}` },
      settle: { Authorization: `Bearer ${config.facilitatorAuthToken}` },
      supported: { Authorization: `Bearer ${config.facilitatorAuthToken}` },
    });
    expect(h.scheme).toHaveBeenCalledTimes(1);
    expect(h.resourceServer.register).toHaveBeenCalledWith(config.network, expect.any(Object));
    expect(h.resourceServer.onBeforeSettle).toHaveBeenCalledTimes(1);
    expect(h.resourceServer.onAfterSettle).toHaveBeenCalledTimes(1);
    expect(h.resourceServer.onSettleFailure).toHaveBeenCalledTimes(1);
    expect(h.httpServer.onProtectedRequest).toHaveBeenCalledTimes(1);
    expect(h.x402HTTPResourceServer).toHaveBeenCalledWith(
      h.resourceServer,
      {
        [`GET ${config.routePath}`]: {
          accepts: [{
            scheme: "exact",
            network: config.network,
            price: { amount: config.amount, asset: config.asset },
            payTo: config.payTo,
            maxTimeoutSeconds: 90,
          }],
          resource: config.resourceUrl,
          description: config.description,
          mimeType: config.mimeType,
        },
      },
    );
    expect(h.middleware).toHaveBeenCalledWith(h.httpServer, undefined, undefined, true);
  });

  it("rejects missing facilitator configuration before loading x402 packages", async () => {
    const h = modulesHarness();
    await expect(createPactX402Runtime(
      {} as never,
      { ...config, facilitatorUrl: " " },
      h.loadModules,
    )).rejects.toThrow("facilitator URL");
    expect(h.facilitator).not.toHaveBeenCalled();
  });

  it("rejects a resource URL whose path differs from the protected route", async () => {
    const h = modulesHarness();
    await expect(createPactX402Runtime(
      {} as never,
      { ...config, resourceUrl: "https://pact.test/another-resource" },
      h.loadModules,
    )).rejects.toThrow("match the protected route");
  });

  it("rejects non-HTTPS resource URLs", async () => {
    const h = modulesHarness();
    await expect(createPactX402Runtime(
      {} as never,
      { ...config, resourceUrl: "http://pact.test/resource" },
      h.loadModules,
    )).rejects.toThrow("HTTPS");
  });
});

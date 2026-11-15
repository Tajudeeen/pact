import { describe, expect, it, vi } from "vitest";
import { createPactAccessHttpRoutes } from "../server/access/http";
import { PACT_ACCESS_REQUEST_HEADER } from "../server/access/x402-hooks";

const config = {
  routePath: "/api/datasets/weather",
  mimeType: "application/json",
};

function runtimeHarness() {
  return {
    middleware: async (_context: unknown, next: () => Promise<void>) => next(),
    issueChallengeForAgent: vi.fn(async (buyerAgentId: string) => ({
      requestId: "request-1",
      challenge: "ab".repeat(32),
      expiresAt: "2026-11-15T12:01:30.000Z",
      policyId: "owner-account-signature-v1",
      message: "server-generated-message-for-" + buyerAgentId,
    })),
    deliverPaidResource: vi.fn(async () => ({
      status: "delivered" as const,
      value: new TextEncoder().encode('{"forecast":"clear"}'),
      paymentReference: "ccd-tx-1",
    })),
  };
}

describe("Pact Access HTTP routes", () => {
  it("creates a challenge using only the buyer agent identifier", async () => {
    const runtime = runtimeHarness();
    const app = createPactAccessHttpRoutes(runtime, config);
    const response = await app.request("/api/access/challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyerAgentId: "3FCRLpYrYdBNkbaBkrK2kmcnrdNqa4wSDYWGAWGZvG6Xi9eWtp" }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      requestId: "request-1",
      policyId: "owner-account-signature-v1",
    });
    expect(runtime.issueChallengeForAgent).toHaveBeenCalledWith(
      "3FCRLpYrYdBNkbaBkrK2kmcnrdNqa4wSDYWGAWGZvG6Xi9eWtp",
    );
  });

  it("rejects client attempts to supply owner, payer, seller, or resource fields", async () => {
    const runtime = runtimeHarness();
    const app = createPactAccessHttpRoutes(runtime, config);
    const response = await app.request("/api/access/challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerAgentId: "3FCRLpYrYdBNkbaBkrK2kmcnrdNqa4wSDYWGAWGZvG6Xi9eWtp",
        ownerAccount: "attacker",
        payerAccount: "attacker",
        sellerId: "attacker",
        resourceId: "attacker",
      }),
    });
    expect(response.status).toBe(400);
    expect(runtime.issueChallengeForAgent).not.toHaveBeenCalled();
  });

  it("returns protected bytes only through the paid delivery callback", async () => {
    const runtime = runtimeHarness();
    const app = createPactAccessHttpRoutes(runtime, config);
    const response = await app.request(config.routePath, {
      headers: { [PACT_ACCESS_REQUEST_HEADER]: "request-1" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe('{"forecast":"clear"}');
    expect(runtime.deliverPaidResource).toHaveBeenCalledWith("request-1");
  });

  it("rejects a protected resource request without its access request id", async () => {
    const runtime = runtimeHarness();
    const app = createPactAccessHttpRoutes(runtime, config);
    const response = await app.request(config.routePath);
    expect(response.status).toBe(400);
    expect(runtime.deliverPaidResource).not.toHaveBeenCalled();
  });
});

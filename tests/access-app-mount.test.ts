import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";
import { createPactAccessHttpRoutes } from "../server/access/http";
import { setup, cleanupExecution } from "./helpers/execution";

afterEach(() => cleanupExecution());

function runtimeHarness() {
  return {
    middleware: async (_context: unknown, next: () => Promise<void>) => next(),
    issueChallengeForAgent: vi.fn(async () => ({
      requestId: "request-1",
      challenge: "ab".repeat(32),
      expiresAt: "2026-11-15T12:01:30.000Z",
      policyId: "owner-account-signature-v1",
      message: "server-issued-message",
    })),
    deliverPaidResource: vi.fn(async () => ({
      status: "delivered" as const,
      value: new TextEncoder().encode("protected bytes"),
      paymentReference: "ccd-tx-1",
    })),
  };
}

describe("Pact Access app mounting", () => {
  it("mounts the challenge and resource routes behind the existing API origin guard", async () => {
    const x = setup();
    await x.open();
    const runtime = runtimeHarness();
    const routePath = "/api/access/resource";
    const routes = createPactAccessHttpRoutes(runtime, {
      routePath,
      mimeType: "application/octet-stream",
    });
    const app = createApp(
      x.service,
      "http://pact.test",
      null,
      undefined,
      new Map(),
      undefined,
      { app: routes, routePath },
    );

    const challenge = await app.request("/api/access/challenges", {
      method: "POST",
      headers: {
        origin: "http://pact.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        buyerAgentId: "3FCRLpYrYdBNkbaBkrK2kmcnrdNqa4wSDYWGAWGZvG6Xi9eWtp",
      }),
    });
    expect(challenge.status).toBe(201);
    expect(runtime.issueChallengeForAgent).toHaveBeenCalledTimes(1);

    const resource = await app.request(routePath, {
      headers: { "x-pact-access-request": "request-1" },
    });
    expect(resource.status).toBe(200);
    expect(await resource.text()).toBe("protected bytes");
    expect(runtime.deliverPaidResource).toHaveBeenCalledTimes(1);

    const crossOrigin = await app.request("/api/access/challenges", {
      method: "POST",
      headers: {
        origin: "https://evil.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        buyerAgentId: "3FCRLpYrYdBNkbaBkrK2kmcnrdNqa4wSDYWGAWGZvG6Xi9eWtp",
      }),
    });
    expect(crossOrigin.status).toBe(403);
    expect(runtime.issueChallengeForAgent).toHaveBeenCalledTimes(1);
  });
});

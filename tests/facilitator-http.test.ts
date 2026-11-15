import { describe, expect, it, vi } from "vitest";
import { createPactFacilitatorHttpApp } from "../server/facilitator/http";

const authToken = "test-facilitator-token".padEnd(40, "x");
const auth = { Authorization: `Bearer ${authToken}` };

describe("Pact facilitator HTTP API", () => {
  it("exposes health and supported payment kinds", async () => {
    const runtime = {
      supported: () => ({ kinds: [{ x402Version: 2, scheme: "exact", network: "ccd:testnet" }] }),
      verify: vi.fn(async () => ({ isValid: true })),
      settle: vi.fn(async () => ({ success: true })),
    };
    const app = createPactFacilitatorHttpApp(runtime, { authToken });

    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/supported", { headers: auth })).status).toBe(200);
    expect(await (await app.request("/supported", { headers: auth })).json()).toEqual(runtime.supported());
  });

  it("delegates verification and settlement to the official facilitator", async () => {
    const runtime = {
      supported: () => ({ kinds: [] }),
      verify: vi.fn(async () => ({ isValid: true, payer: "payer" })),
      settle: vi.fn(async () => ({ success: true, transaction: "tx" })),
    };
    const app = createPactFacilitatorHttpApp(runtime, { authToken });
    const body = JSON.stringify({
      x402Version: 2,
      paymentPayload: { payload: { signedTransaction: {} } },
      paymentRequirements: { scheme: "exact", amount: "100" },
    });
    const headers = { "Content-Type": "application/json", ...auth };

    const verified = await app.request("/verify", { method: "POST", headers, body });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ isValid: true });
    expect(runtime.verify).toHaveBeenCalledTimes(1);

    const settled = await app.request("/settle", { method: "POST", headers, body });
    expect(settled.status).toBe(200);
    expect(await settled.json()).toMatchObject({ success: true });
    expect(runtime.settle).toHaveBeenCalledTimes(1);
  });

  it("requires bearer authentication for payment endpoints", async () => {
    const app = createPactFacilitatorHttpApp({
      supported: () => ({ kinds: [] }),
      verify: vi.fn(),
      settle: vi.fn(),
    }, { authToken });
    const response = await app.request("/supported");
    expect(response.status).toBe(401);
  });

  it("rejects malformed facilitator requests", async () => {
    const app = createPactFacilitatorHttpApp({
      supported: () => ({ kinds: [] }),
      verify: vi.fn(),
      settle: vi.fn(),
    }, { authToken });
    const response = await app.request("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ paymentPayload: {} }),
    });
    expect(response.status).toBe(400);
  });

  it("does not leak internal errors from the settlement signer", async () => {
    const app = createPactFacilitatorHttpApp({
      supported: () => ({ kinds: [] }),
      verify: vi.fn(async () => ({ isValid: true })),
      settle: vi.fn(async () => {
        throw Object.assign(new Error("private key material"), {
          errorReason: "finalization_failed",
          errorMessage: "Transaction submitted but finalization timed out.",
          transaction: "ab".repeat(32),
          network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
          payer: "5".repeat(50),
        });
      }),
    }, { authToken });
    const response = await app.request("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ paymentPayload: {}, paymentRequirements: {} }),
    });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({
      success: false,
      errorReason: "finalization_failed",
      transaction: "ab".repeat(32),
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
    });
    expect(JSON.stringify(body)).not.toContain("private key");
  });
});

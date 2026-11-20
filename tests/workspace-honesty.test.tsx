// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockFetchWith(responses: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: string) => {
    const path = String(input).replace(/^\/api/, "");
    return Response.json(responses[path] ?? { ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Workspace health honesty", () => {
  it("shows the disabled facilitator as not configured instead of healthy", async () => {
    mockFetchWith({
      "/health": {
        status: "ok",
        storage: "ready",
        challengeIssuance: "configured",
        ownerSignatureVerification: "configured",
        accountInfoRpc: "concordium-testnet-grpc-web",
        payments: "disabled",
        resourceDelivery: "disabled",
      },
      "/access/payment-health": {
        facilitatorConfigured: false,
        payments: "disabled_until_testnet_configuration",
      },
    });
    render(
      <MemoryRouter initialEntries={["/app/overview"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/Challenge, owner signature and account RPC configured/)).toBeDefined(),
    );
    expect(screen.getByText("Payments disabled — facilitator awaits testnet configuration")).toBeDefined();
    expect(screen.getAllByText("Not configured")).toHaveLength(1);
    const facilitatorCard = screen
      .getByText("x402 facilitator")
      .closest("article")!;
    expect(facilitatorCard.querySelector("i.is-good")).toBeNull();
    expect(facilitatorCard.querySelector("i.is-pending")).not.toBeNull();
  });

  it("shows a configured facilitator as ready but never as a payment", async () => {
    mockFetchWith({
      "/health": { status: "ok", storage: "ready" },
      "/access/payment-health": {
        facilitatorConfigured: true,
        payments: "configured",
      },
    });
    render(
      <MemoryRouter initialEntries={["/app/overview"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/readiness only, no payment submitted/)).toBeDefined(),
    );
    expect(screen.getAllByText("Ready")).toHaveLength(1);
    expect(screen.queryByText(/payment successful/i)).toBeNull();
  });

  it("surfaces the real production health fields and the live payment-health shape", async () => {
    mockFetchWith({
      "/health": {
        status: "ok",
        storage: "ready",
        runtime: "cloudflare-workers-free",
        database: "d1",
        challengeIssuance: "configured",
        ownerSignatureVerification: "configured",
        accountInfoRpc: "concordium-testnet-grpc-web",
        payments: "disabled",
        resourceDelivery: "disabled",
      },
      "/access/payment-health": {
        runtime: "cloudflare-workers-free",
        database: "d1-ready",
        resourceCount: 0,
        network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
        x402: "not-deployed",
        facilitatorConfigured: false,
        paymentsEnabled: false,
        resourceDelivery: "disabled",
        reason: "The final x402 facilitator bundle has not been deployed yet.",
      },
    });
    render(
      <MemoryRouter initialEntries={["/app/overview"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/Payments not deployed — facilitator is fail-closed/)).toBeDefined(),
    );
    expect(screen.getByText(/Challenge, owner signature and account RPC configured/)).toBeDefined();
    expect(screen.getByText("accountInfoRpc: concordium-testnet-grpc-web")).toBeDefined();
    expect(screen.getByText("x402: not-deployed")).toBeDefined();
    expect(screen.getByText("paymentsEnabled: false")).toBeDefined();
    expect(screen.getByText(/final x402 facilitator bundle has not been deployed/)).toBeDefined();
  });
});

describe("Workspace mobile navigation keyboard behavior", () => {
  it("opens, closes with Escape, and returns focus to the trigger", async () => {
    render(
      <MemoryRouter initialEntries={["/app/overview"]}>
        <App />
      </MemoryRouter>,
    );
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const close = await screen.findByRole("button", { name: "Close navigation" });
    expect(document.activeElement).toBe(close);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    // The sidebar is hidden via CSS on desktop, not unmounted; aria state is authoritative.
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
});

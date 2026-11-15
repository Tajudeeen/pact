// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";
import { createApp } from "../server/app";
import { Auth } from "../server/auth";
import { setup, cleanupExecution } from "./helpers/execution";

afterEach(() => {
  cleanup();
  cleanupExecution();
  vi.unstubAllGlobals();
});

describe("Pact Access route boundary", () => {
  it("redirects the retired perps workspace to Pact Access", async () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: /agents can pay/i }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Check recovery" })).toBeNull();
  });

  it("keeps legacy recovery API authorization and origin checks enforced", async () => {
    const x = setup();
    await x.open();
    x.setPosition({ markValid: false });
    await x.service.tick();
    const origin = "http://pact.test";
    const app = createApp(x.service, origin);
    const auth = new Auth(x.service.store, origin, x.service.now);
    const path = "/api/intents/" + x.intent.id + "/recover";
    const stranger = await app.request(path, {
      method: "POST",
      headers: {
        origin,
        cookie: "pact_session=" + auth.session("stranger", "testnet"),
      },
    });
    expect(stranger.status).toBe(404);
    expect((await stranger.json()).code).toBe("NOT_FOUND");

    const crossOrigin = await app.request(path, {
      method: "POST",
      headers: {
        origin: "https://evil.test",
        cookie: "pact_session=" + auth.session("owner", "testnet"),
      },
    });
    expect(crossOrigin.status).toBe(403);
    expect(x.intent.state).toBe("attention");
    expect(x.prepared).toHaveLength(1);
  });
});

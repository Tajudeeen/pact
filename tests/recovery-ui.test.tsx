// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";
import { Provider } from "../src/state";
import { createApp } from "../server/app";
import { Auth } from "../server/auth";
import { setup, cleanupExecution } from "./helpers/execution";

afterEach(() => {
  cleanup();
  cleanupExecution();
  vi.unstubAllGlobals();
});
describe("owner recovery through React, API and SQLite", () => {
  it("rechecks a timed-out close and shows confirmed flat without another order", async () => {
    const x = setup();
    await x.open();
    x.observations.close = { state: "pending", fills: [], detail: "pending" };
    await x.service.close("owner", x.intent.id);
    x.advance(120001);
    await x.service.tick();
    const origin = "http://pact.test";
    const app = createApp(x.service, origin);
    const token = new Auth(x.service.store, origin, x.service.now).session(
      "owner",
      "testnet",
    );
    const fetcher = vi.fn(async (input: string, init?: RequestInit) =>
      app.request(input, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string>),
          origin,
          cookie: "pact_session=" + token,
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      <MemoryRouter initialEntries={["/orders/" + x.intent.id]}>
        <Provider>
          <App />
        </Provider>
      </MemoryRouter>,
    );
    const button = await screen.findByRole("button", {
      name: "Check recovery",
    });
    expect(
      screen.getByRole("link", { name: /Inspect position in dreamDEX/ }),
    ).toBeDefined();
    delete x.observations.close;
    x.setPosition({ position: "0" });
    fireEvent.click(button);
    await screen.findByRole("heading", { name: "Close reconciled" });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Check recovery" }),
      ).toBeNull(),
    );
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/recover"))).toBe(
      true,
    );
    expect(x.intent.state).toBe("closed");
    expect(x.prepared).toHaveLength(2);
    expect(x.sends).toBe(2);
  });
  it("rejects recovery by another user and cross-origin requests", async () => {
    const x = setup();
    await x.open();
    x.setPosition({ markValid: false });
    await x.service.tick();
    const origin = "http://pact.test",
      app = createApp(x.service, origin);
    const auth = new Auth(x.service.store, origin, x.service.now);
    const path = "/api/intents/" + x.intent.id + "/recover";
    const response = await app.request(path, {
      method: "POST",
      headers: {
        origin,
        cookie: "pact_session=" + auth.session("stranger", "testnet"),
      },
    });
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("NOT_FOUND");
    expect(
      (
        await app.request(path, {
          method: "POST",
          headers: {
            origin: "https://evil.test",
            cookie: "pact_session=" + auth.session("owner", "testnet"),
          },
        })
      ).status,
    ).toBe(403);
    expect(x.intent.state).toBe("attention");
    expect(x.prepared).toHaveLength(1);
  });
});

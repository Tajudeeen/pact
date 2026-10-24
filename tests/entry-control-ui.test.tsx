// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { EntryControl } from "../src/components/EntryControl";
import { Provider } from "../src/state";
import { Store } from "../server/store";
import { PactService } from "../server/service";
import { createApp } from "../server/app";
import { Auth } from "../server/auth";
it("persists entry pause and resume through the rendered control, API and SQLite", async () => {
  const db = new Store();
  const service = new PactService(db);
  const origin = "http://pact.test";
  const owner = "0x1111111111111111111111111111111111111111";
  const token = new Auth(db, origin).session(owner, "testnet");
  const app = createApp(service, origin);
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) =>
    app.request(path, {
      ...init,
      headers: { ...init?.headers, origin, cookie: "pact_session=" + token },
    }),
  );
  try {
    render(
      <Provider>
        <EntryControl />
      </Provider>,
    );
    const pause = await screen.findByRole("button", {
      name: "Pause new entries",
    });
    await waitFor(() =>
      expect((pause as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(pause);
    await screen.findByRole("button", { name: "Resume new entries" });
    expect(service.entryControl(owner).paused).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Resume new entries" }));
    await screen.findByRole("button", { name: "Pause new entries" });
    expect(service.entryControl(owner).paused).toBe(false);
  } finally {
    cleanup();
    db.close();
    vi.unstubAllGlobals();
  }
});

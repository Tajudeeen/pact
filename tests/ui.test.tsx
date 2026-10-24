// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Provider } from "../src/state";
import { App } from "../src/App";
import { Store } from "../server/store";
import { PactService } from "../server/service";
import { createApp } from "../server/app";
let db: Store;
afterEach(() => {
  cleanup();
  db?.close();
  vi.unstubAllGlobals();
});
function boot() {
  db = new Store();
  const service = new PactService(db);
  const app = createApp(service, "http://pact.test");
  let cookie = "";
  let completed: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    completed = resolve;
  });
  let hold = false,
    release: () => void = () => {};
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    if (input === "/api/previews" && hold)
      await new Promise<void>((r) => (release = r));
    const res = await app.request(input, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string>),
        origin: "http://pact.test",
        cookie,
      },
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    if (input === "/api/previews") completed();
    return res;
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <MemoryRouter initialEntries={["/p/btc-pullback"]}>
      <Provider>
        <App />
      </Provider>
    </MemoryRouter>,
  );
  return {
    settled,
    fetcher,
    hold: () => (hold = true),
    release: () => release(),
    service,
  };
}
async function start() {
  fireEvent.click(
    await screen.findByRole("button", { name: /Start a practice session/ }),
  );
  const select = await screen.findByRole("combobox");
  await waitFor(() =>
    expect(select.querySelectorAll("option")).toHaveLength(6),
  );
  return select;
}
describe("account-specific consent in the rendered app", () => {
  it("clears an existing preview and consent when the account changes", async () => {
    boot();
    const select = await start();
    const options = select.querySelectorAll("option");
    fireEvent.change(select, { target: { value: options[1].value } });
    fireEvent.click(screen.getByRole("button", { name: "Check my size" }));
    await screen.findByText("YOUR POSITION SIZE");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      (
        screen.getByRole("button", {
          name: "Approve practice order",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    fireEvent.change(select, { target: { value: options[2].value } });
    expect(screen.queryByText("YOUR POSITION SIZE")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve practice order" }),
    ).toBeNull();
  });
  it("discards a delayed preview response after account selection changes", async () => {
    const x = boot();
    const select = await start();
    const options = select.querySelectorAll("option");
    fireEvent.change(select, { target: { value: options[1].value } });
    x.hold();
    fireEvent.click(screen.getByRole("button", { name: "Check my size" }));
    await waitFor(() =>
      expect(x.fetcher.mock.calls.some((c) => c[0] === "/api/previews")).toBe(
        true,
      ),
    );
    fireEvent.change(select, { target: { value: options[2].value } });
    await act(async () => {
      x.release();
      await x.settled;
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Check my size" }),
      ).toBeDefined(),
    );
    expect(screen.queryByText("YOUR POSITION SIZE")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve practice order" }),
    ).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { TradingAccess } from "../src/components/TradingAccess";
import type { TradingReadiness } from "../src/core/readiness";
const wallet = "0x1111111111111111111111111111111111111111";
vi.mock("../src/state", () => ({
  useApp: () => ({
    session: { owner: wallet, mode: "testnet" },
    config: { testnetEnabled: true },
  }),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function report(): TradingReadiness {
  return {
    readOnly: true,
    chainId: 50383,
    owner: wallet,
    operator: wallet,
    market: "BTC-PERP",
    pool: wallet,
    checkedAt: Date.now(),
    validForMs: 20000,
    ready: true,
    checks: [
      {
        id: "margin",
        label: "Perps margin",
        status: "pass",
        detail: "25 USDso available",
      },
    ],
  };
}
it("expires a previously passed report and clears it when the market changes", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => report() })),
  );
  render(<TradingAccess />);
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Check testnet access" }),
    ),
  );
  expect(screen.getByText("ACCESS CHECKS PASSED")).toBeDefined();
  await act(async () => vi.advanceTimersByTime(20000));
  expect(screen.getByText("CHECK EXPIRED")).toBeDefined();
  expect(screen.queryByText("ACCESS CHECKS PASSED")).toBeNull();
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "ETH-PERP" },
  });
  expect(screen.queryByText("CHECK EXPIRED")).toBeNull();
});
it("discards an in-flight report when the selected market changes", async () => {
  let resolve!: (v: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
  );
  render(<TradingAccess />);
  fireEvent.click(screen.getByRole("button", { name: "Check testnet access" }));
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "ETH-PERP" },
  });
  await act(async () => resolve({ ok: true, json: async () => report() }));
  expect(screen.queryByText("ACCESS CHECKS PASSED")).toBeNull();
});

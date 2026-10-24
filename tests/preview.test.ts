import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewRuntime } from "../src/preview/runtime";
import type { Account, Intent, Plan, Receipt } from "../src/core/types";

afterEach(() => vi.restoreAllMocks());
function setup() {
  let now = 1800000000000;
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  let request = createPreviewRuntime(storage, () => now);
  return {
    get request() {
      return request;
    },
    advance: (ms: number) => {
      now += ms;
    },
    reopen: () => {
      request = createPreviewRuntime(storage, () => now);
    },
    async start() {
      await request("/auth/practice", { method: "POST" });
      return request<Account[]>("/accounts");
    },
    preview: (accountId: string) =>
      request<{ id: string; decision: Intent["decision"] }>("/previews", {
        method: "POST",
        body: { accountId, planId: "btc-pullback" },
      }),
  };
}
describe("browser-local Site preview boundaries", () => {
  it("completes practice with persistence and no network or chain claims", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const x = setup(),
      accounts = await x.start();
    const preview = await x.preview(accounts[4].id);
    const i = await x.request<Intent>("/intents", {
      method: "POST",
      body: { previewId: preview.id, consent: true },
    });
    x.advance(1500);
    expect((await x.request<Intent>("/intents/" + i.id)).state).toBe("unknown");
    x.reopen();
    x.advance(2000);
    expect((await x.request<Intent>("/intents/" + i.id)).state).toBe("open");
    await x.request("/intents/" + i.id + "/close", { method: "POST" });
    await x.request("/intents/" + i.id + "/close", { method: "POST" });
    const receipt = await x.request<Receipt>("/intents/" + i.id + "/receipt");
    expect(receipt.state).toBe("closed");
    expect(receipt.netPnl).toBe("0");
    expect(receipt.transactions).toEqual([]);
    expect(receipt.chainId).toBeNull();
    expect(receipt.fills).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the shared risk engine for late and stale refusals and thin sizing", async () => {
    const x = setup(),
      accounts = await x.start();
    expect((await x.preview(accounts[0].id)).decision.outcome).not.toBe(
      "blocked",
    );
    expect((await x.preview(accounts[1].id)).decision.reason).toBe(
      "OUTSIDE_ENTRY",
    );
    expect((await x.preview(accounts[2].id)).decision.reason).toBe(
      "STALE_DATA",
    );
    expect((await x.preview(accounts[3].id)).decision.quantity).toBe("0.00013");
  });
  it("requires consent and deduplicates repeated approvals", async () => {
    const x = setup(),
      accounts = await x.start(),
      v = await x.preview(accounts[0].id);
    await expect(
      x.request("/intents", {
        method: "POST",
        body: { previewId: v.id, consent: false },
      }),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    const body = { previewId: v.id, consent: true };
    const i = await x.request<Intent>("/intents", { method: "POST", body });
    expect(
      (await x.request<Intent>("/intents", { method: "POST", body })).id,
    ).toBe(i.id);
    expect(await x.request<Intent[]>("/intents")).toHaveLength(1);
  });
  it("does not accept an expired preview", async () => {
    const x = setup(),
      accounts = await x.start(),
      v = await x.preview(accounts[0].id);
    x.advance(16000);
    await expect(
      x.request("/intents", {
        method: "POST",
        body: { previewId: v.id, consent: true },
      }),
    ).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
  });
  it("does not let a browser preview request enable wallet or testnet execution", async () => {
    const x = setup();
    await x.start();
    for (const path of ["/auth/challenge", "/auth/verify", "/accounts"])
      await expect(
        x.request(path, { method: "POST", body: { mode: "testnet" } }),
      ).rejects.toMatchObject({ code: "PREVIEW_ONLY" });
    const plans = await x.request<Plan[]>("/plans"),
      { id, version, digest, author, createdAt, revoked, ...terms } = plans[0];
    await expect(
      x.request("/plans", {
        method: "POST",
        body: { ...terms, mode: "testnet" },
      }),
    ).rejects.toMatchObject({ code: "PREVIEW_ONLY" });
  });
  it("publishes practice setups and rejects invalid geometry with the shared schema", async () => {
    const x = setup();
    await x.start();
    const plans = await x.request<Plan[]>("/plans"),
      { id, version, digest, author, createdAt, revoked, ...terms } = plans[0];
    await expect(
      x.request("/plans", {
        method: "POST",
        body: { ...terms, stop: "999999" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const p = await x.request<Plan>("/plans", {
      method: "POST",
      body: { ...terms, title: "My practice setup" },
    });
    expect(p.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(p.mode).toBe("replay");
    x.reopen();
    expect((await x.request<Plan>("/plans/" + p.id)).title).toBe(
      "My practice setup",
    );
  });
});

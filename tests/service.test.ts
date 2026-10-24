import { afterEach, describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store";
import { PactService } from "../server/service";
import { receiptOf } from "../src/core/receipt";
import { DEFAULT_POLICY, type Plan } from "../src/core/types";
import type { Venue, PreparedAction } from "../server/venue";
import { replaySnapshot } from "../server/replay";
let stores: Store[] = [];
afterEach(() => {
  for (const s of stores) s.close();
  stores = [];
});
function setup(path = ":memory:") {
  let now = 1800000000000;
  const store = new Store(path);
  stores.push(store);
  const service = new PactService(store, null, false, () => now),
    a = service.addAccount("member", "replay");
  return { service, a, store, advance: (ms: number) => (now += ms) };
}
describe("durable approval and recovery", () => {
  it("turns repeated approvals into one intent and one submission", async () => {
    const { service, a, advance } = setup();
    const v = await service.preview("member", "btc-pullback", a.id);
    const first = service.approve("member", v.id, true),
      again = service.approve("member", v.id, true);
    expect(again.id).toBe(first.id);
    await service.tick();
    advance(2000);
    await service.tick();
    const i = service.intent("member", first.id);
    expect(i.state).toBe("open");
    expect(i.events.filter((e) => e.type === "submit_recorded")).toHaveLength(
      1,
    );
    expect(i.fills).toHaveLength(1);
  });
  it("reconciles a lost response across a real database reopen without resending", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pact-"));
    const path = join(dir, "db.sqlite");
    const { service, store, advance } = setup(path);
    const a = service.addAccount("member", "replay", "lost-response");
    const p = await service.preview("member", "btc-pullback", a.id),
      i = service.approve("member", p.id, true);
    await service.tick();
    expect(service.intent("member", i.id).state).toBe("unknown");
    store.close();
    stores = [];
    const db = new Store(path);
    stores.push(db);
    const recovered = new PactService(db, null, false, () => 1800000004000);
    await recovered.tick();
    const r = recovered.intent("member", i.id);
    expect(r.state).toBe("open");
    expect(r.fills).toHaveLength(1);
    expect(r.events.filter((e) => e.type === "submit_recorded")).toHaveLength(
      1,
    );
    db.close();
    stores = [];
    rmSync(dir, { recursive: true, force: true });
  });
  it("rejects other users’ accounts, previews and receipts", async () => {
    const { service, a } = setup();
    const p = await service.preview("member", "btc-pullback", a.id);
    expect(() => service.approve("stranger", p.id, true)).toThrow(
      "Preview not found",
    );
    await expect(
      service.preview("stranger", "btc-pullback", a.id),
    ).rejects.toThrow("Account not found");
    const i = service.approve("member", p.id, true);
    expect(() => service.intent("stranger", i.id)).toThrow("Order not found");
  });
  it("requires consent and fresh preview", async () => {
    const { service, a, advance } = setup();
    const p = await service.preview("member", "btc-pullback", a.id);
    expect(() => service.approve("member", p.id, false)).toThrow("Confirm");
    advance(16000);
    expect(() => service.approve("member", p.id, true)).toThrow("expired");
  });
  it("invalidates old previews after policy changes", async () => {
    const { service, a } = setup();
    const p = await service.preview("member", "btc-pullback", a.id);
    service.setPolicy("member", { ...DEFAULT_POLICY, risk: "5" });
    expect(() => service.approve("member", p.id, true)).toThrow(
      "rules changed",
    );
  });
  it("rejects withdrawn plans even after a valid preview", async () => {
    const { service, a } = setup();
    const original = service.plan("btc-pullback");
    const p = service.publish("member", {
      title: "My original setup",
      market: original.market,
      direction: original.direction,
      entryMin: original.entryMin,
      entryMax: original.entryMax,
      stop: original.stop,
      target: original.target,
      expiresAt: original.expiresAt,
      rationale: "Own setup",
      mode: "replay",
    });
    const v = await service.preview("member", p.id, a.id);
    service.revoke("member", p.id);
    expect(() => service.approve("member", v.id, true)).toThrow(
      "changed or expired",
    );
  });
  it("blocks stale approval before any simulated submit", async () => {
    const { service, a, advance } = setup();
    const p = await service.preview("member", "btc-pullback", a.id);
    const i = service.approve("member", p.id, true);
    advance(20000);
    await service.tick();
    expect(service.intent("member", i.id).state).toBe("blocked");
    expect(service.intent("member", i.id).fills).toHaveLength(0);
  });
  it("reserves an account before a second setup can be approved", async () => {
    const { service, a } = setup();
    const one = await service.preview("member", "btc-pullback", a.id),
      two = await service.preview("member", "eth-range", a.id);
    service.approve("member", one.id, true);
    expect(() => service.approve("member", two.id, true)).toThrow(
      "existing order",
    );
  });
  it("closes once and produces a flat simulated result", async () => {
    const { service, a, advance } = setup();
    const p = await service.preview("member", "btc-pullback", a.id),
      i = service.approve("member", p.id, true);
    await service.tick();
    advance(2000);
    await service.tick();
    await service.close("member", i.id);
    await service.close("member", i.id);
    const r = receiptOf(service.intent("member", i.id));
    expect(r.netPnl).toBe("0");
    expect(r.fills).toHaveLength(2);
    expect(r.transactions).toEqual([]);
    expect(r.chainId).toBeNull();
  });
});
describe("testnet adapter boundary", () => {
  it("persists signed transaction before a lost broadcast reply and never prepares a second entry", async () => {
    let now = 1800000000000;
    const db = new Store();
    stores.push(db);
    let sends = 0,
      prepares = 0;
    const action: PreparedAction = {
      hash: "0x" + "ab".repeat(32),
      raw: "0x01",
      pool: "0x" + "11".repeat(20),
      nonce: 0,
      baseDecimals: 8,
      quoteDecimals: 18,
      role: "entry",
    };
    const venue: Venue = {
      position: async () => ({
        position: "0",
        mark: "67595",
        markValid: true,
        observedAt: now,
      }),
      snapshot: async (p, a) =>
        replaySnapshot(p, { ...a, mode: "replay" }, now),
      prepare: async () => {
        prepares++;
        return action;
      },
      broadcast: async (a) => {
        sends++;
        expect(
          db.db
            .prepare("SELECT body FROM actions WHERE intent IS NOT NULL")
            .get(),
        ).toBeDefined();
        throw new Error("lost RPC response");
      },
      observe: async () => ({ state: "pending", fills: [], detail: "pending" }),
      shutdown: async () => {},
    };
    const service = new PactService(db, venue, true, () => now),
      a = service.addAccount("member", "testnet");
    const original = service.plan("btc-pullback"),
      p = service.publish("member", {
        title: "Testnet integration boundary",
        market: original.market,
        direction: "long",
        entryMin: original.entryMin,
        entryMax: original.entryMax,
        stop: original.stop,
        target: original.target,
        expiresAt: original.expiresAt,
        rationale: "Fake adapter, no network calls.",
        mode: "testnet",
      });
    const preview = await service.preview("member", p.id, a.id);
    expect(Number(preview.decision.notional)).toBeLessThanOrEqual(25);
    const i = service.approve("member", preview.id, true);
    await service.tick();
    expect(service.intent("member", i.id).state).toBe("unknown");
    now += 1000;
    await service.tick();
    await service.tick();
    expect(prepares).toBe(1);
    expect(sends).toBe(1);
    expect(service.intent("member", i.id).txHash).toBe(action.hash);
    expect(receiptOf(service.intent("member", i.id)).netPnl).toBeNull();
  });
  it("does not mutate default policy when applying the testnet cap", () => {
    const { service } = setup();
    const p = service.policy("x");
    p.maxNotional = "25";
    expect(service.policy("y").maxNotional).toBe("500");
  });
});

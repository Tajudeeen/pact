import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Decimal from "decimal.js";
import { receiptOf } from "../src/core/receipt";
import { setup, folders, cleanupExecution } from "./helpers/execution";
afterEach(cleanupExecution);

describe("testnet execution and recovery without network calls", () => {
  it("does not persist or broadcast a close signed after its position observation expires", async () => {
    const x = setup();
    await x.open();
    x.delaySigning(5001);
    await x.service.close("owner", x.intent.id);
    expect(x.intent.state).toBe("attention");
    expect(x.intent.events.at(-1)?.type).toBe("close_check_expired");
    expect(x.service.action(x.intent, "close")).toBeUndefined();
    expect(x.sends).toBe(1);
    expect(x.service.exposure("owner", x.account.id).reserved).toBe(
      x.intent.decision.plannedLoss,
    );
    x.delaySigning(0);
    await x.service.recover("owner", x.intent.id);
    expect(x.intent.state).toBe("open");
    await x.service.close("owner", x.intent.id);
    expect(x.intent.state).toBe("closing");
    expect(x.sends).toBe(2);
  });
  it("does not broadcast when signing crosses the approval deadline even with a fresh quote", async () => {
    const x = setup();
    await x.approve();
    x.advance(14000);
    x.delaySigning(2000);
    await x.service.tick();
    expect(x.intent.state).toBe("blocked");
    expect(x.intent.events.at(-1)?.type).toBe("stale_before_send");
    expect(x.sends).toBe(0);
    expect(x.service.action(x.intent, "entry")).toBeUndefined();
  });
  it("signs the exact fresh decision while preserving the original approval", async () => {
    const x = setup();
    const original = structuredClone((await x.approve()).decision);
    x.setQuote({ ask: "67590", bid: "67580", fundingHourly: "0.00002" });
    await x.service.tick();
    const sent = x.prepared[0].intent;
    expect(sent.decision).toEqual(original);
    expect(sent.execution!.quantity).toBe(original.quantity);
    expect(new Decimal(sent.execution!.limit).lt(original.limit)).toBe(true);
    expect(
      new Decimal(sent.execution!.plannedLoss).lte(original.plannedLoss),
    ).toBe(true);
    const oldPriceRisk = new Decimal(original.stopLoss)
      .plus(original.slippageReserve)
      .plus(
        new Decimal(original.quantity)
          .mul(original.limit)
          .mul("0.00002")
          .mul(8),
      );
    expect(oldPriceRisk.gt(original.plannedLoss)).toBe(true);
    expect(x.intent.execution).toEqual(sent.execution);
    expect(x.intent.state).toBe("submitted");
  });
  it("blocks a smaller fresh allowance before signing", async () => {
    const x = setup();
    await x.approve();
    x.setQuote({ depth: "0.00013" });
    await x.service.tick();
    expect(x.intent.state).toBe("blocked");
    expect(x.prepared).toHaveLength(0);
  });
  it.each([
    { mark: "0", markValid: false },
    { mark: "67595", markValid: false },
    { mark: "NaN", markValid: true },
    { mark: "0", markValid: true },
    { observedAt: 1800000000000 - 6000 },
    { observedAt: 1800000000000 + 2000 },
  ])(
    "pauses unsafe monitoring and recovers when observations become valid: %j",
    async (bad) => {
      const x = setup();
      await x.open();
      x.setPosition(bad);
      await x.service.tick();
      expect(x.intent.state).toBe("attention");
      expect(x.intent.protection).toBe("degraded");
      expect(x.prepared.filter((a) => a.role === "close")).toHaveLength(0);
      const events = x.intent.events.length;
      await x.service.tick();
      await x.service.tick();
      expect(x.intent.events).toHaveLength(events);
      x.setPosition({});
      await x.service.tick();
      expect(x.intent.state).toBe("open");
      expect(x.intent.error).toBeUndefined();
      expect(x.prepared).toHaveLength(1);
    },
  );
  it("keeps monitoring an open position independently of entry restrictions", async () => {
    const x = setup();
    await x.open();
    x.setQuote({ permitted: false, reason: "New entries unavailable" });
    await x.service.tick();
    expect(x.intent.state).toBe("open");
    x.setPosition({ mark: x.plan.stop });
    await x.service.tick();
    expect(x.intent.state).toBe("closing");
    expect(x.prepared.filter((a) => a.role === "close")).toHaveLength(1);
    await x.service.close("owner", x.intent.id);
    expect(x.prepared.filter((a) => a.role === "close")).toHaveLength(1);
  });
  it("times a fresh close from its own persisted submission, not the old entry", async () => {
    const x = setup();
    await x.open();
    x.advance(3600000);
    x.observations.close = { state: "pending", fills: [], detail: "pending" };
    await x.service.close("owner", x.intent.id);
    await x.service.tick();
    expect(x.intent.state).toBe("closing");
    expect(x.service.action(x.intent, "close")!.recordedAt).toBe(1800003600000);
  });
  it("uses the legacy close event timestamp without guessing from approval age", async () => {
    const x = setup();
    await x.open();
    x.advance(3600000);
    x.observations.close = { state: "pending", fills: [], detail: "pending" };
    await x.service.close("owner", x.intent.id);
    const old = x.service.action(x.intent, "close")!;
    delete old.recordedAt;
    x.db.db
      .prepare("UPDATE actions SET body=? WHERE intent=? AND role='close'")
      .run(JSON.stringify(old), x.intent.id);
    await x.service.tick();
    expect(x.intent.state).toBe("closing");
    x.advance(120001);
    await x.service.tick();
    expect(x.intent.state).toBe("attention");
  });
  it("recovers a timed-out close after reopening SQLite without observing or sending the entry again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pact-close-"));
    folders.push(dir);
    const x = setup(join(dir, "pact.sqlite"));
    await x.open();
    x.observations.close = { state: "pending", fills: [], detail: "pending" };
    await x.service.close("owner", x.intent.id);
    x.advance(120001);
    await x.service.tick();
    expect(x.intent.state).toBe("attention");
    expect(
      new Decimal(x.service.exposure("owner", x.account.id).reserved).gt(0),
    ).toBe(true);
    x.restart();
    x.observations.entry = {
      state: "reverted",
      fills: [],
      detail: "Must never be consulted",
    };
    delete x.observations.close;
    x.setPosition({ position: "0" });
    await x.service.tick();
    expect(x.intent.state).toBe("closed");
    expect(x.intent.fills.filter((f) => f.role === "close")).toHaveLength(1);
    expect(x.prepared).toHaveLength(2);
    expect(x.sends).toBe(2);
    expect(receiptOf(x.intent).netPnl).toBeNull();
  });
  it("does not call a matched close fill a flat position until the account read confirms it", async () => {
    const x = setup();
    await x.open();
    await x.service.close("owner", x.intent.id);
    x.setPosition({ position: "0.00001" });
    await x.service.tick();
    expect(x.intent.state).toBe("attention");
    expect(x.intent.error).toContain("not flat");
    expect(receiptOf(x.intent).grossPnl).toBeNull();
    expect(x.service.exposure("owner", x.account.id).reserved).toBe(
      x.intent.decision.plannedLoss,
    );
    x.setPosition({ position: "0" });
    await x.service.recover("owner", x.intent.id);
    expect(x.intent.state).toBe("closed");
    expect(x.prepared).toHaveLength(2);
    expect(x.intent.fills).toHaveLength(2);
  });
  it("continues checking a lost entry response after attention without a replacement", async () => {
    const x = setup();
    await x.approve();
    x.failBroadcast();
    x.observations.entry = { state: "pending", fills: [], detail: "pending" };
    await x.service.tick();
    expect(x.intent.state).toBe("unknown");
    x.advance(120001);
    await x.service.tick();
    expect(x.intent.state).toBe("attention");
    delete x.observations.entry;
    await x.service.tick();
    expect(x.intent.state).toBe("open");
    expect(x.sends).toBe(1);
    expect(x.prepared).toHaveLength(1);
  });
  it("recovers a temporary position RPC failure without losing the observed fill", async () => {
    const x = setup();
    await x.approve();
    await x.service.tick();
    x.failPosition(true);
    await x.service.tick();
    expect(x.intent.fills).toHaveLength(1);
    x.failPosition(false);
    await x.service.tick();
    expect(x.intent.state).toBe("open");
    expect(x.prepared).toHaveLength(1);
  });
  it("will not resume monitoring or close an externally changed position", async () => {
    const x = setup();
    await x.open();
    x.setPosition({ position: "-0.001", mark: x.plan.stop });
    await x.service.tick();
    await x.service.recover("owner", x.intent.id);
    expect(x.intent.state).toBe("attention");
    expect(x.intent.error).toContain("outside Pact");
    expect(x.prepared).toHaveLength(1);
  });
  it("does not sign a close while another account's operator transaction is unresolved", async () => {
    const x = setup();
    await x.open();
    const other = {
      ...x.intent,
      id: "other",
      owner: "other",
      accountId: "other",
      state: "unknown" as const,
    };
    x.service.save(other);
    await expect(x.service.close("owner", x.intent.id)).rejects.toThrow(
      "Another operator transaction",
    );
    expect(x.prepared).toHaveLength(1);
  });
  it("keeps a reverted close visible without automatically signing a retry", async () => {
    const x = setup();
    await x.open();
    x.observations.close = { state: "reverted", fills: [], detail: "reverted" };
    await x.service.close("owner", x.intent.id);
    await x.service.tick();
    await x.service.recover("owner", x.intent.id);
    expect(x.intent.state).toBe("attention");
    expect(x.intent.error).toContain("close reverted");
    expect(x.prepared).toHaveLength(2);
  });
  it.each(["quantity", "hash", "price", "role"])(
    "refuses an unexpected entry fill %s",
    async (kind) => {
      const x = setup();
      await x.approve();
      await x.service.tick();
      const action = x.service.action(x.intent, "entry")!;
      x.observations.entry = {
        state: "filled",
        detail: "bad evidence",
        fills: [
          {
            role: kind === "role" ? "close" : "entry",
            quantity: kind === "quantity" ? "1" : x.intent.decision.quantity,
            price: kind === "price" ? "999999" : x.intent.decision.limit,
            fee: "0",
            at: 1800000000000,
            txHash: kind === "hash" ? "wrong" : action.hash,
          },
        ],
      };
      await x.service.tick();
      expect(x.intent.state).toBe("attention");
      expect(x.intent.events.at(-1)?.type).toBe("fill_size_mismatch");
      expect(x.intent.fills).toHaveLength(0);
    },
  );
});

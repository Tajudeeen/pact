import { afterEach, it, expect, vi } from "vitest";
import { setup, cleanupExecution } from "./helpers/execution";
import { settlementFixture } from "./helpers/settlement";
import { scanSettlement } from "../server/settlement";
import { receiptOf } from "../src/core/receipt";
afterEach(cleanupExecution);
async function closed() {
  const x = setup();
  await x.open();
  await x.service.close("owner", x.intent.id);
  x.setPosition({ position: "0" });
  await x.service.tick();
  return x;
}
it("holds unknown costs, persists verified results and rechecks before the next entry", async () => {
  const x = await closed(),
    l = settlementFixture(),
    ledger = await scanSettlement(l.reader, l.ctx);
  expect(x.service.exposure("owner", x.account.id).unverifiedLoss).toBe(true);
  x.venue.settlement = vi.fn(async () => ledger);
  await x.service.settle("owner", x.intent.id);
  expect(receiptOf(x.intent)).toMatchObject({
    grossPnl: "3",
    tradingFees: "1",
    rebates: "0.2",
    fundingPaid: "0.5",
    netPnl: "1.7",
  });
  expect(x.service.exposure("owner", x.account.id).unverifiedLoss).toBe(false);
  x.venue.settlement = vi.fn(async () => {
    throw new Error("Anchor changed");
  });
  const preview = await x.service.preview("owner", x.plan.id, x.account.id);
  expect(preview.decision.reason).toBe("ACCOUNTING_INCOMPLETE");
  expect(receiptOf(x.intent).netPnl).toBeNull();
  expect(x.sends).toBe(2);
});
it("uses actual USDso loss and preserves the close day when accounting updates later", async () => {
  const x = await closed(),
    l = settlementFixture(),
    ledger = await scanSettlement(l.reader, l.ctx);
  x.venue.settlement = async () => ({
    ...ledger,
    realizedPnl: "-3",
    fundingPaid: "-0.5",
  });
  await x.service.settle("owner", x.intent.id);
  expect(receiptOf(x.intent).netPnl).toBe("-3.3");
  expect(x.service.exposure("owner", x.account.id).dailyLoss).toBe("3.3");
  x.advance(86400000);
  await x.service.settle("owner", x.intent.id);
  expect(x.service.exposure("owner", x.account.id).dailyLoss).toBe("0");
});
it("retries missing logs without changing closed state or creating another order", async () => {
  const x = await closed(),
    l = settlementFixture(),
    ledger = await scanSettlement(l.reader, l.ctx);
  const scan = vi.fn(async () => ({ ...ledger, status: "pending" as const }));
  x.venue.settlement = scan;
  await x.service.tick();
  expect(scan).toHaveBeenCalledTimes(1);
  await x.service.tick();
  expect(scan).toHaveBeenCalledTimes(1);
  x.advance(2001);
  await x.service.tick();
  expect(scan).toHaveBeenCalledTimes(2);
  expect(x.intent.state).toBe("closed");
  expect(x.sends).toBe(2);
  await expect(x.service.settle("stranger", x.intent.id)).rejects.toThrow(
    "Order not found",
  );
});

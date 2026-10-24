import { it, expect } from "vitest";
import { scanSettlement } from "../server/settlement";
import { settlementFixture, bankLog, bh } from "./helpers/settlement";
it("attributes actual fees, rebates, signed funding and bank realized PnL", async () => {
  const x = settlementFixture();
  const s = await scanSettlement(x.reader, x.ctx);
  expect(s.status).toBe("complete");
  expect(s).toMatchObject({
    fees: "1",
    rebates: "0.2",
    fundingPaid: "0.5",
    realizedPnl: "3",
    coveredThrough: "12",
  });
});
it("resumes an exact persisted block cursor without charging any event twice", async () => {
  const x = settlementFixture();
  const seed = await scanSettlement(x.reader, x.ctx);
  seed.coveredThrough = null;
  seed.coveredHash = null;
  seed.events = [];
  seed.pageSize = 1;
  seed.status = "pending";
  let s = await scanSettlement(x.reader, x.ctx, seed);
  expect(s.coveredThrough).toBe("10");
  // A first page with its real persisted prefix can be resumed after JSON round-trip.
  const first = {
    ...seed,
    coveredThrough: "10",
    coveredHash: bh(10),
    events: seed.events.concat(
      (await scanSettlement(x.reader, x.ctx)).events.filter(
        (e) => e.block === "10",
      ),
    ),
  };
  s = await scanSettlement(x.reader, x.ctx, JSON.parse(JSON.stringify(first)));
  expect(s.status).toBe("pending");
  expect(s.coveredThrough).toBe("11");
  s = await scanSettlement(x.reader, x.ctx, JSON.parse(JSON.stringify(s)));
  expect(s.status).toBe("complete");
  expect(s.fees).toBe("1");
});
it("keeps zero costs explicit only after complete position-event coverage", async () => {
  const x = settlementFixture();
  x.setLogs(
    x.logs.filter(
      (l) => (l.logIndex === 0 && l.blockNumber === 10n) || l.logIndex === 2,
    ),
  );
  const s = await scanSettlement(x.reader, x.ctx);
  expect(s.status).toBe("complete");
  expect(s.fees).toBe("0");
  expect(s.fundingPaid).toBe("0");
});
it("keeps a funding credit negative instead of treating it as a payment", async () => {
  const x = settlementFixture();
  x.setLogs(
    x.logs.map((l) =>
      l.blockNumber === 11n
        ? bankLog("FundingSettled", 11, bh(99), 0, -50n)
        : l,
    ),
  );
  expect((await scanSettlement(x.reader, x.ctx)).fundingPaid).toBe("-0.5");
});
it("does not advance coverage on an RPC failure", async () => {
  const x = settlementFixture();
  x.getLogs.mockRejectedValue(new Error("offline"));
  const s = await scanSettlement(x.reader, x.ctx);
  expect(s.status).toBe("pending");
  expect(s.coveredThrough).toBeNull();
  expect(s.pageSize).toBe(1000);
  const retry = await scanSettlement(
    x.reader,
    x.ctx,
    JSON.parse(JSON.stringify(s)),
  );
  expect(retry.pageSize).toBe(500);
  expect(retry.coveredThrough).toBeNull();
});
it.each(["reorg", "duplicate", "outside", "missing-close", "removed"])(
  "rejects %s without claiming complete accounting",
  async (kind) => {
    const x = settlementFixture();
    if (kind === "reorg") x.reader.getBlock = async () => ({ hash: bh(123) });
    if (kind === "duplicate") x.setLogs([...x.logs, x.logs[0]]);
    if (kind === "outside")
      x.setLogs([
        ...x.logs,
        bankLog("PositionUpdated", 11, bh(98), 1, 0n, 10n),
      ]);
    if (kind === "missing-close") x.setLogs(x.logs.slice(0, -1));
    if (kind === "removed")
      x.setLogs([{ ...x.logs[0], removed: true }, ...x.logs.slice(1)]);
    await expect(scanSettlement(x.reader, x.ctx)).rejects.toThrow(
      /canonical|anchors|Duplicate|Outside|full close|Incomplete/,
    );
  },
);

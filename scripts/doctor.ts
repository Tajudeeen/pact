import { DreamDex, CHAIN_ID } from "../server/dreamdex";
import { mkdirSync, writeFileSync } from "node:fs";
const venue = new DreamDex();
const checks: { name: string; ok: boolean; detail: string }[] = [];
const bounded = async <T>(p: Promise<T>): Promise<T> => {
  let t: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        t = setTimeout(
          () => reject(new Error("Timed out after 15 seconds.")),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(t!);
  }
};
try {
  try {
    const chain = await bounded(venue.publicClient.getChainId());
    checks.push({
      name: "RPC chain",
      ok: chain === CHAIN_ID,
      detail: String(chain),
    });
  } catch (e) {
    checks.push({
      name: "RPC chain",
      ok: false,
      detail: (e as Error).message.split("\n")[0],
    });
  }
  try {
    const markets = await bounded(venue.sdk.client.listPerpMarkets());
    checks.push({
      name: "SDK market discovery",
      ok: markets.length > 0,
      detail: `${markets.length} perp markets`,
    });
    if (markets[0]) {
      try {
        const state = await bounded(
          venue.sdk.client.getPerpState(markets[0].poolAddress),
        );
        checks.push({
          name: "Live mark",
          ok: state.markPriceOk,
          detail: `Market ${markets[0].baseSymbol}, mark valid: ${state.markPriceOk}`,
        });
      } catch (e) {
        checks.push({
          name: "Live mark / WebSocket transport",
          ok: false,
          detail: (e as Error).message.split("\n")[0],
        });
      }
    }
  } catch (e) {
    checks.push({
      name: "SDK market discovery",
      ok: false,
      detail: (e as Error).message.split("\n")[0],
    });
  }
  const report = {
    at: new Date().toISOString(),
    sdk: "0.32.1",
    network: "Somnia Tokyo testnet",
    chainId: CHAIN_ID,
    readOnly: true,
    checks,
    ordersPlaced: 0,
    note: "Connectivity evidence only. Does not establish trade execution.",
  };
  mkdirSync(".data", { recursive: true });
  writeFileSync(".data/doctor.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
} finally {
  await venue.shutdown();
}

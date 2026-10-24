import { isAddress, type Address } from "viem";
import { DreamDex } from "../server/dreamdex";
const [owner, operator, market = "BTC-PERP"] = process.argv.slice(2);
if (
  !owner ||
  !operator ||
  !isAddress(owner) ||
  !isAddress(operator) ||
  !["BTC-PERP", "ETH-PERP"].includes(market)
) {
  console.error(
    "Usage: pnpm run testnet:readiness <owner-address> <operator-address> [BTC-PERP|ETH-PERP]. Addresses only. No private key.",
  );
  process.exitCode = 1;
} else {
  const venue = new DreamDex();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      venue.readiness(owner, market, operator as Address),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Readiness timed out. No access is claimed.")),
          20000,
        );
      }),
    ]);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 1;
  } catch (e) {
    console.error(
      JSON.stringify({
        readOnly: true,
        result: "unavailable",
        message: (e as Error).message.split("\n")[0],
      }),
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    await venue.shutdown();
  }
}

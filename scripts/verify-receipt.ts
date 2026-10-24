import { readFileSync, statSync } from "node:fs";
import { DreamDex } from "../server/dreamdex";
import { verifyReceipt } from "../server/verify-receipt";
const file = process.argv[2];
if (!file) {
  console.error("Usage: pnpm run verify:receipt /path/to/pact-receipt.json");
  process.exitCode = 1;
} else {
  const venue = new DreamDex();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (statSync(file).size > 1048576)
      throw new Error("Receipt exceeds 1 MiB.");
    const verification = verifyReceipt(JSON.parse(readFileSync(file, "utf8")), {
      reader: venue.publicClient,
      market: (symbol) => venue.market(symbol),
    });
    const result = await Promise.race([
      verification,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Receipt verification timed out after 120 seconds. No verification is claimed.",
              ),
            ),
          120000,
        );
      }),
    ]);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          result: "unverified",
          reason: (error as Error).message.split("\n")[0],
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    await venue.shutdown();
  }
}

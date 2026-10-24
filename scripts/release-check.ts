import { assertExecutionNetwork, RELEASE } from "../server/release";
const network = process.argv[2] ?? "tokyo-testnet";
try {
  assertExecutionNetwork(network);
  console.log(
    JSON.stringify(
      {
        network,
        supported: true,
        liveExecutionVerified: false,
        mainnet: RELEASE,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        network,
        supported: false,
        reason: (error as Error).message,
        blockers: RELEASE.blockers,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

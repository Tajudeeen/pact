import { serve } from "@hono/node-server";
import { createPactConcordiumFacilitator } from "./runtime";
import { createPactFacilitatorHttpApp } from "./http";

try {
  process.loadEnvFile("server/facilitator/.env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to start the Concordium facilitator.`);
  return value;
}

const port = Number(process.env.PORT ?? 8788);
const facilitator = await createPactConcordiumFacilitator({
  sponsorAddress: requiredEnv("CCD_FACILITATOR_ADDRESS"),
  sponsorPrivateKey: requiredEnv("CCD_FACILITATOR_PRIVATE_KEY"),
  finalizationTimeoutMs: Number(process.env.CCD_FINALIZATION_TIMEOUT_MS ?? 60_000),
  resourceUrl: requiredEnv("CCD_FACILITATOR_RESOURCE_URL"),
  payTo: requiredEnv("CCD_FACILITATOR_PAY_TO"),
  amount: requiredEnv("CCD_FACILITATOR_AMOUNT_ATOMIC"),
  asset: process.env.CCD_FACILITATOR_ASSET ?? "CCD",
});
const app = createPactFacilitatorHttpApp(facilitator, {
  authToken: requiredEnv("X402_FACILITATOR_TOKEN"),
});
const server = serve(
  { fetch: app.fetch, hostname: "0.0.0.0", port },
  () => console.log(`Pact Concordium facilitator listening on ${port}.`),
);

async function stop() {
  server.close();
  process.exit(0);
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());

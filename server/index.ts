import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Store } from "./store";
import { PactService } from "./service";
import { createApp } from "./app";
import { DreamDex } from "./dreamdex";
import { existsSync } from "node:fs";
import { MarketFeed, readQuotes } from "./market-feed";
import { createPactAccessRuntime } from "./access/runtime";
import { createPactAccessHttpRoutes } from "./access/http";
import { FileProtectedResource } from "./access/file-resource";
const port = Number(process.env.PORT ?? 8787);
const origin =
  process.env.PACT_ORIGIN ??
  (process.env.NODE_ENV === "production"
    ? `http://localhost:${port}`
    : "http://localhost:5173");

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when PACT_ACCESS_ENABLED=true.`);
  return value;
}

const enabled = process.env.PACT_TESTNET_TRADING === "true";
const key = process.env.PACT_OPERATOR_PRIVATE_KEY;
if (enabled && (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)))
  throw new Error(
    "Testnet trading requires a dedicated PACT_OPERATOR_PRIVATE_KEY. Never use the owner key.",
  );

const store = new Store(process.env.PACT_DATABASE ?? ".data/pact.sqlite");
const venue = enabled ? new DreamDex(key as `0x${string}`) : null;
const service = new PactService(store, venue, enabled);
const marketFeed = new MarketFeed(() => readQuotes(() => new DreamDex()));

const pactAccessEnabled = process.env.PACT_ACCESS_ENABLED === "true";
const pactAccess = pactAccessEnabled
  ? await createPactAccessRuntime(store, {
      sellerId: requiredEnv("PACT_ACCESS_SELLER_ID"),
      resourceUrl: requiredEnv("PACT_ACCESS_RESOURCE_URL"),
      routePath: process.env.PACT_ACCESS_ROUTE ?? "/api/access/resource",
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
      registryId: requiredEnv("CONCORDIUM_AGENT_REGISTRY_ID"),
      registryMcpUrl: process.env.CONCORDIUM_AGENT_REGISTRY_MCP_URL,
      facilitatorUrl: requiredEnv("X402_FACILITATOR_URL"),
      facilitatorAuthToken: requiredEnv("X402_FACILITATOR_TOKEN"),
      payTo: requiredEnv("PACT_SELLER_PAY_TO"),
      amount: requiredEnv("PACT_ACCESS_PRICE_ATOMIC"),
      asset: process.env.PACT_ACCESS_ASSET ?? "CCD",
      description: process.env.PACT_ACCESS_DESCRIPTION ?? "Protected data resource",
      mimeType: process.env.PACT_ACCESS_MIME_TYPE ?? "application/octet-stream",
      resource: new FileProtectedResource(
        process.env.PACT_ACCESS_RESOURCE_ROOT ?? ".data/protected",
        requiredEnv("PACT_ACCESS_RESOURCE_FILE"),
      ),
    })
  : null;

const pactAccessRoutes = pactAccess
  ? createPactAccessHttpRoutes(pactAccess, {
      routePath: process.env.PACT_ACCESS_ROUTE ?? "/api/access/resource",
      mimeType: process.env.PACT_ACCESS_MIME_TYPE ?? "application/octet-stream",
    })
  : undefined;

const app = createApp(
  service,
  origin,
  venue?.key?.address ?? null,
  undefined,
  undefined,
  () => marketFeed.read(),
  pactAccessRoutes
    ? {
        app: pactAccessRoutes,
        routePath: process.env.PACT_ACCESS_ROUTE ?? "/api/access/resource",
      }
    : undefined,
);
app.get("*", async (c, next) => {
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: wss:; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  await next();
});
if (existsSync("dist/index.html")) {
  app.get("*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}
const server = serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, () =>
  console.log(
    `Pact listening on ${port}. Testnet execution ${enabled ? "configured" : "disabled"}. Pact Access ${pactAccessEnabled ? "enabled" : "disabled"}.`,
  ),
);
const timer = setInterval(() => void service.tick(), 1000);
void service.tick();

async function stop() {
  clearInterval(timer);
  server.close();
  await venue?.shutdown();
  await pactAccess?.shutdown();
  store.close();
  process.exit(0);
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());

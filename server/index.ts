import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Store } from "./store";
import { PactService } from "./service";
import { createApp } from "./app";
import { DreamDex } from "./dreamdex";
import { existsSync } from "node:fs";
const port = Number(process.env.PORT ?? 8787),
  origin =
    process.env.PACT_ORIGIN ??
    (process.env.NODE_ENV === "production"
      ? `http://localhost:${port}`
      : "http://localhost:5173");
const enabled = process.env.PACT_TESTNET_TRADING === "true",
  key = process.env.PACT_OPERATOR_PRIVATE_KEY;
if (enabled && (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)))
  throw new Error(
    "Testnet trading requires a dedicated PACT_OPERATOR_PRIVATE_KEY. Never use the owner key.",
  );
const store = new Store(process.env.PACT_DATABASE ?? ".data/pact.sqlite"),
  venue = enabled ? new DreamDex(key as `0x${string}`) : null;
const service = new PactService(store, venue, enabled);
const app = createApp(service, origin, venue?.key?.address ?? null);
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
    `Pact listening on ${port}. Testnet execution ${enabled ? "configured" : "disabled"}.`,
  ),
);
const timer = setInterval(() => void service.tick(), 1000);
void service.tick();
async function stop() {
  clearInterval(timer);
  server.close();
  await venue?.shutdown();
  store.close();
  process.exit(0);
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());

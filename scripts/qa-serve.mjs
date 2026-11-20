// Local QA server: serves dist with SPA fallback and deterministic mock API responses.
// Used only for local visual/mobile QA; never deployed.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2" };

const mocks = {
  "/api/health": { status: "ok", storage: "ready" },
  "/api/access/payment-health": {
    runtime: "cloudflare-workers-free", database: "d1", x402: "2.31.0",
    network: "ccd:4221332d34e1694168c2a0c0b3fd0f27", scheme: "exact", asset: "CCD",
    facilitatorConfigured: false, priceConfigured: false, sellerPayoutConfigured: false,
    sponsorConfigured: false, resourceAdminConfigured: false, resourceLimitBytes: 262144,
    payments: "disabled_until_testnet_configuration",
  },
  "/api/access/registry/VALIDTOKENADDRESS123456789": {
    status: "verified", ownerAccount: "3abcdefghijklmnopqrstuvwxyz123456789", payerAccount: "4abcdefghijklmnopqrstuvwxyz1234567890",
  },
};

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mocks[url.pathname] ?? { ok: true }));
  }
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
  res.writeHead(200, { "Content-Type": type[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(8792, "127.0.0.1", () => console.log("QA server on http://127.0.0.1:8792"));

// Local QA server for dist/ with SPA fallback. No mocks: real production API is
// reached through a transparent proxy so verification uses live responses only.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const upstream = "https://pact-access.vercel.app";
const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const proxy = https.request(upstream + url.pathname, { method: req.method, headers: { Accept: "application/json", Origin: upstream } }, (up) => {
      res.writeHead(up.statusCode ?? 502, { "Content-Type": "application/json" });
      up.pipe(res);
    });
    proxy.on("error", (e) => { res.writeHead(502, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: String(e) })); });
    return proxy.end();
  }
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
  res.writeHead(200, { "Content-Type": type[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(8793, "127.0.0.1", () => console.log("Live QA server on http://127.0.0.1:8793"));

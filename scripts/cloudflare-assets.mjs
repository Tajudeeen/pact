import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const assets = {};
function collect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collect(path);
    else {
      const type = types[extname(path)];
      if (!type) throw new Error("Unsupported embedded asset: " + path);
      assets["/" + path.slice("dist/".length).replaceAll("\\", "/")] = {
        content: readFileSync(path, "utf8"),
        type,
      };
    }
  }
}
collect("dist");
writeFileSync("cloudflare/assets.generated.json", JSON.stringify(assets));
console.log(
  "Embedded " +
    Object.keys(assets).length +
    " static assets for the testnet Worker.",
);

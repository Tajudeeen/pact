#!/usr/bin/env node
// Local validation only. This command never connects a wallet or submits trades.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// "release-gates" (release-check.ts) and "read-only-doctor" (doctor.ts) were
// dropped from this list: both are Somnia/dreamDEX-era checks against a
// different chain (chainId 50383) and have nothing to do with the current
// Concordium Pact Access product. Running them here gave a pass/fail signal
// about the wrong deployment. The files are left in place as archived
// history, not deleted, but are no longer part of what "verified" means for
// this product. Use `pnpm run live:check` for a real read-only check of the
// current Pact Access deployment.
const tasks = [
  ["tests", ["test"]],
  ["types", ["typecheck"]],
  ["web-build", ["build"]],
  ["cloudflare-types", ["check:cloudflare"]],
  ["cloudflare-bundle", ["build:cloudflare"]],
];
const startedAt = new Date().toISOString();
const results = [];
const bin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
for (const [name, args] of tasks) {
  const start = Date.now();
  const run = spawnSync(bin, args, { stdio: "inherit", shell: false, env: process.env });
  const passed = run.status === 0 && !run.error;
  results.push({
    name,
    command: [bin, ...args].join(" "),
    passed,
    exitCode: run.status,
    signal: run.signal ?? null,
    durationMs: Date.now() - start,
    error: run.error?.message ?? null,
  });
  if (!passed) break;
}
const report = {
  schemaVersion: 1,
  purpose: "Local deterministic checks and read-only network diagnostics. No trade executed.",
  startedAt,
  finishedAt: new Date().toISOString(),
  passed: results.length === tasks.length && results.every((r) => r.passed),
  checks: results,
  skipped: tasks.slice(results.length).map(([name]) => name),
};
const dir = join(".data", "verification");
mkdirSync(dir, { recursive: true });
const path = join(dir, "verify-" + startedAt.replaceAll(":", "-").replaceAll(".", "-") + ".json");
writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
console.log("\nVerification report: " + path);
console.log(report.passed ? "PASS (local gates only)" : "FAIL (see report).");
if (!report.passed) process.exitCode = 1;

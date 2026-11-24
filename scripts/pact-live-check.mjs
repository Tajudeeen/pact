#!/usr/bin/env node
// Re-verifies the "Current status" claims in README.md / docs/RELEASE_STATUS.md
// against the real deployed endpoints, instead of trusting hand-typed prose.
// Read-only. Never signs, never pays, never writes a resource.
//
// Usage:
//   pnpm run live:check
//   PACT_ORIGIN=https://pact-access.vercel.app pnpm run live:check [cis8004TokenAddress]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const origin = process.env.PACT_ORIGIN ?? "https://pact-access.vercel.app";
const tokenAddress = process.argv[2]; // optional: "12802,0:<id>" style CIS-8004 token

const get = async (path) => {
  const url = new URL(path, origin);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { accept: "application/json" },
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      // Non-JSON body is itself a finding, not a crash.
    }
    return {
      path,
      httpStatus: response.status,
      ok: response.ok,
      body,
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (err) {
    return {
      path,
      httpStatus: null,
      ok: false,
      body: null,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

const health = await get("/api/health");
const paymentHealth = await get("/api/access/payment-health");
const registry = tokenAddress
  ? await get(`/api/access/registry/${encodeURIComponent(tokenAddress)}`)
  : null;

// These are *expectations as currently documented*, not aspirations. A result
// that flips any of these to the opposite of what's expected means the docs
// are stale and must be updated before submission, in either direction.
const findings = {
  mainWorkerReachable: health.ok,
  mainWorkerHealthy: health.body?.status === "ok",
  facilitatorStillNotDeployed: paymentHealth.body?.x402 === "not-deployed",
  paymentsStillDisabled: paymentHealth.body?.paymentsEnabled === false,
  ...(registry
    ? {
        registryCheckReachable: registry.httpStatus !== null,
        registryCheckResult:
          registry.httpStatus === 200
            ? "verified"
            : registry.httpStatus === 403
              ? "rejected"
              : registry.httpStatus === 503
                ? "registry_outage"
                : `unexpected_status_${registry.httpStatus}`,
      }
    : {}),
};

const report = {
  schemaVersion: 1,
  purpose:
    "Read-only re-verification of the README/RELEASE_STATUS claims against the live deployment. Not a payment or proof demo.",
  generatedAt: new Date().toISOString(),
  origin,
  requests: { health, paymentHealth, ...(registry ? { registry } : {}) },
  findings,
};

mkdirSync("evidence", { recursive: true });
const filename = join(
  "evidence",
  `pact-live-check-${report.generatedAt.replace(/[:.]/g, "-")}.json`,
);
writeFileSync(filename, JSON.stringify(report, null, 2) + "\n");

console.log(`\nWrote ${filename}`);
console.log(JSON.stringify(findings, null, 2));

// Exit non-zero only when something is reachable but reports a state that
// contradicts documented expectations. An unreachable endpoint is reported,
// not silently treated as a pass or a hard crash.
const contradictsDocs =
  health.ok &&
  (findings.mainWorkerHealthy === false ||
    (paymentHealth.ok &&
      (findings.facilitatorStillNotDeployed === false ||
        findings.paymentsStillDisabled === false)));

if (contradictsDocs) {
  console.error(
    "\nLive state no longer matches README/RELEASE_STATUS claims. Update the docs before submitting.",
  );
  process.exitCode = 1;
}

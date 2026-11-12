// Read-only release smoke. Verifies that Tokyo execution is configured and that
// every required public chain-read stage succeeds. Never signs or sends a trade.
import { mkdirSync, writeFileSync } from "node:fs";

const origin =
  process.env.PACT_SMOKE_URL ??
  "https://pact-testnet.tajudeenowoeteniyan.workers.dev";
const tasks = [
  {
    path: "/api/health",
    valid: (body) => body?.status === "ok" && body?.storage === "ready",
    safe: (body) => ({ status: body?.status, storage: body?.storage }),
  },
  {
    path: "/api/config",
    valid: (body) => body?.chainId === 50383 && body?.testnetEnabled === true,
    safe: (body) => ({
      chainId: body?.chainId,
      testnetEnabled: body?.testnetEnabled,
      operatorConfigured: Boolean(body?.operator),
      ownerConfigured: Boolean(body?.allowedOwner),
    }),
  },
  {
    path: "/api/network",
    valid: (body) =>
      body?.chainId === 50383 &&
      body?.marketWiringVerified === true &&
      body?.bankLogReadVerified === true,
    safe: (body) => ({
      code: body?.code,
      stage: body?.stage,
      chainId: body?.chainId,
      marketCount: body?.marketCount,
      marketWiringVerified: body?.marketWiringVerified,
      bankLogReadVerified: body?.bankLogReadVerified,
      markValid: body?.markValid,
    }),
  },
];

const observed = [];
for (const task of tasks) {
  const at = Date.now();
  try {
    const response = await fetch(new URL(task.path, origin), {
      signal: AbortSignal.timeout(20000),
      headers: { accept: "application/json" },
    });
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const valid = response.ok && task.valid(body);
    observed.push({
      path: task.path,
      ok: valid,
      httpStatus: response.status,
      durationMs: Date.now() - at,
      result: body === null ? null : task.safe(body),
    });
  } catch (err) {
    observed.push({
      path: task.path,
      ok: false,
      httpStatus: null,
      durationMs: Date.now() - at,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const report = {
  schemaVersion: 2,
  observedAt: new Date().toISOString(),
  origin,
  readOnly: true,
  checks: observed,
  passed: observed.every((item) => item.ok),
};
mkdirSync(".data/verification", { recursive: true });
const path =
  ".data/verification/live-" +
  new Date().toISOString().replaceAll(":", "-") +
  ".json";
writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;

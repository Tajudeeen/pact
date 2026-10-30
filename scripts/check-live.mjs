// Safe GET-only deployment smoke. No owner credentials, no wallet signing or trades.
import { mkdirSync, writeFileSync } from 'node:fs';
const origin = process.env.PACT_SMOKE_URL ?? 'https://pact-testnet.tajudeenowoeteniyan.workers.dev';
const tasks = ['/api/health', '/api/network'];
const observed = [];
for (const path of tasks) {
  const at = Date.now();
  try {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
    const body = await response.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = null; }
    observed.push({ path, ok: response.ok, status: response.status, durationMs: Date.now() - at,
      bodyType: parsed === null ? 'not_json' : typeof parsed,
      // Do not persist any returned wallet/session or operator details.
    });
  } catch (err) {
    observed.push({ path, ok: false, status: null, durationMs: Date.now() - at, error: err instanceof Error ? err.message : String(err) });
  }
}
const report = { schemaVersion: 1, observedAt: new Date().toISOString(), origin, readOnly: true, checks: observed,
  passed: observed.every(x => x.ok && x.bodyType !== 'not_json') };
mkdirSync('.data/verification', { recursive: true });
const path = '.data/verification/live-' + new Date().toISOString().replaceAll(':','-') + '.json';
writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;

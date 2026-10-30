#!/usr/bin/env node
// Converts a downloaded Pact receipt into a *candidate* evidence manifest.
// This tool performs structural checks, not independent RPC verification.
// Run `pnpm run verify:receipt <receipt.json>` for chain verification.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
const input = process.argv[2];
if (!input) {
  console.error("Usage: pnpm evidence:collect /path/to/pact-receipt.json");
  process.exit(2);
}
try {
  const raw = JSON.parse(readFileSync(resolve(input), "utf8"));
  const proofs = Array.isArray(raw.chainProofs) ? raw.chainProofs : [];
  const fills = Array.isArray(raw.fills) ? raw.fills : [];
  const entry = proofs.find(p => p.role === "entry");
  const close = proofs.find(p => p.role === "close");
  const okHash = h => typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
  const checks = {
    testnet: raw.mode === "testnet" && raw.chainId === 50383,
    closed: raw.state === "closed",
    entryProofPresent: !!entry && okHash(entry.hash) && entry.chainId === 50383 && Number(entry.confirmations) >= 2,
    closeProofPresent: !!close && okHash(close.hash) && close.chainId === 50383 && Number(close.confirmations) >= 2,
    entryFillPresent: fills.some(f => f.role === "entry" && okHash(f.txHash)),
    closeFillPresent: fills.some(f => f.role === "close" && okHash(f.txHash)),
    costsReconciled: raw.settlement?.status === "complete" && Array.isArray(raw.incomplete) && raw.incomplete.length === 0,
  };
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceFile: basename(input),
    warning: "Receipt-derived candidate only. Never report as independently verified without the chain recheck and confirmed flat-position evidence.",
    status: Object.values(checks).every(Boolean) ? "CANDIDATE_NEEDS_INDEPENDENT_VERIFICATION" : "INCOMPLETE",
    checks,
    market: raw.market ?? null,
    direction: raw.direction ?? null,
    planDigest: raw.planDigest ?? null,
    owner: raw.owner ?? null,
    entry: entry ? { hash: entry.hash, pool: entry.pool, blockNumber: entry.blockNumber, confirmationsAtExport: entry.confirmations } : null,
    close: close ? { hash: close.hash, pool: close.pool, blockNumber: close.blockNumber, confirmationsAtExport: close.confirmations } : null,
    explorerLinks: [entry, close].filter(Boolean).filter(p=>okHash(p.hash)).map(p => "https://explorer.testnet.somnia.network/tokyo/tx/" + p.hash),
    missing: Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),
  };
  const directory = join(".data", "evidence");
  mkdirSync(directory, { recursive: true });
  const filename = join(directory, "candidate-" + String(raw.id ?? "unknown").replace(/[^a-z0-9_-]/gi, "_") + ".json");
  writeFileSync(filename, JSON.stringify(report, null, 2) + "\n");
  console.log(filename, report.status);
  if (report.status === "INCOMPLETE") process.exitCode = 1;
} catch (err) {
  console.error("Evidence collection failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}

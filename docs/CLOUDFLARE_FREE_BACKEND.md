# Pact Access on Cloudflare Free

This deployment keeps the React frontend on Vercel and runs the first Pact Access API on Cloudflare Workers Free with D1. It does not use Containers, Durable Objects, paid Workers features, or a local filesystem.

## Current scope

- `GET /api/health`: checks the D1 binding and reports enabled capabilities.
- `POST /api/access/challenges`: validates a Concordium CIS-8004 badge, resolves the active owner and registered agent wallet, and stores a 90-second owner-signature challenge and audit row in D1.
- `GET /api/access/resource`: deliberately fails closed until owner signature verification and finalized x402 settlement are implemented in a Workers-compatible runtime.

The API must not release protected data while the payment runtime reports disabled.

## Required deployment settings

The API is deployed with D1 binding `DB` and these variables:

- `PACT_ORIGIN`: exact Vercel frontend origin.
- `PACT_ACCESS_SELLER_ID`: seller identifier.
- `PACT_ACCESS_RESOURCE_URL`: canonical HTTPS resource URL.
- `CONCORDIUM_AGENT_REGISTRY_INDEX`: `12802`, the testnet CIS-8004 registry index returned by the official registry `contract_info` tool.
- `CONCORDIUM_AGENT_REGISTRY_SUBINDEX`: `0`.

The Worker checks the CIS-2 token's embedded contract index and subindex against this trusted configuration, then requires an active on-chain record, a valid badge, owner and network consistency, a fetched Agent Card whose hash matches the on-chain metadata hash, and a registered `agentWallet`. Warning-only legacy badge notices are retained without rejecting an otherwise valid badge. Do not copy the mainnet registry index into testnet settings without confirmation.

## Data safety

Challenge context, expiry and the one-use challenge are stored in D1, not Worker memory. Raw wallet signatures and private keys must never be written to D1 or logs. The challenge is valid for 90 seconds. The resource route remains unavailable until a successful payment is verified and finalized.

## Free-plan constraints

The Worker must stay within Workers Free limits, including 100,000 requests/day and 10 ms CPU per invocation. D1 must stay within its free usage allowances. Avoid containers and other paid features. Review the current Cloudflare limits before expanding throughput.

## Local verification

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm exec wrangler deploy --config wrangler.access.jsonc
```

The standalone Worker file is also deployed through the Cloudflare API. Keep `cloudflare/access-api.js` and `wrangler.access.jsonc` in sync.

# Pact Access on Cloudflare Free

This keeps the React frontend on Vercel and runs Pact Access API endpoints on Cloudflare Workers Free with D1. It does not use Containers, Durable Objects, paid Workers features, or a local filesystem.

## Deployed resources

- Frontend: `https://pact-access.vercel.app`
- Worker: `https://pact-access-api.tajudeenisah02.workers.dev`
- D1 database: `pact-access`, id `b64ef749-48cd-4638-88d5-add8e8936fe3`
- Vercel rewrites `/api/health` and `/api/access/*` to the Worker.
- Trusted testnet CIS-8004 registry: contract `12802,0`.
- Testnet CIS-8 registry: contract `12801,0`.
- Testnet CAIP-2 network: `ccd:4221332d34e1694168c2a0c0b3fd0f27`.

## Current scope

- `GET /api/health`: checks the D1 binding and reports enabled capabilities.
- `POST /api/access/challenges`: validates a CIS-8004 badge through Concordium's official Registry MCP service, resolves the active owner and registered `agentWallet`, and stores a 90-second owner-signature challenge and audit row in D1.
- `GET /api/access/resource`: returns 503 and fails closed until owner signature verification and finalized x402 settlement are implemented in a Workers-compatible runtime.

The Worker checks the CIS-2 token's embedded contract index and subindex against the trusted configuration. It then requires an active on-chain record, a valid badge, owner and network consistency, a fetched Agent Card whose hash matches the on-chain metadata hash, and a registered `agentWallet`. Warning-only legacy notices do not cause rejection, but actual badge errors do.

## Production verification completed on November 16, 2026

- Worker health and Vercel-proxied health both return `status: ok` and `storage: ready`.
- The production challenge form passes the Vercel rewrite and origin guard.
- Vercel's proxy strips the `Origin` header but preserves the `Referer`. The Worker accepts an exact configured Origin, or, only when Origin is absent, an exact Referer origin matching `PACT_ORIGIN`. Missing or mismatched site headers are rejected.
- An active testnet agent with token `JyP9U7XyDbBWoxPrUP8vq` was rejected by the official registry verifier because its legacy card is missing the required token address and CIS-8004 contract reference. The user-facing result is `The Concordium badge, active registry record, or Agent Card hash did not pass verification.`
- 17 of the 20 active records returned by the public testnet indexer were checked. None passed the full badge checks. Failures included unavailable card URLs, missing badge token fields, incorrect contract references, and stale/missing metadata hashes. Do not weaken the gate to make these old examples pass.
- D1 still contains zero access requests and zero audit rows after the invalid-badge smoke test.
- The protected-resource route continues to return 503. No wallet signatures, payments, transactions, or protected bytes have been processed.

A valid owner-signed challenge has not yet been produced because the public testnet badges inspected so far are invalid. Use a badge whose A2A extension includes the correct token address and contract references, and whose served Agent Card bytes match the on-chain SHA-256 metadata hash.

## Required deployment settings

The Worker is deployed with D1 binding `DB` and these variables:

- `PACT_ORIGIN`: `https://pact-access.vercel.app`
- `PACT_ACCESS_SELLER_ID`: seller identifier
- `PACT_ACCESS_RESOURCE_URL`: canonical HTTPS resource URL
- `CONCORDIUM_AGENT_REGISTRY_INDEX`: `12802`
- `CONCORDIUM_AGENT_REGISTRY_SUBINDEX`: `0`

The schema migration is stored in `cloudflare/migrations/access/0001_init.sql`. The Wrangler config points its D1 migration directory at that folder.

## Data safety

Challenge context, expiry and one-use challenge state are stored in D1, not Worker memory. Raw wallet signatures and private keys must never be written to D1 or logs. The challenge is valid for 90 seconds. The resource route remains unavailable until owner proof and finalized payment are verified.

## Free-plan constraints

The deployment uses Workers Free and D1 only. Avoid Containers and paid Workers features. Keep the Worker within the free plan's request and CPU limits, and D1 within its free usage allowances. The next identity-verification step should use Concordium's supported testnet gRPC-Web endpoint and the SDK's `ConcordiumGRPCWebClient`, not the Node-only `@grpc/grpc-js` adapter. Concordium documents the public testnet endpoint as supporting gRPC v2 and gRPC-Web.

## Local commands

```powershell
pnpm install --frozen-lockfile
pnpm access:migrate:local
pnpm access:dev
```

Deploy or apply the remote migration only when you intend to change the live Worker or D1 schema:

```powershell
pnpm access:migrate:remote
pnpm access:deploy
```

Keep `cloudflare/access-api.js`, `wrangler.access.jsonc`, the D1 migration and this runbook in sync.

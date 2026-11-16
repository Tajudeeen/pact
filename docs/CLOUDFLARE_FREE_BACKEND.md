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

## API scope

- `GET /api/health`: checks D1 and reports the Worker runtime capabilities.
- `POST /api/access/challenges`: validates a CIS-8004 badge using the official Concordium Agent Registry service, resolves the active owner and registered `agentWallet`, and stores a 90-second owner-signature challenge in D1.
- `POST /api/access/proofs`: reads fresh account credentials from the public Concordium testnet gRPC-Web endpoint, checks account and per-credential key thresholds, verifies the exact server-issued challenge using Ed25519, and atomically marks the challenge `proof_verified`.
- `GET /api/access/resource`: deliberately returns 503 until finalized x402 settlement is implemented in the Worker runtime. It never releases data while payments are disabled.

## Concordium badge verification

The Worker checks the CIS-2 token's embedded contract index and subindex against the trusted testnet registry configuration. It then requires an active on-chain record, a valid badge, owner and network consistency, a fetched Agent Card whose hash matches the on-chain metadata hash, and a registered `agentWallet`. Warning-only legacy notices do not cause rejection, but actual badge errors do.

The testnet CIS-8004 registry is contract `12802,0`, and CIS-8 is `12801,0`. These values were read from the official registry's `contract_info` tool rather than copied from mainnet.

## Owner signature verification

The owner signs the exact JSON message returned by Pact. The Worker reloads the account's current credentials from the latest finalized testnet state for each verification attempt. It validates the returned account address, the account credential threshold, each credential's key threshold, and every supplied Ed25519 signature.

Concordium's SDK message digest is SHA-256 over the 32-byte account address, eight zero bytes, and the exact UTF-8 message bytes. Pact uses the same digest construction and Web Crypto Ed25519 verification. Credentials and keys are never cached between proof requests, because account keys can be rotated.

The raw wallet signature is transient request data. Pact does not store it or log it. D1 stores only the request state, challenge-consumption timestamp and a coarse audit reason code. Successful proof state is a prerequisite for the later x402 gate, but it does not itself permit resource delivery.

A denied or expired proof blocks that challenge. The frontend clears a consumed challenge and requires a fresh one. Concordium service/network failures leave the challenge unconsumed until expiry so a temporary outage does not burn the user's proof attempt.

## Production checks completed November 16, 2026

- Worker health and Vercel-proxied health return `status: ok` and `storage: ready`.
- The Vercel rewrite strips the `Origin` header but preserves `Referer`. The Worker accepts an exact configured Origin, or, only when Origin is missing, an exact Referer origin matching `PACT_ORIGIN`. Missing or mismatched site headers are rejected.
- The public testnet account lookup returned gRPC-Web status 0. The Worker parser read one credential and its Ed25519 public key from a live account response.
- A synthetic Ed25519 key pair passed the sign/verify round trip inside Workers. A tampered signature was rejected.
- A production same-origin proof request with a synthetic all-zero signature returned HTTP 401 `OWNER_PROOF_REJECTED`. D1 recorded `state=blocked` and `reason_code=invalid_signature`. No signature bytes were persisted.
- The invalid test row and temporary proof smoke page/probe workers are removed after testing.
- The protected-resource route still returns 503. No wallet signatures from a real owner, payments, chain transactions or protected data releases have been processed.

A valid real owner proof still needs to be demonstrated with an agent badge that passes the official registry checks. The public testnet badges inspected so far fail because of stale or unreachable Agent Cards, incorrect token-address fields, incorrect contract references, or mismatched metadata hashes. Do not weaken the badge checks to make these legacy records pass.

## Data safety

The challenge is valid for 90 seconds. D1 stores request context, expiry, state and audit events, not raw wallet signatures or private keys. Resource delivery remains disabled until a finalized payment is independently verified.

## Free-plan constraints

This deployment uses Cloudflare Workers Free and D1 only. Avoid Containers and paid Workers features. Keep Worker CPU, request and D1 usage within the free allowances. Concordium account lookup uses the public testnet gRPC-Web endpoint through Worker `fetch`, not Node-only `@grpc/grpc-js`.

## Required deployment settings

- `PACT_ORIGIN`: `https://pact-access.vercel.app`
- `PACT_ACCESS_SELLER_ID`: `pact-access-demo`
- `PACT_ACCESS_RESOURCE_URL`: `https://pact-access.vercel.app/api/access/resource`
- `CONCORDIUM_AGENT_REGISTRY_INDEX`: `12802`
- `CONCORDIUM_AGENT_REGISTRY_SUBINDEX`: `0`

The D1 schema migration is `cloudflare/migrations/access/0001_init.sql`, and `wrangler.access.jsonc` points to this migration directory.

## Local commands

```powershell
pnpm install --frozen-lockfile
pnpm access:migrate:local
pnpm access:dev
```

Deploy or apply the remote migration only when intentionally changing the live Worker or D1 schema:

```powershell
pnpm access:migrate:remote
pnpm access:deploy
```

Keep `cloudflare/access-api.js`, `wrangler.access.jsonc`, the D1 migration and this runbook in sync.

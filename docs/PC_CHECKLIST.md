# Pact Access: PC implementation checklist

PR #9 is already merged as the first product pivot. Continue from the phase-two draft PR #11. Do not merge PR #11 until the real testnet flow and checks pass.

## 1. Pull the branch

Run in PowerShell from the Pact repository:

```powershell
git status
git fetch origin
git switch concordium/pact-access-phase-2
git pull --ff-only
node --version
pnpm --version
```

Required Node: `>=24.13`. If pnpm is missing and Corepack is available:

```powershell
corepack enable
corepack prepare pnpm@11.25.0 --activate
```

## 2. Install the pinned integration packages

The package versions below are the documented stable versions checked for this branch. Add them exactly and commit the generated lockfile:

```powershell
pnpm add -E @x402/concordium@2.31.0 @x402/core@2.31.0 @x402/hono@2.31.0 @x402/fetch@2.31.0 @concordium/web-sdk@12.0.2 @concordium/browser-wallet-api-helpers@3.3.0 @grpc/grpc-js
```

Do not add any private key to source code or a committed env file.

## 3. Run checks before integration

```powershell
pnpm install --frozen-lockfile
pnpm verify
pnpm typecheck
pnpm test
pnpm build
```

Stop at the first failure. Save the full output, fix it, and rerun the failed check. Don't report a check as passed until its exit code is zero.

## 4. Configure testnet identities and secrets

Use Concordium testnet only. The network ID is:

```text
ccd:4221332d34e1694168c2a0c0b3fd0f27
```

The official testnet gRPC endpoint documented by the x402 package is:

```text
grpc.testnet.concordium.com:20000
```

Create a testnet seller account, a registered agent owner account, and a separate agent payment account. On Windows PowerShell, copy the templates with `Copy-Item .env.example .env` and `Copy-Item server\\facilitator\\.env.example server\\facilitator\\.env`. Create the protected folder with `New-Item -ItemType Directory -Force .data\\protected`. Place the actual dataset or resource file there. Set `PACT_ACCESS_RESOURCE_FILE` to its filename relative to that directory. Never commit the protected file unless it is intended to be public. Register the agent in the trusted CIS-8004 testnet registry, then set its `agentWallet` to the payment account. CIS-8004 requires the owner to authorize that change and the new wallet to prove control.

Do not assume the mainnet registry contract index is also the testnet address. Confirm the exact testnet registry contract and configure its canonical CAIP-10 ID.

Set `PACT_ACCESS_ENABLED=true` only after all values below are configured. `PACT_ACCESS_RESOURCE_URL` must be the exact public HTTPS URL advertised to x402, and `PACT_ACCESS_ROUTE` must match the route used by the buyer. Set `PACT_ORIGIN` to the actual Pact app origin so the existing origin and rate-limit middleware protects the challenge endpoint.

Keep the seller values in the seller app environment. Put `CCD_FACILITATOR_ADDRESS`, `CCD_FACILITATOR_PRIVATE_KEY`, `CCD_FINALIZATION_TIMEOUT_MS`, and the shared `X402_FACILITATOR_TOKEN` only in the separate facilitator service. Put `PACT_AGENT_WALLET_ADDRESS` and `PACT_AGENT_WALLET_PRIVATE_KEY` only in the buyer-agent process, using `docs/buyer-agent.env.example`.

Keep these seller values in local secrets or the deployment secret manager:

- `PACT_ACCESS_SELLER_ID`
- `PACT_ACCESS_RESOURCE_URL`
- `PACT_ACCESS_ROUTE`
- `PACT_ACCESS_PRICE_ATOMIC`
- `PACT_ACCESS_ASSET`
- `PACT_ACCESS_RESOURCE_ROOT`
- `PACT_ACCESS_RESOURCE_FILE`
- `PACT_ACCESS_DESCRIPTION`
- `PACT_ACCESS_MIME_TYPE`
- `PACT_SELLER_PAY_TO`
- `CONCORDIUM_AGENT_REGISTRY_ID`
- `CONCORDIUM_AGENT_REGISTRY_MCP_URL`
- `X402_FACILITATOR_URL`
- `CCD_FACILITATOR_ADDRESS`
- `CCD_FACILITATOR_PRIVATE_KEY`
- `PACT_AGENT_WALLET_ADDRESS`
- `PACT_AGENT_WALLET_PRIVATE_KEY`

The agentWallet private key belongs only in the buyer-agent runtime. The facilitator sponsor key belongs only in the facilitator service. Never place either key in the browser or Git. The file-backed resource adapter resolves symlinks and enforces a 5 MB default size limit.

## 5. Finish the live integrations

1. Browser: use the helper in `src/access/concordium-wallet.ts` to call `detectConcordiumProvider()`, connect the owner account, and sign the exact server-issued message. Send its returned `headerValue` as `x-pact-owner-proof`. This proves control of the registered owner account. It is not a ZK proof of an age or other identity attribute.
2. Backend: use `@concordium/web-sdk` and a testnet gRPC client to fetch fresh account information. Verify the returned signature with `verifyMessageSignature`. Never accept account information supplied by the browser.
3. Registry: use `ConcordiumMcpAgentResolver` against the official Agent Registry MCP endpoint (`https://agent-registry-mcp.concordium.com/mcp`). Pin `CONCORDIUM_AGENT_REGISTRY_ID` to the confirmed testnet CIS-8004 contract identifier. The resolver reads `agent_by_token_address` from chain and returns owner, status, and `agent_wallet`. Derive `ownerAccount` and `agentWallet` from this live record, require `Active`, and verify the signed owner account matches the record owner.
4. Payment: mount the middleware returned by `createPactAccessRuntime`. It wires `@x402/hono`, `@x402/core`, and `@x402/concordium` using the Concordium Exact scheme. Use the self-hosted service in `server/facilitator/index.ts`, not the default x402.org facilitator. Deploy it separately from the seller app with the environment in `server/facilitator/.env.example`. It registers the official Exact Concordium facilitator with finalization required and allowlists only the configured resource URL, seller payout account, amount, asset, and testnet. Set CCD_FACILITATOR_RESOURCE_URL, CCD_FACILITATOR_PAY_TO, CCD_FACILITATOR_AMOUNT_ATOMIC, and CCD_FACILITATOR_ASSET in the facilitator environment. Set the seller app's `X402_FACILITATOR_URL` to that service's public HTTPS base URL. Generate a random 32-byte bearer token and set the same value as `X402_FACILITATOR_TOKEN` in the seller app and facilitator service. The facilitator requires this token for `/supported`, `/verify`, and `/settle`. The runtime uses Concordium `getBlockItemStatus` to reconcile a transaction hash after a facilitator timeout.
5. Binding: send `x-pact-access-request` and the base64url JSON `x-pact-owner-proof` header returned by the wallet helper. The buyer helper in `server/access/buyer-agent.ts` builds the x402 client and sends both headers. The x402 hooks verify the owner before payment processing, then require the x402 payload sender to equal the agent's current on-chain `agentWallet`. The registered owner signature and payment sender are intentionally different accounts.
6. Delivery: release the protected resource only after the facilitator confirms finalized settlement. The resource handler must never run on missing proof, invalid proof, wrong payer, pending settlement, or facilitator failure.

## 6. Test the failure paths

- no owner signature;
- signature from a different account;
- modified message, wrong request, wrong network, or expired challenge;
- replayed challenge;
- revoked agent or untrusted registry;
- registry owner mismatch;
- payer does not match current `agentWallet`;
- x402 amount, asset, or recipient mismatch;
- pending, failed, or timed-out settlement;
- facilitator/node outage;
- duplicate request and duplicate delivery attempt; confirm delivery state and receipt commit atomically.

For every blocked case, verify that no protected bytes are returned.

## 7. Buyer agent

Use `createPactBuyerFetch` only in the server-side buyer-agent process. Load the registered `agentWallet` private key from a secret store. Call the challenge endpoint first, sign the returned message with the owner wallet, then call the protected resource using `pactBuyerHeaders`. The x402 fetch wrapper handles the 402/payment retry and signs the sponsored transaction from the agentWallet.

## 8. Facilitator deployment

From the repository root, run `pnpm facilitator` in a separate terminal. The entry point loads `server/facilitator/.env` itself. The seller app loads the root `.env`. Expose its `/supported`, `/verify`, and `/settle` routes over HTTPS. Confirm `/supported` advertises the Concordium testnet and Exact scheme before pointing the seller app at it. Never deploy the facilitator sponsor key alongside the seller's resource server.

## 9. Demo evidence

- [ ] First request returns an owner-signature challenge, no resource bytes.
- [ ] Owner signs the exact request-bound message in Concordium Wallet.
- [ ] Backend verifies the signature against fresh account credentials.
- [ ] Live CIS-8004 resolution confirms active owner and agentWallet.
- [ ] Buyer agent pays from the registered agentWallet through x402.
- [ ] Facilitator confirms finalization on testnet.
- [ ] Protected resource is delivered once, after settlement.
- [ ] CCDExplorer transaction link and sanitized audit record are visible.
- [ ] Invalid proof, wrong payer, and failed/pending payment never deliver.
- [ ] Demo labels any simulation or fixture honestly.

## Current remote implementation boundary

The branch now contains the Pact Access landing, owner-signature message/verifier adapter, CIS-8004 binding adapter, server-issued challenge flow, SQLite request/challenge repository, fail-closed pipeline, state machine, and tests.

The branch now includes dynamic-loading adapters for the Concordium SDK, official Agent Registry MCP lookup, x402 Hono middleware, x402 lifecycle hooks, finality-based reconciliation, challenge/resource routes, browser owner signing, and a server-side buyer-agent payment wrapper. The server now mounts the router when `PACT_ACCESS_ENABLED=true`. The PC still needs to install the pinned packages and generate the lockfile, deploy the separate facilitator service, configure the testnet registry ID and seller endpoint, choose and place a real protected file, load the agentWallet secret into the buyer runtime, and produce real testnet transaction evidence. If a facilitator failure has no transaction hash, the request remains pending for manual review. No live transaction or deployment is claimed.

# Pact Access on Cloudflare Free

Pact Access uses a Vercel frontend and Cloudflare Workers Free + D1 for the access API. The deployment uses no Workers Paid plan, Containers, Durable Objects, or paid storage.

## Deployed resources

- Frontend: `https://pact-access.vercel.app`
- Main access Worker: `https://pact-access-api.tajudeenisah02.workers.dev`
- Facilitator Worker: `https://pact-access-facilitator.tajudeenisah02.workers.dev`
- D1 database: `pact-access`, id `b64ef749-48cd-4638-88d5-add8e8936fe3`
- Vercel routes `/api/health`, challenge and proof calls to the main access Worker.
- Vercel routes `/api/access/resource`, `/api/access/resources` and `/api/access/payment-health` to the facilitator Worker.
- Concordium testnet CIS-8004 registry: `12802,0`.
- Concordium testnet CIS-8 registry: `12801,0`.
- Testnet CAIP-2 network: `ccd:4221332d34e1694168c2a0c0b3fd0f27`.

## Main access API

- `GET /api/health`: checks the D1 binding and reports the current access API capabilities.
- `POST /api/access/challenges`: validates the CIS-8004 badge with Concordium's official Agent Registry verifier, resolves the active owner and registered `agentWallet`, then stores a fresh 90-second challenge in D1.
- `GET /api/access/registry/{tokenAddress}`: read-only current CIS-8004 badge check. Returns the active owner and `agentWallet` only when the badge, chain, contract, and Agent Card checks pass.
- `POST /api/access/proofs`: re-checks the current registry owner and `agentWallet`, retrieves finalized account credentials from Concordium testnet over gRPC-Web, checks account and credential key thresholds, verifies the exact challenge message with Ed25519, consumes the challenge once, and records the result.
- A successful owner proof extends the D1 access-request expiry to 12 minutes for x402 negotiation and finality retries. The original signed challenge remains valid for only 90 seconds and cannot be reused.

The owner console sends the wallet signature to Pact for verification. The copied buyer handoff includes only the verified request id and resource URL. Raw wallet signature material is not included in the handoff, D1 records or audit log.

## Concordium badge verification

The main Worker decodes the CIS-2 token address and requires the embedded contract index and subindex to equal the trusted testnet registry `12802,0`. It then requires:
- an active on-chain CIS-8004 record;
- the badge to match the token address, owner, chain and expected registry;
- a reachable Agent Card;
- a SHA-256 hash that matches the on-chain metadata hash;
- a registered agent payment wallet.

Warning-only legacy format notices do not cause rejection. Actual badge errors do. Do not loosen these checks to accept old or incomplete badges.

## Owner signature verification

Pact verifies the owner against fresh account credentials from the latest finalized Concordium testnet state for each attempt. It validates the returned account address, account credential threshold, every credential key threshold, and every supplied Ed25519 signature.

The Concordium message digest is SHA-256 over the 32-byte account address, eight zero bytes, and exact UTF-8 challenge message bytes. The Worker verifies this with Web Crypto Ed25519. Credentials and keys are not cached, since account keys can change.

The raw signature is transient request data. D1 stores request state, challenge-consumption time and coarse audit reason codes only. A verified owner proof does not itself release the resource.

## Facilitator build and deployment status

The full x402 facilitator implementation is in `cloudflare/facilitator-worker/`. It uses the official `@x402/concordium` exact facilitator scheme with a custom signer backed by Concordium's gRPC-Web client, not the Node-only gRPC helper.

- Dedicated package type-check passes.
- Wrangler dry-run bundle passes.
- Bundle size: about 1.13 MiB uncompressed.
- The Worker is pinned to the 10 ms Workers Free CPU limit and uses `nodejs_compat` for one utility shim in the SDK bundle.
- The D1 `pact_access_resources` table is created.
- The production facilitator URL currently runs a small fail-closed placeholder. `GET /api/access/payment-health` reports `x402: not-deployed`, `facilitatorConfigured: false`, `paymentsEnabled: false`, and resource delivery disabled.
- `GET /api/access/resource` continues to return HTTP 503.
- The final bundled x402 Worker has not yet been deployed because the GitHub repository does not have the `CLOUDFLARE_API_TOKEN` Actions secret. The account ID is embedded as a non-secret workflow value. The build workflow detects the missing token and skips deployment safely.
- The latest main-branch quality workflow passes install, app type-check, tests and production build. The dedicated facilitator workflow passes dependency install, TypeScript check and Wrangler bundling. Deployment steps are skipped only because the Cloudflare API token is absent.

The workflow is `.github/workflows/access-facilitator.yml`. Once both GitHub Actions secrets are configured, the next push under the facilitator paths will apply the D1 migration, deploy the full Worker and verify that payment remains disabled until testnet settings are supplied.

## Required setup to activate testnet payments

The following are deliberately blank. No payment can be made until all of them are configured.

GitHub repository Actions secret:
- `CLOUDFLARE_API_TOKEN`: create a custom Cloudflare API token scoped to the Pact account with only `Workers Scripts Edit` and `D1 Edit`. The Cloudflare account ID is already set as a non-secret value in the workflow, so no second GitHub secret is needed.

Create the token in [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens). Under Account Resources, select only the Pact Cloudflare account. Under Account Permissions, add `Workers Scripts Edit` and `D1 Edit`. Do not add billing, zone, R2, Containers, or other permissions.

Then open the GitHub repository Settings, go to Secrets and variables, then Actions, and add `CLOUDFLARE_API_TOKEN`. Do not paste the token into a commit, issue, pull request, chat, or workflow file.

To deploy after adding the secret, open the GitHub Actions workflow named `Pact Access facilitator Worker build` and choose Run workflow. The workflow performs the build, applies the protected-resource D1 migration, deploys the facilitator with payment configuration still blank, and checks that the live health endpoint reports payments disabled.

Cloudflare Worker variables in `cloudflare/facilitator-worker/wrangler.jsonc`:
- `PACT_ACCESS_PRICE_ATOMIC`: the resource price in micro-CCD atomic units.
- `PACT_SELLER_PAY_TO`: the seller's Concordium testnet account.
- `CCD_FACILITATOR_ADDRESS`: the sponsor account that pays network fees.

Cloudflare Worker secrets:
- `CCD_FACILITATOR_PRIVATE_KEY`: private key for the sponsor account. Store this only as a Cloudflare Worker secret.
- `PACT_RESOURCE_ADMIN_KEY`: a separate random bearer secret for the protected-resource upload route.

Do not paste private keys or secret values into chat, source files, Git commits, or README. The buyer agent must also have an on-chain CIS-8004 badge with a valid Agent Card and a configured `agentWallet`.

## Protected resource flow

1. Upload one protected resource with `PUT /api/access/resources`, using `Authorization: Bearer <PACT_RESOURCE_ADMIN_KEY>`.
2. Send JSON with `resourceId` equal to `https://pact-access.vercel.app/api/access/resource`, `contentType` set to `application/json`, `text/csv` or `text/plain`, and the content string. The limit is 256 KiB.
3. A buyer agent requests `GET /api/access/resource` with `X-PACT-ACCESS-REQUEST` set to the verified request id.
4. Pact responds with x402 v2 payment requirements. The buyer signs the exact CCD payment payload from its registered agent wallet.
5. The facilitator checks and settles the payment, waits for Concordium finalization, and verifies payer, payee, amount and CCD asset.
6. Only after finality does Pact release the D1 resource. The request id and payment hash make retries idempotent. An uncertain broadcast remains locked to prevent a duplicate payment.

A request with no proof, wrong payer, invalid x402 signature, failed or mismatched finalized transaction, expired approval, or unknown payment state must never release resource bytes.

## Production verification completed November 16, 2026

- The main access Worker and the Vercel-proxied health route both report healthy D1 storage.
- The read-only production registry endpoint returns HTTP 403 for an active testnet badge whose Agent Card fails the official verifier. This confirms the endpoint is enforcing the current badge checks rather than trusting an old registry record.
- Vercel's rewrite removes the `Origin` header but retains `Referer`. The main Worker accepts an exact configured Origin, or, only when Origin is absent, an exact Referer origin matching `PACT_ORIGIN`.
- Concordium testnet account info was fetched successfully over gRPC-Web. The Worker parser read the account's credential and Ed25519 public key.
- A synthetic Ed25519 key pair passed the Worker sign/verify round trip. A tampered signature was rejected.
- A same-origin production proof request with a synthetic all-zero signature returned HTTP 401 `OWNER_PROOF_REJECTED`. D1 recorded `state=blocked` and `reason_code=invalid_signature`. No signature bytes were persisted.
- The invalid smoke-test row and temporary probe Workers were removed. D1 was clean before creating the resource table.
- The public testnet badges inspected so far fail the official verifier for stale or unreachable Agent Cards, missing token/contract fields, or metadata hash mismatches. A valid live badge and genuine owner proof are still required.
- No real wallet proof, x402 payment, CCDExplorer transaction link, or protected resource delivery has been demonstrated.

## Free-plan constraints

Use Workers Free and D1 only. Keep CPU at 10 ms/request, resource content at 256 KiB, and request/D1 usage inside free allowances. Do not add Containers, paid Workers, paid storage or Durable Objects unless the plan changes. Review Cloudflare's live limits before increasing throughput:
`https://developers.cloudflare.com/workers/platform/limits/`

## Buyer-agent demo

The isolated package also includes a buyer-agent CLI at `scripts/pact-buyer-agent.ts`. It uses the official Concordium x402 client and the agent's registered `agentWallet` key. Run it only after the full facilitator has been deployed, a valid owner proof has been verified, and a protected resource has been uploaded.

```powershell
cd cloudflare/facilitator-worker
$env:PACT_ACCESS_REQUEST_ID = "<verified-request-id>"
$env:PACT_BUYER_AGENT_WALLET_ADDRESS = "<registered-agentWallet>"
$env:PACT_BUYER_AGENT_WALLET_PRIVATE_KEY = "<agentWallet-private-key>"
npm install
npm run demo:buyer
```

Keep the private key only in the local shell or a secure secret manager. Never put it in `.env.example`, source control, browser code or chat. HTTP 202 means the transaction may already be broadcast. Reuse the same request id for reconciliation and do not create a second payment.

## Local commands

```powershell
cd cloudflare/facilitator-worker
npm install
npm run typecheck
npm run build
```

After the deployment credentials exist in GitHub Actions, pushing facilitator changes applies the resource migration and deploys the full Worker. For manual local deployment, configure the Cloudflare API token and account id in your shell first, then use `npm run deploy`. Keep secrets in Cloudflare Worker secrets, not in Wrangler vars or source.

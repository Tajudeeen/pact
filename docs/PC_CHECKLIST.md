# Pact Access PC checklist

This is the current setup guide for the Concordium Trusted Agents build. The previous Somnia/dreamDEX instructions are historical and are no longer part of the active release path.

## Current live state

- Frontend: https://pact-access.vercel.app
- Main access Worker: pact-access-api
- Facilitator Worker URL: https://pact-access-facilitator.tajudeenisah02.workers.dev
- Database: Cloudflare D1, pact-access
- Network: Concordium testnet, CAIP-2 ccd:4221332d34e1694168c2a0c0b3fd0f27
- Trusted CIS-8004 registry: contract 12802,0

The main Worker issues 90-second owner challenges, verifies owner signatures against fresh finalized testnet account credentials, and extends a successful request to a 12-minute payment window. It refreshes the CIS-8004 owner and agentWallet binding before accepting the proof.

The facilitator URL currently runs a fail-closed placeholder. Payment health says x402: not-deployed, and the protected-resource route returns HTTP 503. The full facilitator source passes TypeScript and Wrangler build checks, but its bundle is not deployed.

## 1. Enable the facilitator deployment workflow

1. In Cloudflare, open https://dash.cloudflare.com/profile/api-tokens.
2. Create a custom token scoped to the Pact Cloudflare account only.
3. Give it only these account permissions: Workers Scripts Edit and D1 Edit.
4. In GitHub, open Tajudeeen/pact, then Settings, Secrets and variables, Actions.
5. Add one repository secret named CLOUDFLARE_API_TOKEN.
6. Never paste the token into chat, source code, commits, or issues.
7. Open Actions, then Pact Access facilitator Worker build, then choose Run workflow.

The account ID is already in the workflow as a non-secret value. The workflow installs dependencies, type-checks, bundles the Worker, applies the resource migration, deploys the Worker, and confirms payment remains disabled. The latest facilitator build passed the build steps. Deployment skipped because the secret is not present yet.

## 2. Configure the testnet facilitator

Do not enable payments until the following values are confirmed.

Worker variables:
- PACT_ACCESS_PRICE_ATOMIC: positive integer in micro-CCD.
- PACT_SELLER_PAY_TO: seller's Concordium testnet account.
- CCD_FACILITATOR_ADDRESS: funded sponsor account that pays network fees.

Worker secrets:
- CCD_FACILITATOR_PRIVATE_KEY: hex-encoded Ed25519 private key for the sponsor account.
- PACT_RESOURCE_ADMIN_KEY: separate random bearer secret for resource uploads.

Keep the sponsor private key and resource-admin key in Cloudflare Worker secrets. Do not put them in Wrangler vars, GitHub source, the browser, or this chat.

## 3. Prepare a valid buyer agent

Register a real testnet agent using the trusted CIS-8004 registry. Its badge must pass the official checks:

- Token address points to trusted contract 12802,0.
- Registry record is active.
- The current owner account is present.
- Agent Card is reachable.
- Agent Card hash matches the on-chain metadata hash.
- Badge, token address, chain, owner, and contract fields match.
- A valid on-chain agentWallet is registered.

The public sample badges inspected so far failed one or more checks. Do not bypass the verifier to make an old badge pass. Register or repair a real testnet agent, then check it using the live endpoint:

https://pact-access.vercel.app/api/access/registry/<CIS-8004-token-address>

A valid response has status verified, ownerAccount, and payerAccount. A rejected badge returns 403. A registry outage returns 503.

## 4. Upload a protected resource

After the facilitator Worker is deployed and PACT_RESOURCE_ADMIN_KEY is set, run this in PowerShell. Keep the key in a local environment variable.

~~~powershell
$env:PACT_RESOURCE_ADMIN_KEY = "<your-resource-admin-secret>"
$headers = @{ Authorization = "Bearer $env:PACT_RESOURCE_ADMIN_KEY" }
$body = @{
  resourceId = "https://pact-access.vercel.app/api/access/resource"
  contentType = "application/json"
  content = '{"dataset":"pact-test","rows":[{"id":1,"value":"protected"}]}'
} | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Put -Uri "https://pact-access.vercel.app/api/access/resources" -Headers $headers -ContentType "application/json" -Body $body
~~~

The resource limit is 256 KiB. Supported content types are application/json, text/csv, and text/plain.

## 5. Run the buyer agent

Use the verified request ID shown by the owner console. Keep the registered agent wallet private key only in the local shell or a secret manager.

~~~powershell
cd cloudflare/facilitator-worker
npm install
$env:PACT_ACCESS_REQUEST_ID = "<verified-request-uuid>"
$env:PACT_BUYER_AGENT_WALLET_ADDRESS = "<registered-agentWallet>"
$env:PACT_BUYER_AGENT_WALLET_PRIVATE_KEY = "<agentWallet-private-key>"
npm run demo:buyer
~~~

The CLI uses the official Concordium x402 client. If Pact returns HTTP 202, the transaction may already be broadcast. Reuse the same request ID to reconcile it. Do not make a second payment.

## 6. Evidence required before submission

- Valid testnet badge passes the official Agent Registry verifier.
- Owner signs the exact 90-second challenge in Concordium Browser Wallet.
- Pact accepts only the current owner and current agentWallet.
- Buyer agent receives x402 requirements and pays from that registered wallet.
- Facilitator sponsors the transaction fee and waits for finalization.
- Pact verifies payer, recipient, amount, and CCD asset.
- Exact protected bytes are returned after the paid state is committed.
- Transaction hash opens in CCDScan.
- Invalid badge, wrong owner, changed wallet, bad signature, replay, expiry, wrong payer, failed finality, and registry outage all fail closed.

No genuine owner proof, CCD payment, CCDScan transaction link, or protected resource delivery has been demonstrated yet. Do not describe the end-to-end flow as complete until those checks pass.

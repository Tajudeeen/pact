# Pact Access

**Proof-gated access for autonomous agents.**

Pact Access lets sellers protect paid APIs, datasets, and agent tools behind a privacy-preserving Concordium requirement. A buyer must prove the required fact before x402 payment can settle and the resource can be delivered.

The first gate is intentionally narrow: prove that the active CIS-8004 owner authorized the agent's payment wallet. The owner signs a short-lived message, and Pact checks that signature against fresh Concordium account credentials. The agent pays from its on-chain `agentWallet`. No identity attributes are revealed.

## The flow

1. A buyer agent requests a protected resource.
2. Pact challenges the buyer for the required proof. Without it, access is denied before payment or delivery.
3. The registered owner signs Pact's request-bound message with the Concordium Browser Wallet.
4. Pact verifies the owner's signature, then checks the active registry owner and the agent's on-chain `agentWallet` match the request and x402 payer.
5. Pact coordinates x402 settlement.
6. Pact delivers the resource only after payment is confirmed.
7. The seller sees a sanitized audit trail for blocked and cleared requests.

## Why Pact

Agents are becoming customers of APIs, datasets, and other agents. Sellers need a way to apply access requirements without collecting identity documents or trusting a checkbox in an agent's profile.

Pact puts the verification gate in the request and payment path. Missing, invalid, mismatched, expired, or unverifiable proofs fail closed.

## Current status

Pact has a working free-tier access and owner-proof path. The complete x402 payment path is still being prepared.

- The React app is live at [pact-access.vercel.app](https://pact-access.vercel.app).
- The main Cloudflare Worker and D1 database handle Concordium CIS-8004 badge checks, one-use challenges, and server-side owner-signature verification.
- Owner signatures are verified against fresh Concordium testnet account credentials and their account/key thresholds. The copied agent handoff contains the verified request id, not the raw signature.
- Production negative testing confirmed that an invalid signature returns HTTP 401 and is recorded as blocked in D1.
- The dedicated x402 facilitator source is in `cloudflare/facilitator-worker/`. Its TypeScript check and Wrangler bundle pass. The bundle is about 1.13 MiB and is configured for the Workers Free CPU budget.
- The facilitator URL currently runs a fail-closed placeholder. It reports `x402: not-deployed`, has payment configuration disabled, and returns HTTP 503 for protected resource requests. The full bundle is not deployed because the GitHub repository is missing the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` Actions secrets.
- The sponsor account, seller payout account, price, sponsor private key, and protected-resource admin key remain unset. No testnet payment or real resource delivery has occurred.
- The public testnet agent badges inspected so far fail the official Agent Registry verifier. A valid badge, owner proof, testnet payment transaction, CCDExplorer link and end-to-end demo are still required.

See [the Cloudflare Free backend runbook](docs/CLOUDFLARE_FREE_BACKEND.md) for deployment details and the exact setup steps. Original Somnia/dreamDEX perps history is preserved in Git history. The current product scope is Pact Access for the Concordium Trusted Agents Hackathon.

## Initial build scope

- One seller, one protected resource, one buyer agent.
- One Concordium owner-signature check and one CIS-8004 agentWallet binding.
- One Concordium testnet x402 payment path.
- Reusable TypeScript gateway/middleware.
- Fail-closed proof and settlement state machine.
- Sanitized audit timeline and clear blocked/cleared dashboard states.
- Real testnet proof/payment evidence and a short end-to-end demo.

## Security boundaries

- Resource delivery follows verified proof and confirmed payment, never frontend state.
- Owner signatures must be bound to the right network, account, agent, seller and request context. The x402 sender must match the current on-chain agentWallet.
- Chain or facilitator failure blocks access.
- No names, identity documents, raw credentials, secrets, or unsafe reusable proof material in logs.
- A signature proves only control of the account that signed it. It does not prove extra identity attributes.
- Test fixtures and simulations are labeled and never presented as live chain evidence.

## Development

the production frontend is served through Vercel. the main access API and a fail-closed facilitator placeholder run on Cloudflare Workers Free and share D1. the main Worker handles trusted registry checks, 90-second owner challenges, and server-side Concordium account-signature verification. a successful proof opens a 12-minute access window for x402 settlement.

the full Concordium x402 facilitator implementation lives in `cloudflare/facilitator-worker/`. its TypeScript check and Wrangler bundle pass, but the full bundle is not deployed yet because the repository is missing the `CLOUDFLARE_API_TOKEN` Actions secret. the live facilitator health route reports `paymentsEnabled: false`, and the resource route returns HTTP 503 until the final Worker and testnet payment settings are configured.

see [the Cloudflare Free backend runbook](docs/CLOUDFLARE_FREE_BACKEND.md) and [integration decisions](docs/INTEGRATION_DECISIONS.md) for current trust boundaries, required deployment secrets, and remaining proof/payment work.

## Competition submission evidence

The release is not complete until it has:

- a public repository with reproducible setup;
- a testnet deployment;
- real proof verification and real payment transactions;
- CCDExplorer transaction links;
- a demo showing blocked request → proof → payment → delivery;
- clear privacy, failure, and production-rollout documentation.

See [the Pact Access product specification](docs/PACT_ACCESS_SPEC.md).

# Pact Access

**Proof-gated access for autonomous agents.**

Built for the [Concordium Trusted Agents Hackathon](https://www.concordium.com/article/concordium-trusted-agents-hackathon-encode-club).

## Problem

Agents are starting to act as paying customers of APIs, datasets, and other agents' tools. A seller who wants to put a requirement in front of that traffic has two bad options today: collect identity documents the agent cannot provide, or trust a checkbox in the agent's own profile that anyone can tick.

## Solution

Pact Access puts a verification gate in the request and payment path itself, not in a form. Before a protected resource is delivered, the agent must prove that the current Concordium account which owns its active CIS-8004 registration authorized the agent's on-chain payment wallet. The owner signs a short-lived, request-bound message; Pact checks that signature against fresh Concordium account credentials server-side, not a client claim. The agent then pays from that same registered `agentWallet` through the official Concordium Exact x402 scheme. Missing, invalid, mismatched, expired, or unverifiable proof fails closed, before payment or delivery.

### What the proof does and does not establish

A Concordium account signature proves control of that account's keys. It is bound here to the agent's current CIS-8004 owner and `agentWallet`. It does **not** prove age, nationality, uniqueness, or any other personal attribute, and it is not a zero-knowledge human-identity proof. Do not describe or market it as one.

## The flow

1. A buyer agent requests a protected resource.
2. Pact challenges the buyer for the required proof. Without it, access is denied before payment or delivery.
3. The registered owner signs Pact's request-bound message with the Concordium Browser Wallet.
4. Pact verifies the signature, then re-checks that the active registry owner and the agent's on-chain `agentWallet` still match the request and the x402 payer.
5. Pact coordinates x402 settlement on Concordium testnet.
6. Pact delivers the resource only after payment finality is confirmed.
7. The seller sees a sanitized audit trail for both blocked and cleared requests.

## Current status

Last verified state (see [docs/SUBMISSION.md](docs/SUBMISSION.md) for the dated snapshot this is drawn from):

**Deployed and exercised:**
- The React frontend is live at [pact-access.vercel.app](https://pact-access.vercel.app).
- The main Cloudflare Worker and D1 database handle CIS-8004 badge checks, one-use owner challenges, and server-side Concordium signature verification over gRPC-Web.
- A production negative-signature test returned HTTP 401 and was correctly recorded as `blocked / invalid_signature` in D1.

**Built, not yet deployed:**
- The dedicated x402 facilitator (`cloudflare/facilitator-worker/`) passes TypeScript checks and Wrangler bundling, but its Worker deployment is blocked on one missing GitHub Actions secret, `CLOUDFLARE_API_TOKEN`. Until that is added, the live facilitator URL is a fail-closed placeholder: it reports `x402: not-deployed` and returns HTTP 503 for protected-resource requests.
- Seller payout account, sponsor account and private key, CCD price, and the resource-admin key are all unset.

**Not yet demonstrated:**
- No genuine owner proof, settled CCD payment, CCDScan transaction link, or real resource delivery has occurred yet. The public testnet badges inspected so far fail the official Agent Registry verifier.

Do not read any part of this project as a complete end-to-end demo until a real badge passes verification, a real owner signs, a transaction finalizes on testnet, and the exact protected bytes are retrieved. [docs/PC_CHECKLIST.md](docs/PC_CHECKLIST.md) is the exact, step-by-step path to close this gap, starting with that one GitHub secret.

**Added in this pass, additive and not yet wired into the deployed path:** a deterministic per-seller spend-limit ledger (`server/access/spend-limit.ts`, both an in-memory and a SQL/D1-backed implementation) that caps a buyer's spend per request and over a rolling window, independent of whether the identity proof is valid. It is fully unit-tested (`tests/access-spend-limit.test.ts`, plus two new cases in `tests/access-pipeline.test.ts`) and plugs into `AccessPipeline` as an optional dependency, so it changes nothing about the currently deployed Worker unless a seller policy is explicitly passed in. Worth flagging directly: [docs/PACT_ACCESS_SPEC.md](docs/PACT_ACCESS_SPEC.md) lists spend limits as an explicit non-goal for this first release, on the reasoning that scope should stay narrow until the one real testnet payment flow above is proven. Treat this as a reviewed, ready-to-enable addition for after that milestone, not a reason to deprioritize it.

Original Somnia/dreamDEX perps history is preserved in Git history; it is not part of the current product scope.

## Why Pact

Sellers need a way to apply an access requirement to agent traffic without collecting identity documents or trusting a self-reported badge. Pact puts the check in the request and payment path, where it cannot be bypassed by the client simply not asking.

## Security boundaries

- Resource delivery follows verified proof and confirmed payment, never frontend state.
- Owner signatures must be bound to the right network, account, agent, seller, and request context. The x402 sender must match the current on-chain `agentWallet`.
- Concordium RPC or facilitator failure blocks access; nothing is marked verified on a timeout.
- No names, identity documents, raw credentials, secrets, or reusable proof material appear in logs or audit records.
- A signature proves only control of the account that signed it, nothing more.
- Test fixtures and simulations are labeled as such and never presented as live chain evidence.
- The optional spend-limit ledger (above) reserves capacity before settlement is attempted, so two concurrent requests from the same buyer cannot both race past the same cap; it fails closed, with no configured policy treated as "no additional cap," never as "unlimited by default."

## Submission requirements

Per the official programme page, a complete submission needs:

- [x] A concise project description and problem/solution statement — above.
- [x] Public source repository — this repo.
- [ ] A demo video, no longer than three minutes, following the order in [docs/JUDGE_GUIDE.md](docs/JUDGE_GUIDE.md#the-complete-demo-still-required).
- [ ] A real Concordium testnet transaction link from CCDScan — pending the facilitator deployment above.
- [x] A short go-live plan — summarized below, in full in [docs/SUBMISSION.md](docs/SUBMISSION.md#go-live-plan).

Do not submit a demo built from unit tests, synthetic signatures, or a simulated payment presented as live chain evidence.

## Go-live plan

Start with one seller and one protected resource. Sellers configure the canonical resource URL, CCD price, payout account, and sponsor. Buyers register agents with a valid CIS-8004 badge and set the `agentWallet` on-chain. Pact re-checks the registry binding before owner-proof acceptance and again before settlement. The facilitator sponsors network fees, requires finalized settlement, and records a transaction hash. Expand to more sellers only after the first testnet flow and its failure cases are independently reproduced. Full version, including monitoring and key-custody notes: [docs/SUBMISSION.md](docs/SUBMISSION.md#go-live-plan).

## Development

The production frontend is served through Vercel. The main access API and the facilitator placeholder run on Cloudflare Workers Free and share D1. The main Worker handles trusted registry checks, 90-second owner challenges, and server-side Concordium signature verification; a successful proof opens a 12-minute window for x402 settlement.

```bash
pnpm install
pnpm test         # vitest, full suite
pnpm typecheck    # tsc --noEmit
pnpm dev          # local API server
pnpm dev:web      # local frontend
```

The full facilitator implementation lives in `cloudflare/facilitator-worker/`; see [docs/CLOUDFLARE_FREE_BACKEND.md](docs/CLOUDFLARE_FREE_BACKEND.md) for the exact deployment steps and required secrets, and [docs/INTEGRATION_DECISIONS.md](docs/INTEGRATION_DECISIONS.md) for the trust-boundary reasoning behind them.

## Documentation index

- [docs/JUDGE_GUIDE.md](docs/JUDGE_GUIDE.md) — ten-second and one-minute versions for reviewers, plus every failure case Pact is expected to handle.
- [docs/SUBMISSION.md](docs/SUBMISSION.md) — the full submission checklist, demo recording order, and go-live plan.
- [docs/PC_CHECKLIST.md](docs/PC_CHECKLIST.md) — the exact remaining steps to deploy the facilitator and produce real testnet evidence.
- [docs/PACT_ACCESS_SPEC.md](docs/PACT_ACCESS_SPEC.md) — product scope, proof boundary, and explicit non-goals for this release.
- [docs/INTEGRATION_DECISIONS.md](docs/INTEGRATION_DECISIONS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — design and trust-boundary detail.
- [SECURITY.md](SECURITY.md) — vulnerability reporting.

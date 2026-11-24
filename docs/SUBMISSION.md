# Concordium Trusted Agents Hackathon submission checklist

Official programme page: https://www.concordium.com/article/concordium-trusted-agents-hackathon-encode-club

## Current project

Pact Access is a proof-gated gateway for paid APIs, datasets, and agent tools. The initial proof establishes control of the current Concordium account that owns an active CIS-8004 agent, then binds that owner to the agent's on-chain agentWallet. The agent pays through the official Concordium Exact x402 scheme. Pact releases the protected resource only after payment finality.

The proof boundary is deliberately narrow. A Concordium account signature proves account-key control. Pact does not claim that this first release proves age, nationality, uniqueness, or another personal identity attribute. Do not call it a ZK human-identity proof.

## Current status on November 16, 2026

The main Cloudflare access Worker and D1 database are live. Testnet account-info retrieval over gRPC-Web and Ed25519 verification have been exercised. A production negative-signature smoke test returned 401 and recorded blocked / invalid_signature in D1. The current registry endpoint returns 403 for the invalid public testnet badge that was inspected.

The full x402 facilitator source passes TypeScript and Wrangler bundling. The live facilitator URL is still a fail-closed placeholder because the GitHub Actions secret CLOUDFLARE_API_TOKEN has not been configured. Payment health reports x402: not-deployed, and protected-resource access returns HTTP 503. No genuine owner proof, payment, transaction hash, or resource delivery has been demonstrated.

## Submission requirements

- A concise project description and clear problem/solution statement.
- Public source repository: https://github.com/Tajudeeen/pact
- Demo video no longer than three minutes.
- A real Concordium testnet transaction link from CCDScan.
- A short go-live plan covering seller integration, agent onboarding, payment sponsorship, secrets, monitoring, and failure handling.

Do not submit a demo that presents unit tests, synthetic signatures, or a simulated payment as live chain evidence.

## Remaining evidence checklist

- [ ] Deploy the full facilitator Worker using the GitHub Actions secret described in docs/CLOUDFLARE_FREE_BACKEND.md.
- [ ] Configure seller payout account, sponsor account, sponsor private key, CCD price, and resource-admin secret in Cloudflare.
- [ ] Register a valid active testnet CIS-8004 agent with a reachable Agent Card, matching metadata hash, and registered agentWallet.
- [ ] Obtain a genuine owner signature in Concordium Browser Wallet.
- [ ] Run the buyer-agent CLI from the registered agentWallet.
- [ ] Confirm the x402 transaction finalizes on Concordium testnet.
- [ ] Confirm payer, payee, amount, and CCD asset match the request.
- [ ] Retrieve the exact protected resource and record its SHA-256.
- [ ] Capture the CCDScan transaction link and sanitized Pact audit states.
- [ ] Exercise expired/replayed challenge, owner change, agentWallet change, invalid payment, and pending finality cases.
- [ ] Record a three-minute demo showing blocked request → owner signature → x402 payment → finalized delivery.
- [ ] Freeze the repo and verify every claim in the README, judge guide, and submission description.

## Demo order

1. Show the protected resource request blocked without a valid agent and owner binding.
2. Show the active CIS-8004 badge and the current owner/agentWallet resolution.
3. Sign the request-bound challenge in Concordium Browser Wallet.
4. Show Pact verifying the signature against fresh testnet account credentials.
5. Let the registered buyer agent request x402 terms and pay from its agentWallet.
6. Show finality, transaction hash, protected bytes, and the sanitized audit record.

If any real testnet step is still unavailable on recording day, say exactly which part is not live. Do not hide the gap with a mock.

## Go-live plan

Start with one seller and one protected resource. Sellers configure the canonical resource URL, CCD price, payout account, and sponsor. Buyers register agents with a valid CIS-8004 badge and set the agentWallet on-chain. Pact re-checks the registry binding before owner-proof acceptance and again before settlement. The facilitator sponsors network fees, requires finalized settlement, and records a transaction hash. Monitor registry outages, pending finality, failed transactions, D1 state conflicts, and resource integrity. Keep all sponsor and buyer wallet private keys in dedicated secret stores. Expand to more sellers only after the first testnet flow and failure cases are independently reproduced.


## Official judging criteria mapping (verified 2026-11-20)

Source: https://www.concordium.com/article/concordium-trusted-agents-hackathon-encode-club

- Depth of Concordium use: CIS-8004 registry re-checks at challenge, proof and settlement; Ed25519 verification against fresh testnet account credentials; x402 facilitator source based on the official Exact scheme (not deployed). The brief's Verified by Concordium identity badge is **not** implemented — Pact's proof is owner-account control and is labeled as such everywhere.
- Core flow end to end: challenge and owner-proof path is verified live; payment, finality and resource delivery are disabled and stated as such. No step is presented as complete when it is not.
- Real problem: sellers of paid APIs/data need attribute-based access without collecting identity documents (see docs/PACT_ACCESS_SPEC.md).
- Route to mainnet and real users: see the go-live plan above; first one seller and one resource, expand only after a reproduced testnet flow.
- Required artifacts: public repo and description exist. The demo video, **CCDExplorer link** and go-live plan are submission artifacts still to be produced. No transaction exists yet, so no CCD link can be supplied without fabrication.

Judge re-verification is available in the workspace at `/app/evidence` and in `docs/hackathon-intelligence.md` and `docs/problem-inventory.md`.

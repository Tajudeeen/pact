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

This repository is being reworked from its original Somnia/dreamDEX perps prototype into Pact Access for the Concordium Trusted Agents Hackathon.

- Original trading implementation remains available in Git history.
- New product specification: [docs/PACT_ACCESS_SPEC.md](docs/PACT_ACCESS_SPEC.md).
- Integration research and decisions: [docs/INTEGRATION_DECISIONS.md](docs/INTEGRATION_DECISIONS.md).
- The landing page now presents Pact Access. Legacy perps routes are hidden from the app entry points.
- Concordium testnet/mainnet use canonical CAIP-2 identifiers (`ccd:4221332d34e1694168c2a0c0b3fd0f27` and `ccd:9dd9ca4d19e9393877d2c44b70f89acb`). The official `@x402/concordium` package and Concordium account-signature verification APIs are documented integration paths, not yet wired into Pact.
- Implemented locally in the branch: request-bound owner-signature message, one-time challenge storage, Concordium account-signature verifier adapter, CIS-8004 owner/agentWallet binding adapter, fail-closed access pipeline, SQLite persistence, and tests.\n- The SDK clients, live registry resolver, x402 facilitator, Hono middleware, and protected resource route are not yet wired. No testnet proof, payment, or delivery evidence is claimed until it exists and can be independently checked.

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

The existing repository uses TypeScript, React, Vite, and a Cloudflare Worker. The new gateway and adapters are being introduced behind clear boundaries rather than carrying the old trading runtime into the product. The current pipeline has a SQLite repository implementation and typed adapters, but is not yet mounted into the Hono app or connected to the Concordium SDK, live Agent Registry, x402 facilitator, or protected seller endpoint.

See [integration decisions](docs/INTEGRATION_DECISIONS.md) for official SDK paths, trust boundaries, and the remaining implementation checklist.

## Competition submission evidence

The release is not complete until it has:

- a public repository with reproducible setup;
- a testnet deployment;
- real proof verification and real payment transactions;
- CCDExplorer transaction links;
- a demo showing blocked request → proof → payment → delivery;
- clear privacy, failure, and production-rollout documentation.

See [the Pact Access product specification](docs/PACT_ACCESS_SPEC.md).

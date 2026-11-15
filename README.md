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
- Concordium testnet uses `ccd:4221332d34e1694168c2a0c0b3fd0f27`. The current integration targets the official `@x402/concordium`, `@x402/core`, and `@x402/hono` 2.31.0 packages and Concordium Web SDK 12.0.2.
- PR #9 merged the product pivot. PR #11 contains the phase-two implementation and remains a draft pending live testnet proof.
- Implemented: Concordium SDK account verification and transaction status adapters, official Agent Registry MCP resolver, CIS-8004 owner/agentWallet binding, request-bound wallet signing, x402 Hono hooks and middleware factory, server-side buyer-agent payment wrapper, self-hosted finalization-required Concordium facilitator, finality reconciliation, SQLite state/audit persistence, and protected file resource routes.
- The server can mount Pact Access when `PACT_ACCESS_ENABLED=true`. The facilitator still needs a separate deployment and sponsor secret, while the registry ID, seller resource, buyer-agent key, and testnet transactions need configuration and end-to-end proof.

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

The existing repository uses TypeScript, React, Vite, and a Cloudflare Worker. The new gateway and adapters are being introduced behind clear boundaries rather than carrying the old trading runtime into the product. The current branch has a concrete runtime factory and optional server mounting. When `PACT_ACCESS_ENABLED=true`, `server/index.ts` mounts the challenge endpoint and one file-backed protected resource behind the existing origin and rate-limit middleware. The file path is server-configured, symlink-checked, and size-limited. The facilitator, registry ID, owner wallet, buyer-agent key, and seller resource still need real testnet configuration.

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

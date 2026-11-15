# Pact Access integration decisions

Last checked: 2026-11-15

This document records external integration facts that affect the implementation. It is not evidence that Pact has integrated or deployed them.

## 1. Concordium account ownership proof

The first Pact gate uses Concordium's documented account-signature verification flow, not a Web3 ID attribute presentation.

1. The server creates a random 32-byte challenge and stores it with the exact seller, resource, agent, payer, network, policy, and expiry.
2. The server returns one canonical, domain-separated message containing those fields.
3. The buyer connects the Concordium Browser Wallet and signs that exact message with the current agent owner account.
4. The backend fetches fresh account information from the matching Concordium network node.
5. The backend verifies the signature against the account's current on-chain credentials with `verifyMessageSignature`.
6. Pact consumes the challenge once, then checks that the signed account is the current CIS-8004 owner and that the on-chain `agentWallet` is the x402 payer.

Official docs:
- Account ownership signature proof: https://docs.concordium.com/en/mainnet/tutorials/verify-account-ownership-signature-proofs/signature-proofs.html
- Wallet connector and signMessage example: https://docs.concordium.com/en/mainnet/tutorials/verify-account-ownership-signature-proofs/signature-proofs.html
- Concordium account/identity relationship: https://docs.concordium.com/en/mainnet/learn/accounts/index.html

Important distinction: a signature proof establishes control of an account's private key. It does not prove an age, nationality, or other identity attribute. Concordium accounts are created from verified identity credentials, and the Agent Registry links agent ownership to that identity layer. Account records can have one or more credential holders, and Concordium also supports company identities. Pact therefore describes the initial gate as a verified Concordium owner account, not a guarantee that exactly one natural person controls every account.

The server uses a fresh 32-byte random challenge encoded as 64 hex characters and a 90-second expiry. The signed message is bound to the request, seller, resource, buyer agent, owner account, registered payment wallet, network, policy, and expiry. Challenges are persisted and consumed atomically once. The server fetches fresh account credentials at verification time, never trusts a client-provided accountInfo object, and never verifies signatures in the browser.

Canonical CAIP-2 network identifiers:
- Testnet: `ccd:4221332d34e1694168c2a0c0b3fd0f27`
- Mainnet: `ccd:9dd9ca4d19e9393877d2c44b70f89acb`

The first release uses testnet only.

## 2. Agent ownership must be proven, not asserted

The Agent Registry uses CIS-8004 records. The registry record has an on-chain owner. The Concordium Badge resolver checks the registry record, owner, active status, and Agent Card hash.

A badge or Agent Card alone is not a proof that the current payer is controlled by that owner. Pact resolves the agent's current owner and requires the signed account to equal that owner, while the x402 sender must equal the current on-chain `agentWallet`. CIS-8004 `setAgentWallet` requires the owner to authorize the change and the new wallet to prove control. This gives the registered owner a separate, explicitly registered payment wallet for the autonomous agent.

Official docs:
- Agent Registry overview: https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/index.html
- CIS-8004: https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/cis-8004.html
- Concordium Badge: https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/concordium-badge.html

## 3. Concordium x402 is an official implementation

Concordium's x402 integration is in the official x402 repository and has a dedicated TypeScript package:

`@x402/concordium@2.31.0`

It implements the Exact scheme with sponsored V1 transactions and includes client, server, and facilitator components. The package's server scheme parses fixed prices and enriches requirements with the facilitator's `feePayer`. The facilitator validates the sender, sponsor, recipient, exact amount, asset, expiry, sender signature, and transaction safety, then submits and waits for finalization.

Official sources:
- Concordium x402 integration guide: https://docs.concordium.com/en/mainnet/how-to/integrations/x402-integration.html
- Package usage and API: https://www.npmjs.com/package/@x402/concordium
- Hono middleware: https://www.npmjs.com/package/@x402/hono
- Official x402 facilitator responsibilities: https://github.com/x402-foundation/x402/blob/main/docs/core-concepts/facilitator.md

The current official TypeScript packages are `@x402/concordium@2.31.0`, `@x402/core@2.31.0`, and `@x402/hono@2.31.0`. The Concordium package implements x402 protocol V2 using a partially signed Concordium V1 sponsored transaction. Its server scheme defaults to the `authorization` payment flow, which settles before the resource handler. For Hono, register the package's `ExactConcordiumScheme` with `x402ResourceServer`, then wrap it in `x402HTTPResourceServer` and `paymentMiddlewareFromHTTPServer`. Use a facilitator endpoint that advertises the Concordium testnet network and Exact scheme. Do not assume the default `https://x402.org/facilitator` supports Concordium. The Concordium facilitator must be configured with a sponsor account and its private key kept server-side.

The implementation now exposes concrete adapters in `server/access/concordium-node.ts`, `server/access/concordium-registry-mcp.ts`, `server/access/x402-hooks.ts`, and `server/access/x402-runtime.ts`. `createPactAccessRuntime` composes these with the SQLite repository, challenge issuer, pipeline, and seller-owned resource callback. It remains dynamically loaded until the developer installs the pinned packages and regenerates the lockfile.

The x402 lifecycle is wired as follows:
- `x402HTTPResourceServer.onProtectedRequest` calls `verifyOwner` before x402 emits payment requirements. It reads `x-pact-access-request` and `x-pact-owner-proof` headers. The proof header is base64url-encoded JSON containing the Concordium account and wallet signature.
- `x402ResourceServer.onBeforeSettle` calls `beginExternalSettlement` after facilitator verification. It checks the x402 sender, canonical resource URL, amount, asset, recipient, and network against the seller's server-side payment configuration before settlement.
- `x402ResourceServer.onAfterSettle` calls `completeExternalSettlement` with the finalized transaction reference, network, and facilitator-confirmed payer. If the persistence step fails, the hook throws an `AfterSettleAbortError` so x402 fails the HTTP settlement closed.
- The protected Hono handler calls `deliverPaidResource`. It returns bytes only when the stored state is `paid`. If a prior request is already paid but the handler did not run, `onProtectedRequest` skips another charge and grants the handler access to complete delivery.

Ambiguous settlement failures remain in `payment_pending` and are blocked from another charge until reconciliation. The current runtime intentionally fails closed because the direct Concordium transaction-reconciliation adapter is still outstanding.

This keeps x402 responsible for its standard 402/verify/settle flow while Pact owns the owner gate, agentWallet binding, access state, audit, and delivery boundary.

The package's client example uses `buildBasicAccountSigner` with a private key. Pact must run that client signer inside the buyer-agent runtime, with the agentWallet key held in a server-side secret. Never put the agentWallet private key in the browser or repository. The registered owner uses the Concordium Browser Wallet only to sign Pact's short-lived ownership message.

The testnet CAIP-2 identifier is `ccd:4221332d34e1694168c2a0c0b3fd0f27`; the package documents the testnet gRPC endpoint as `grpc.testnet.concordium.com:20000`. Native CCD amounts use six decimal places, so 1 CCD is `1000000` atomic units. The facilitator's `requireFinalization` option defaults to true and should remain enabled for resource release.

The payment response is not enough by itself. Pact must verify the exact sender matches the current on-chain `agentWallet`, then release the resource only after the facilitator confirms finalization. Pending or failed settlement must never deliver resource bytes.

## 4. Product and implementation consequences

- Do not write a custom x402 payment scheme.
- Do not use an Agent Registry badge as a stand-alone authorization proof.
- Issue a fresh, server-side account-signature challenge bound to the access request and policy.
- Keep proof verification and access-policy checks separate.
- Bind the signed Concordium account to the registry owner, then bind the x402 sender to the on-chain `agentWallet`.
- Verify payment before invoking the protected resource handler.
- Make delivery idempotent and avoid returning resource bytes during proof or payment verification.
- Record sanitized request IDs, policy versions, verifier outcomes, settlement references, and delivery status. Do not log identity attributes or raw proof material.
- Keep testnet fixtures clearly marked. No fixture is a wallet proof, transaction, or delivery receipt.

## 5. Work remaining

- [ ] Add and pin compatible `@x402/concordium`, `@x402/core`, `@x402/hono`, and Concordium wallet SDK packages, then commit the pnpm lockfile.
- [ ] Wire Concordium Browser Wallet connector and `provider.signMessage` into the frontend.
- [ ] Wire `@concordium/web-sdk` node client and `verifyMessageSignature` into the backend.
- [x] Implement fresh challenge creation, short expiry, message binding, registry-derived owner/payer fields, and one-time challenge consumption.\n- [x] Implement SQLite persistence with atomic state transitions, one-time challenge consumption, delivery claims, and sanitized audit events.
- [x] Implement account-signature verification and strict CIS-8004 owner/payer binding adapters.
- [ ] Verify the signed owner account ↔ CIS-8004 `agentWallet` ↔ x402 payer binding end to end against testnet.
- [x] Implement a fail-closed orchestration pipeline behind typed adapters, including proof, owner binding, x402 settlement, reconciliation, and idempotent resource delivery contracts.
- [ ] Add one protected seller resource and one buyer flow.
- [ ] Add x402 Hono middleware and configure a Concordium facilitator with `requireFinalization: true`.
- [ ] Keep the buyer agentWallet private key in the buyer-agent runtime secret store only.
- [ ] Confirm testnet settlement/finality and capture explorer evidence.
- [ ] Run local typecheck, unit tests, build, and end-to-end smoke tests.
- [ ] Deploy and inspect the real flow before making demo claims.

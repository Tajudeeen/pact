# Pact Access

## Product

Pact Access is a proof-gated resource gateway for autonomous agents.

A seller can put a paid API, dataset, MCP tool, or other digital resource behind Pact Access. Before the resource is delivered, Pact verifies the seller's configured Concordium requirement and coordinates x402 payment. The first supported requirement is deliberately narrow: prove that the active CIS-8004 owner authorized the registered agent payment wallet. The owner signs a short-lived Concordium message, and the agent pays from the on-chain `agentWallet`. No identity attributes are disclosed.

### Proof boundary

The first implementation is an account-control proof, not a zero-knowledge proof of a human identity attribute. It verifies a fresh signature from the active CIS-8004 owner and binds that owner to the registered `agentWallet` used by x402. It does not prove age, nationality, uniqueness, or any other personal attribute. Do not market this release as a ZK identity verifier. If a future track requires a specific human-identity predicate, add a Concordium identity-proof statement and a server-side verifier for that exact predicate before making that claim.

This owner-to-agent claim is valid only when Pact verifies a fresh Concordium signature from the current active CIS-8004 owner and requires the x402 payer to match that agent's current on-chain `agentWallet`. CIS-8004 requires owner authorization and proof of control to set the payment wallet. A badge, Agent Card, or client-supplied owner address alone is not authorization.

## User promise

- Sellers can restrict paid resources without collecting identity documents or storing personal identity data.
- The agent owner signs a short-lived, server-generated message with their Concordium account. The agent pays from its registered `agentWallet`.
- Missing, invalid, mismatched, expired, or revoked authorization fails closed before payment settlement or resource delivery.
- Successful payment and access are linked to verifiable evidence.
- Pact does not claim a proof establishes anything beyond the exact attribute and binding encoded in it.

## Core demo

1. A buyer agent requests a protected resource.
2. Pact returns a proof/payment requirement. A proof-less request is denied before settlement and resource delivery.
3. The registered owner signs Pact's request-bound message with the Concordium Browser Wallet.
4. The buyer retries with proof attached.
5. Pact verifies the owner signature against fresh on-chain account credentials, checks the current CIS-8004 owner and `agentWallet`, coordinates x402 settlement, and delivers only after confirmed payment.
6. The dashboard shows both denial and clearance, with transaction links and a sanitized audit record.

## Product boundary

Pact Access is an access gateway and integration layer. It is not:
- an AI trading bot or trading terminal;
- an identity provider;
- a reputation or trust-score system;
- a custom zero-knowledge circuit;
- a promise that an identity proof guarantees agent safety.

## Initial scope

- One seller service and one protected resource.
- One buyer agent and one Concordium account-signature proof.
- One x402 payment path on Concordium testnet.
- A reusable TypeScript middleware/gateway boundary.
- Proof verification before settlement, and settlement before resource delivery.
- Fail-closed handling for missing/invalid proof, payment failure, replay, timeout, and unavailable chain verification.
- Dashboard/audit timeline showing blocked and cleared requests.
- Testnet transactions and independently inspectable evidence.

## Explicit non-goals for the first release

- Multiple identity attributes or policy combinations.
- Spend limits, mandate management, or trading execution.
- Mainnet payments.
- Custom cryptography.
- Broad production facilitator compatibility before one complete testnet flow works.
- Storing names, identity documents, or raw credential data.

## Trust and security invariants

1. Resource bytes never leave the seller boundary before proof and payment requirements pass.
2. A proof is bound to the intended Concordium network, buyer account/agent association, seller origin, and resource or request context wherever the supported SDK permits.
3. The server verifies proof validity. Client-side UI state is never authoritative.
4. Proof verification failure or chain unavailability blocks access.
5. Payment is not reported as successful until settlement is independently confirmed.
6. Resource delivery happens only after confirmed settlement.
7. Retries are idempotent and cannot double-settle or duplicate protected delivery.
8. Logs and receipts exclude personal identity data, secrets, raw credential material, and reusable proof material where unsafe.
9. A valid proof is described only as evidence of the exact attribute it proves.
10. Existing Somnia/dreamDEX trading code is preserved in Git history, but is not part of Pact Access runtime.

## Integration choices

- **Concordium account proof:** the owner signs a fresh server-generated message with the Concordium Browser Wallet. Pact fetches fresh account credentials from the matching network and verifies the signature server-side with `verifyMessageSignature`. This proves account-key control, not an age or nationality attribute. The signed message binds request, seller, resource, agent, owner account, payment wallet, network, policy, challenge, and expiry.
- **Agent identity:** resolve the trusted CIS-8004 registry and require an active agent whose current owner matches the signed account and whose on-chain `agentWallet` matches the x402 sender.
- **Payment:** use the official `@x402/concordium` package, which implements the Exact scheme with sponsored transactions and includes client/server/facilitator components. Do not implement a custom payment scheme.
- **Settlement:** verify the selected facilitator supports the exact Concordium testnet scheme/network. A pending settlement is not success. Reconcile the transaction before retrying or delivering.
- **Gateway:** keep proof, policy, payment, and protected-resource delivery behind separate interfaces. The resource handler must run only after verified proof and confirmed settlement.
- **Evidence:** local fixtures test state and failure handling only. They are never presented as a wallet proof, chain transaction, or live resource delivery.

See [integration decisions](INTEGRATION_DECISIONS.md) for official references and the implementation checklist.

## Competition evidence

- Public source repository and reproducible setup.
- Testnet deployment.
- Real proof verification and real payment transactions.
- CCDExplorer links for transactions.
- Under-three-minute demo: blocked request → wallet proof → payment → delivery.
- Documentation of architecture, privacy boundary, failure behavior, and production rollout.
- Explicitly state what is implemented, what is simulated, and what remains.


## HTTP contract

The current production flow separates the owner proof from the buyer payment handoff.

- `POST /api/access/challenges` accepts only `{ "buyerAgentId": "<CIS-8004 token address>" }`. Seller, resource, owner, and payer values come from server configuration and live registry data, never request-body authority.
- The response contains a server-generated `requestId`, one-time challenge, 90-second challenge expiry, policy identifier, and exact message to sign.
- The owner signs that exact message with Concordium Browser Wallet. The browser sends the base64url proof presentation to `POST /api/access/proofs` with the `requestId`.
- The main Worker fetches fresh finalized Concordium testnet account credentials, checks the account and credential key thresholds, and verifies the signature. Only then does it mark the D1 request `proof_verified` and extend the access window to 12 minutes for x402 negotiation and finality retries.
- The buyer-facing handoff contains only the verified request id and `GET /api/access/resource`. It never copies or exports the owner's raw signature.
- The buyer agent sends `x-pact-access-request` to `GET /api/access/resource`. The facilitator returns x402 v2 CCD payment requirements and accepts payment only from the current on-chain CIS-8004 `agentWallet`.
- The resource is delivered only after the official Concordium x402 scheme confirms finality and Pact verifies payer, seller payout address, amount, and CCD asset.

The challenge and proof endpoints are same-origin protected. The facilitator is a separate Worker. It remains fail-closed until the full x402 bundle is deployed and testnet configuration is supplied.

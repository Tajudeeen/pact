# Pact Access integration decisions

This document describes the current Concordium implementation. The previous Somnia/dreamDEX perps runtime is historical and is not used by Pact Access.

## 1. Product boundary

Pact is a proof-gated gateway for paid APIs, datasets, and agent tools. It protects one canonical resource until the buyer agent's current CIS-8004 owner authorizes the request and the agent pays from its registered agentWallet.

The first proof is an account-control proof. A signature proves control of the Concordium account key that signed it. It does not prove age, nationality, uniqueness, or another personal identity attribute. Pact must not market this version as a ZK human-identity verifier.

## 2. Agent registry

Pact trusts the Concordium testnet CIS-8004 registry at contract 12802,0. The Worker decodes the badge token address and rejects any badge outside that contract. It then calls the official Agent Registry MCP verification operations:

- check-badge validates the on-chain record, active status, badge fields, owner, chain, and registry contract.
- verify-agent-card fetches the Agent Card and verifies its hash against the on-chain metadata hash.
- agent_by_token_address resolves the current owner and registered agentWallet.

Pact requires an active record, matching badge/token/chain/contract/owner fields, a reachable Agent Card, a matching metadata hash, a valid owner address, and a valid payment wallet. Warning-only legacy notices do not override an actual validation error.

The same registry verification runs at challenge issuance, again before the owner signature is accepted, and through the facilitator before x402 terms are returned and immediately before settlement. An owner or agentWallet change blocks an unbroadcast request. A transaction already broadcast is reconciled against its original hash to prevent duplicate payment.

## 3. Owner challenge and signature

The main access Worker issues a 32-byte random challenge valid for 90 seconds. Its exact message binds:
- request ID, seller, resource, buyer agent, and network;
- the registry-resolved owner account and agentWallet;
- random challenge bytes, expiry, and policy ID.

The owner signs that exact message in Concordium Browser Wallet. The browser sends the base64url proof presentation to POST /api/access/proofs with the request ID. The Worker loads current finalized Concordium account info over the testnet gRPC-Web endpoint, checks the account address and signature thresholds, and verifies all supplied Ed25519 signatures.

The digest follows the Concordium account-signature format: SHA-256 over the 32-byte account address, eight zero bytes, and the exact UTF-8 message. Account credentials and public keys are fetched fresh for each verification. Pact does not trust account data supplied by the browser.

A successful proof consumes the challenge once and extends the access request to a 12-minute payment window. D1 stores state and coarse audit reasons, never the raw signature. The buyer handoff contains only the verified request ID and resource URL.

## 4. Official Concordium x402 scheme

Pact uses the official @x402/concordium Exact facilitator scheme. It does not implement a custom payment scheme. The facilitator Worker injects a custom signer adapter backed by Concordium's ConcordiumGRPCWebClient, avoiding the Node-only gRPC transport while retaining the official scheme's transaction checks.

The first release supports native CCD only. The payment requirements bind the exact resource URL, network, amount in micro-CCD, seller payout account, and sponsor fee-payer address. The signed sender must equal the current registry agentWallet.

The facilitator requires finalization. It sponsors the transaction, submits it to Concordium, waits for the finalized block outcome, and checks the sender, recipient, amount, and asset before Pact marks the request paid. A pending or failed transaction never releases the resource.

## 5. Worker and data boundaries

- Main access Worker: registry verification, owner challenges, owner-signature verification, and proof state.
- Facilitator Worker: protected-resource upload, x402 requirements, official scheme settlement, finality reconciliation, and resource delivery.
- D1: one-use request state, sanitized audit events, and the first protected resource.
- Vercel: React frontend and same-origin route proxying.
- Buyer-agent CLI: server-side x402 client using the registered agentWallet private key.

The protected resource is limited to 256 KiB in the first release. Supported content types are JSON, CSV, and plain text. Pact checks the resource SHA-256 before release and records a delivered state tied to the transaction reference.

## 6. Failure and retry rules

- Invalid badge, wrong registry, revoked agent, changed owner, or changed agentWallet: block before payment.
- Invalid, expired, wrong-account, or replayed owner signature: block and audit.
- Registry or Concordium account-info outage: fail closed. Transient registry/RPC outages do not consume the owner's challenge.
- Wrong x402 network, asset, sender, recipient, amount, or sponsor: reject.
- Pending finality: keep the same request and transaction reference. Retry reconciliation only.
- Uncertain broadcast: keep the request locked. Never create a second payment because the first response was lost.
- Resource missing or hash mismatch: do not release bytes.

## 7. Free-tier limits and deployment

The facilitator Worker is configured for the Workers Free 10 ms CPU limit. Its checked bundle is approximately 1.13 MiB, below the script size limit. A real x402 transaction is still needed to measure runtime CPU use and finality behavior. No live payment or resource delivery has been demonstrated.

The main access Worker is deployed and healthy. The final facilitator bundle remains undeployed because GitHub Actions is missing the CLOUDFLARE_API_TOKEN secret. The account ID is a non-secret workflow value. See docs/CLOUDFLARE_FREE_BACKEND.md.

## 8. Evidence boundary

A passing local test proves only the tested code path. A synthetic signature is not a real owner wallet proof. A public testnet RPC read is not a payment. A build artifact is not a deployed facilitator. A payment hash is not enough without finalized outcome checks and resource delivery. The release gate is a reproduced testnet flow with a valid badge, genuine owner signature, finalized CCD payment, exact protected bytes, sanitized audit record, and CCDScan link.

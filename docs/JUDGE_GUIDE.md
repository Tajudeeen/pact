# pact access judge guide

## ten seconds

pact is a proof-gated gateway for paid apis, datasets, and agent tools. an agent's current CIS-8004 owner signs a request-bound Concordium challenge. the buyer then pays from the agent's registered `agentWallet` before pact releases the protected resource.

## one minute, current live build

1. open [pact access](https://pact-access.vercel.app).
2. show the live `/api/health` response. it confirms the Cloudflare Worker and D1 are ready.
3. enter a public testnet badge that the official Agent Registry verifier reports as invalid. pact rejects it before issuing an owner challenge.
4. explain that a valid owner proof is checked by the Worker against fresh Concordium account credentials, not trusted because the browser says it succeeded.
5. show `/api/access/payment-health`. it currently reports `x402: not-deployed` and `paymentsEnabled: false`. the resource endpoint deliberately returns HTTP 503.

this is the honest production state today. a production negative-signature test returned HTTP 401 and D1 recorded the request as `blocked / invalid_signature`. it used a synthetic signature only, not a real wallet proof or payment.

## the complete demo still required

1. the buyer agent requests a protected resource.
2. pact resolves a valid, active testnet CIS-8004 badge and returns a 90-second challenge bound to that owner, agent, seller, resource and registered payment wallet.
3. the registered owner signs the exact challenge with Concordium Browser Wallet.
4. pact verifies the signature against fresh finalized account credentials and extends the verified access window to 12 minutes.
5. the buyer agent requests the resource using the verified request id and receives x402 CCD payment requirements.
6. the buyer pays from the registered `agentWallet`. the facilitator sponsors network fees, waits for Concordium finality, and checks the payer, payee, amount and asset.
7. pact releases the protected resource and returns the finalized transaction hash for CCDScan.

do not call this complete until the badge passes the official verifier, the real owner signs, the transaction finalizes, and the exact protected bytes are retrieved.

## what the proof establishes

the first release proves control of the Concordium account that owns an active CIS-8004 agent and binds that owner to the agent's current payment wallet. it does not prove age, nationality, uniqueness, or any other personal identity attribute. do not describe it as a zero-knowledge human identity proof.

## failure cases

- unknown or malformed badge: rejected before challenge.
- revoked agent, wrong trusted registry, owner mismatch, invalid Agent Card, or metadata hash mismatch: rejected.
- expired or replayed owner challenge: rejected.
- wrong account or invalid Ed25519 signature: rejected and audited.
- Concordium RPC outage: no proof is marked verified.
- wrong x402 sender, amount, payee, asset, or network: payment rejected.
- pending, failed, or mismatched finality: no resource bytes released.
- lost response after broadcast: the same request id is reconciled. pact must not ask the buyer to pay again.

## current release evidence

- the main access Worker and D1 are deployed on Cloudflare Workers Free.
- testnet account-info retrieval over gRPC-Web and Worker Ed25519 verification have been exercised.
- a production invalid-signature test returned HTTP 401 and was recorded as `blocked / invalid_signature`.
- the full x402 facilitator source passes TypeScript and Wrangler bundling. the GitHub workflow skips deployment because `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are not yet configured as Actions secrets.
- a fail-closed facilitator placeholder is deployed. it reports payments disabled and returns HTTP 503 for the protected resource.
- a valid public testnet badge, genuine owner proof, finalized CCD payment, resource delivery, and CCDScan link remain pending.

see [the Cloudflare Free backend runbook](CLOUDFLARE_FREE_BACKEND.md) for the deployment path and required configuration.

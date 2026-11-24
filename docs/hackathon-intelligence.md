# Hackathon intelligence — Concordium Trusted Agents (Encode Club)

Source: https://www.concordium.com/article/concordium-trusted-agents-hackathon-encode-club
Accessed: 2026-11-20 (browser render; curl/urllib receive 403 from this environment).

## Verified facts

- Free six-week online programme with Encode Club. Weeks 1–3 learn (2–18 Nov),
  weeks 4–6 build (19 Nov – 9 Dec) on Concordium testnet.
- Deadline: 9 Dec 2026, 23:59 UTC. Judging 10–11 Dec 2026.
- Goal: make an agent accountable — prove a **verified human stands behind it**,
  keep a record, and pay/get paid. Badge shows "an accountable person stands
  behind the agent, never who that person is".
- Components: Verified by Concordium badge (verified once with an independent
  Identity Provider), Agent Registry entry, ERC-8004 Agent Card, x402 payments
  with sponsored fees, hosted MCP Server, A2A.
- Five suggested starting points (not fixed tracks). Pact is closest to
  "Gate a service on a proven attribute, such as age, without storing anyone's
  personal data" and "Build audit trails that support EU AI Act record keeping".
- Judging (verbatim intent): test tokens are free so transaction counts play no
  part; judges look at depth of use of Concordium identity, Agent Registry and
  agent payments; believable route to mainnet and real users; whether the core
  flow works end to end; and whether it solves a real problem.
- Submission must contain: description, public repository, demo video ≤3 min,
  **CCDExplorer link**, and a short go-live plan. Platform locks at deadline.
- Grants: first way into a 75 million CCD grants programme; "grants go to
  projects with real usage rather than the best pitch".

## Verified current state of Pact (live reads, 2026-11-20)

`curl https://pact-access.vercel.app/api/health` returns HTTP 200 with:
`status=ok`, `storage=ready`, `runtime=cloudflare-workers-free`,
`database=d1`, `challengeIssuance=configured`,
`ownerSignatureVerification=configured`, `accountInfoRpc=concordium-testnet-grpc-web`,
`payments=disabled`, `resourceDelivery=disabled`.

`curl https://pact-access.vercel.app/api/access/payment-health` returns HTTP 200
with `x402=not-deployed`, `facilitatorConfigured=false`, `paymentsEnabled=false`,
`resourceCount=0`, `resourceDelivery=disabled`, reason: final facilitator bundle
not deployed. The direct facilitator Worker returns the identical payload.

## Honest gaps (not verified / not implemented)

- No Verified by Concordium identity badge proof; Pact's gate is an account-control
  signature from the CIS-8004 owner (per docs/PACT_ACCESS_SPEC.md). This is not a
  human-identity proof and must never be described as one.
- No testnet payment transaction, no CCDExplorer link, no resource delivery.
- The full x402 facilitator bundle is not deployed (missing CLOUDFLARE_API_TOKEN
  Actions secret); sponsor keys, payout account and price are unset.
- No sanitized audit API, so the workspace Activity route is honestly empty.

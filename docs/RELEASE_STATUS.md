# Pact Access release status

Last checked: November 16, 2026

## Production deployment

- Frontend: https://pact-access.vercel.app
- Main access Worker: pact-access-api on Cloudflare Workers Free
- Facilitator Worker URL: https://pact-access-facilitator.tajudeenisah02.workers.dev
- Database: Cloudflare D1, pact-access
- Network: Concordium testnet
- Registry: CIS-8004 contract 12802,0

The main access Worker is deployed. The facilitator URL is a small fail-closed placeholder. The full x402 facilitator implementation has not been deployed yet.

## Verified

- Main API health route reports status ok and storage ready.
- Concordium testnet account info is retrieved through gRPC-Web.
- The Worker verifies Ed25519 signatures against current account credential keys and account/key thresholds.
- A synthetic invalid-signature production test returned HTTP 401 and produced a D1 audit row with blocked / invalid_signature. The signature bytes were not persisted.
- The live registry re-check endpoint rejects the inspected invalid testnet badge with HTTP 403.
- The owner challenge lasts 90 seconds. After a valid proof, the payment window lasts 12 minutes.
- The main repository quality suite passed install, TypeScript, tests, and production build on the last completed run.
- The facilitator package passed strict TypeScript and Wrangler bundling. The bundle is approximately 1.13 MiB uncompressed.
- The live payment health endpoint reports x402: not-deployed and paymentsEnabled: false. The resource endpoint returns HTTP 503.

Build evidence:
- Main quality run: https://github.com/Tajudeeen/pact/actions/runs/43872281570
- Facilitator build run: https://github.com/Tajudeeen/pact/actions/runs/43872490418

## Still blocked

- The GitHub repository does not yet contain the CLOUDFLARE_API_TOKEN Actions secret, so the final facilitator deployment step is skipped.
- Seller payout account, fee sponsor account, sponsor private key, price, and resource-admin secret are unset.
- The testnet badges inspected so far fail the official verifier. A valid active badge and Agent Card are still needed.
- No real owner wallet proof, CCD payment transaction, CCDScan link, or protected resource delivery has been demonstrated.
- Workers Free CPU usage for the actual x402 settlement path has not been measured with a live transaction. The 10 ms CPU cap is configured, but a real settlement must prove the implementation fits.

## Release gate

Pact is not ready for a live paid-resource release or final hackathon demo. Keep the facilitator fail-closed until a valid agent badge, funded sponsor, seller payout account, real buyer agent, finalized payment, and exact resource delivery are verified end to end.

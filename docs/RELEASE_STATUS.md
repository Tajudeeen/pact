# Pact release qualification, October 30, 2026

## Verified in this release

- Merged code is in `main` at commit `9c29a1e94acd7f5c38aafdd794976d25aea8cdf7` before this release workflow addition.
- GitHub Actions reported success for TypeScript, tests and application build on the feature PR.
- Previous Worker deployment observed via Cloudflare API: **October 24, 2026**. This is older than the code changes.
- Latest Worker code **has not been deployed or tested in the real browser** as of this document.

## Deploy the newest main branch

A manual GitHub Actions workflow is supplied at **Actions → Pact Cloudflare production release → Run workflow**. It deliberately requires the operator to enter `DEPLOY_PACT_TESTNET` and the following GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`: scoped to the appropriate account's Workers deployments.
- `CLOUDFLARE_ACCOUNT_ID`: the correct existing Cloudflare account.

No token or private wallet key should be committed to GitHub. Run the workflow from `main`. It checks dependencies, types, tests and Worker build before using `wrangler deploy --env production`. The existing `pact-testnet` Worker, Durable Object binding names and migrations must remain intact. Confirm the deployed owner and operator address after deployment.

`node scripts/check-live.mjs` performs only GET requests against `/api/health` and `/api/network`. This is an API smoke check, **not** a user-facing browser test or trading qualification.

## Still unverified

- Mobile wallet login and in-browser approval flow, including Android Chrome wallet browser and iOS Safari.
- Dedicated operator's current address, permissions, STT gas and owner's paper USDso margin.
- Real funded entry, decoded matching fill, close, independent flat-position observation and full chain receipt.
- Actual DoraHacks whitelist acceptance.
- Required two X posts and authentic links.
- Real screen-recorded execution video.

For a trade, explicitly approve the currently shown parameters in the Pact UI. Never fund or trade through a new operator address without checking it against the current Account page. Mainnet remains disabled.

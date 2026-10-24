# Pact build preview

Private Site: https://pact-build-preview.deeen-code.chatgpt.site

Site project: `appgprj_6adc1c9c5b508191940fed6f71aeefd6`.
The Site source checkout is separate from the GitHub trading repository. Preserve that identity and owner-only access on updates.

## What it runs

The actual React app with a preview-only API adapter in `src/preview/runtime.ts`. The adapter reuses pure setup definitions, replay snapshots, validation, sizing and receipt calculations from `src/core`. It simulates practice transitions and stores records in browser local storage. Hash routing supports static-host reloads. Wallet access, operator access and all testnet account/order requests are refused.

The server continues using Node SQLite and the durable executor for real testnet integration. A browser-local simulation is not evidence that the server persists or reconciles a blockchain order. The existing service/adapter regression tests cover controlled cases separately. Actual testnet fills and mobile-wallet checks remain pending.

## Update it

1. Edit and test the GitHub source. Run `pnpm test`, `pnpm build` and `pnpm build:preview` as appropriate to changed inputs.
2. Update the existing Site source with the sanitized source and the preview build. Do not copy `.git`, `.env`, `.data`, sessions, operator keys or database files. Keep its `.openai/hosting.json` and existing source repository identity.
3. In the Site checkout use a static `dist` manifest and an empty `dev` script when using the managed static preview. The GitHub checkout retains its normal Node development command.
4. Use the Sites source workflow to push the exact preview source, package `dist`, then save and deploy privately. Reuse returned source, version and deployment identities on retries. Do not change access to publish.
5. Verify practice entry and exit, refresh navigation, a refusal, and the exported receipt. Document what was observed separately from Node/SQLite or chain qualification.

## Current observed checks

Desktop Chrome passed the complete simulated order path, refresh persistence and JSON receipt export. The official Playwright CDN returned an HTML error page. Downloading Chrome Headless Shell 151.0.7922.34 from Google's official Chrome-for-Testing storage succeeded, its ZIP integrity check passed, and its executable reported its version. The browser cache is under the task workspace because the executor's home-directory cache can reset between turns. Browser QA used the supported managed cloud browser rather than that local executable.

No mobile-wallet approval or live testnet transaction was performed.

## Live quote display

The separate market-display provider fetches anonymous BTC/ETH testnet quotes from the deployed `/api/markets` endpoint without cookies. Quote failures are shown as unavailable or stale. The banner distinguishes live testnet quotes from browser-local simulated trades. This does not grant wallet, operator or trading access to the preview. See [LIVE_MARKETS.md](LIVE_MARKETS.md).

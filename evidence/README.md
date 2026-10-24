# Pact evidence register

Evidence is separated by what it actually establishes. No live order hashes, funding outcomes, users or awards are invented.

| Evidence                         | What it establishes                                                                                                                                                 | Limits                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm test`                      | Pure sizing, API ownership, atomic approvals, invalid-mark handling, exact signed payload, close timeout/restart/flat checks and rendered consent/recovery behavior | Local fixtures, fake venue, deterministic replay                   |
| Actual single-process HTTP smoke | Built app shell served 200, API health/storage ready, practice sign-in returned 200                                                                                 | No external browser visual QA                                      |
| `pnpm typecheck` / `pnpm build`  | Type correctness and production asset compilation                                                                                                                   | Does not establish runtime trading                                 |
| `read-only-probe.json`           | Actual observed chain/discovery/connectivity results                                                                                                                | No order or fill                                                   |
| Practice receipts                | Simulated entry/close records and approval terms                                                                                                                    | No blockchain transaction                                          |
| `browser-verification.json`      | Desktop practice checks and successful Chromium installation                                                                                                        | Mobile wallet and server-backed browser recovery remain unverified |
| Actual testnet lifecycle         | Pending                                                                                                                                                             | Needed for the bounty                                              |
| Desktop browser practice QA      | Approval, simulated fill/close, reload persistence and receipt download passed                                                                                      | Browser-local practice, no blockchain transaction                  |

The latest observed probe passed: chain ID **50383**, **21 perp markets**, and a valid on-chain mark for the discovered ZRO market. An earlier WebSocket/genesis-check failure was resolved using the SDK’s supported proxy-aware constructor seam with explicit retirement-error handling. See `read-only-probe.json` for the exact timestamp and results. **Orders placed: 0.**

Local checks: **78 tests across ten files**, workspace type checking and production compilation passed. The DOM integration tests render React and call the real API/service/storage boundary, including the attention-to-closed recovery flow. They do not establish visual browser or mobile-wallet behavior.

## Browser preview verification

The private ChatGPT Site publishes the same screens with a labeled, browser-local practice adapter. Desktop checks passed: landing → session → setup → account-specific sizing → consent → simulated fill → close → refresh → downloaded receipt. The receipt was inspected: replay mode, closed state, two simulated fills, zero net PnL and no transaction hashes. See `browser-verification.json` for the exact scope. This does not qualify the Node execution adapter or mobile-wallet flow.

## Execution regression evidence

The local suite reproduces the three review findings with controlled inputs: an invalid zero mark must not prepare a close, a fresh close on an hour-old trade must not immediately time out, and improved entry prices with increased funding must use the freshly checked execution payload. The suite also checks signing that crosses the approval deadline, quantity/hash/role/price mismatches, shared operator blocking, a reverted close without retries, and retaining risk until a flat-position observation. No real wallet or chain transaction is used by these fixtures.

## Actual execution evidence to add

After funded execution, add sanitized receipts and transaction links identifying network, pool, owner/operator, side, approval, fill quantity and close result. Redact any private transport or credential data. Keep the full signed action body private in `.data`.

Tests are behavioral evidence within their inputs, not proof of production reliability, adoption or profitable trading.

## Cloudflare acceptance, 24 October 2026

Deployment: https://pact-testnet.tajudeenowoeteniyan.workers.dev. Initial provider deployment ID `e1ef91e9ac8146ce94ba28b2597f837e`, SQLite migration `v1`, native WebSocket SDK constructor.

- Local workerd: complete HTTP practice flow passed using real SQLite Durable Objects and alarms. A full dev-worker stop/start preserved the opaque session and its five accounts.
- Deployed Worker: practice approval, alarm-driven simulated fill, close and receipt passed. Repeated approval returned the same intent. Cross-session access and late entry were refused. The lost-response scenario reconciled and closed. No hash was fabricated.
- Deployed read-only probe at `2026-10-24T07:14:08.275Z`: chain 50383, 21 markets, valid mark. This checks network connectivity, not trading permissions, margin or actual execution.
- Owner allowlist regression tests reject a different wallet and reject an older challenge after an owner restriction is applied.
- No real testnet order was placed. Owner linking, gas/margin funding, matching entry/close fills and wallet/mobile signing remain pending.

The Playwright CDN retry still returned invalid ZIP content. The previously downloaded official Chrome-for-Testing Headless Shell launches and reports version 151.0.7922.34. Deployment UI verification uses the managed cloud browser. Local browser installation does not establish wallet compatibility.

## Live market quote integration

The deployed endpoint returned actual BTC/ETH testnet marks, best bids/asks, pool addresses and index oracle timestamps. The rendered landing page displayed those observations as live. 78 tests across ten files pass, with cache, malformed/invalid mark, stale timestamp, partial outage, wrong-network and rendered stale-state coverage. Source outages retain the last valid observation and time, with a stale label. No quote check submits a trade. [Integration detail](../docs/LIVE_MARKETS.md).

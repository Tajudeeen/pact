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

Local checks: **66 tests across eight files**, workspace type checking and production compilation passed. The DOM integration tests render React and call the real API/service/storage boundary, including the attention-to-closed recovery flow. They do not establish visual browser or mobile-wallet behavior.

## Browser preview verification

The private ChatGPT Site publishes the same screens with a labeled, browser-local practice adapter. Desktop checks passed: landing → session → setup → account-specific sizing → consent → simulated fill → close → refresh → downloaded receipt. The receipt was inspected: replay mode, closed state, two simulated fills, zero net PnL and no transaction hashes. See `browser-verification.json` for the exact scope. This does not qualify the Node execution adapter or mobile-wallet flow.

## Execution regression evidence

The local suite reproduces the three review findings with controlled inputs: an invalid zero mark must not prepare a close, a fresh close on an hour-old trade must not immediately time out, and improved entry prices with increased funding must use the freshly checked execution payload. The suite also checks signing that crosses the approval deadline, quantity/hash/role/price mismatches, shared operator blocking, a reverted close without retries, and retaining risk until a flat-position observation. No real wallet or chain transaction is used by these fixtures.

## Actual execution evidence to add

After funded execution, add sanitized receipts and transaction links identifying network, pool, owner/operator, side, approval, fill quantity and close result. Redact any private transport or credential data. Keep the full signed action body private in `.data`.

Tests are behavioral evidence within their inputs, not proof of production reliability, adoption or profitable trading.

# Testnet operator runbook

## Before enabling

Use Node 24.13+, a writable persistent SQLite volume, a correct public origin and healthy HTTP/WebSocket access. Run `pnpm run doctor`. A passing chain read or market list is not trade execution evidence.

The SDK is pinned to `@somnia-chain/markets-sdk@0.32.1`. It uses WebSocket chain reads. A host that only permits ordinary HTTP may discover markets but fail at `getPerpState` with a genesis-check error. The optional constructor honors a host's HTTPS proxy configuration and safely handles connection retirement. The latest recorded probe passes all three stages using that constructor in this host. No HTTP-only read fallback is claimed.

For the deployed Cloudflare runtime, follow [CLOUDFLARE.md](CLOUDFLARE.md). Its operator is generated privately in durable storage, so no operator key needs to be supplied in chat or the browser. The steps below describe the Node alternative unless stated otherwise.

## Account setup

- Wallet A is a dedicated EOA owner, funded with test USDso in its perps margin.
- Key B is a separate dedicated operator, funded with STT for gas. Put B's private key in the server's secret environment, never in chat, Git, a browser variable or a screenshot.
- Use dreamDEX's **Link a Bot** on A to grant B the perps market permissions. The service checks place/cancel/reduce permissions on the selected pool.
- Do not trade manually, run another bot, or reuse the operator in another process while Pact manages the account.
- Only the signed-in EOA can be added. A dreamDEX smart account with a different address from its login wallet is not supported by this version.

Paper USDso restricts markets and leverage settings. The protocol's size preview is authoritative. If extra bounty USDso is needed, ask the organizers with a clear reason and use a separate non-Arena bounty account. Never move it into a Perps Arena account.

## Enable explicitly

Set `PACT_ORIGIN` to the app's exact origin, configure `PACT_OPERATOR_PRIVATE_KEY`, set `PACT_TESTNET_TRADING=true`, and restart. Open Account, sign in with A, verify B's displayed address, and add the testnet account. Publish a small testnet setup at the current market's valid ticks. Preview and approve only after reading the recorded account and monitored-exit terms.

A $25 server notional cap applies in addition to personal limits. A $25 limit is not proof the account or market meets its own minimum. No order is sent if the allowed quantity falls below the minimum.

## Collect real evidence

Before the first order, open Account, sign in with the configured owner and press **Check testnet access** for BTC or ETH. The authenticated `/api/readiness?market=BTC-PERP` endpoint only reads the signed-in owner's account. It checks Tokyo chain ID before discovery, the separate operator, place/cancel/reduce permissions, operator STT balance, healthy funded margin, a flat dedicated account, resting orders in the selected market, mark validity and a two-sided book. RPC failure produces an error, never a ready report. Browser-local practice cannot call this authenticated check.

The gas check reserves two 10,000,000 gas limits at the observed gas price. This is a conservative onboarding reference, not a fee guarantee. Before signing either leg, the adapter separately checks balance against the prepared transaction's actual fee ceiling. Reports expire 30 seconds after the read began and clear on a market/wallet change. Passing them does not establish enough margin, depth or size for a particular setup. The normal preview, approval and fresh simulation still apply.

The adapter checks the simulation's explicit boolean result, including non-reverting refusals. A close taking over five seconds to prepare is left unsent with risk reserved. Recovery can re-observe the position before another close attempt. No order was placed to qualify these changes.

1. Save the actual order transaction hash and its confirmed receipt.
2. Verify the pool, owner, side, quantity and price against the approval.
3. Verify decoded fill events, not only transaction success.
4. Check monitoring status. It is not native TP/SL.
5. Close from Pact and reconcile the close hash and fills. If outside exposure changes or the close cannot safely proceed, manage the account manually in dreamDEX and record the limitation.
6. Export the receipt and capture the demo. Actual funding remains an incomplete component, so do not describe it as complete net PnL.

## Recover an order

An attention state retains its planned-risk reservation. The worker keeps checking the saved transaction. On the order page, **Check recovery** runs the same read-only check immediately. It sends no transaction and does not grant new trading consent.

1. Read the named reason and follow the saved hash to the explorer. Keep the dedicated owner account separate from other trading.
2. For invalid marks or temporary RPC failures, wait for fresh valid data. If the observed entry fills and current position still match, Pact resumes monitoring. Monitoring remains unavailable while the observations are invalid.
3. For pending entry or close transactions, inspect the original hash and operator nonce. A two-minute timeout is measured from that action's recording time, not from the original trade. Recovery keeps its entry/close identity across restarts. Do not send a second order to guess what happened.
4. A successful close receipt still requires matching fills and a fresh flat-position read. If the account is not flat, risk stays reserved. Inspect the unexpected position in dreamDEX. Recovery will recheck it without placing another close.
5. For a reverted close, unexpected fill, missing durable action, or external position change, use **Inspect position in dreamDEX**. Manage the account there after checking any outstanding transaction. Pact does not retry a reverted close, force a changed position closed, invent missing fill evidence, or mark an external close as its own execution. An externally managed or unresolved order can remain in attention and block further Pact trading.
6. If another account's unresolved action blocks the shared operator, reconcile it first. An urgent exit may require direct management in dreamDEX. Do not run a second operator process or clear action rows to bypass the gate.

These behaviors are covered with controlled local transports and an actual SQLite reopen, plus the rendered recovery UI. They still require qualification against real testnet fills. No live order has been placed as part of these tests.

## Mainnet release gate

Mainnet is intentionally blocked by chain ID 50383. Before a mainnet release: confirm published addresses/SDK compatibility, implement a liquidation-buffer check, qualify stronger close protection, settle actual funding/gas attribution, prove recovery and revocation behavior, complete browser/mobile wallet QA, and obtain authorization for funded real-money execution. The bounty's final $200 requires actual mainnet orders within 30 days of launch, not simply a configuration flag.

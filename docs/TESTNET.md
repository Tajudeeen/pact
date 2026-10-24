# Testnet operator runbook

## Before enabling

Use Node 24.13+, a writable persistent SQLite volume, a correct public origin and healthy HTTP/WebSocket access. Run `pnpm run doctor`. A passing chain read or market list is not trade execution evidence.

The SDK is pinned to `@somnia-chain/markets-sdk@0.32.1`. It uses WebSocket chain reads. A host that only permits ordinary HTTP may discover markets but fail at `getPerpState` with a genesis-check error. The optional constructor honors a host's HTTPS proxy configuration and safely handles connection retirement. The latest recorded probe passes all three stages using that constructor in this host. No HTTP-only read fallback is claimed.

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

1. Save the actual order transaction hash and its confirmed receipt.
2. Verify the pool, owner, side, quantity and price against the approval.
3. Verify decoded fill events, not only transaction success.
4. Check monitoring status. It is not native TP/SL.
5. Close from Pact and reconcile the close hash and fills. If outside exposure changes or the close cannot safely proceed, manage the account manually in dreamDEX and record the limitation.
6. Export the receipt and capture the demo. Actual funding remains an incomplete component, so do not describe it as complete net PnL.

## Mainnet release gate

Mainnet is intentionally blocked by chain ID 50383. Before a mainnet release: confirm published addresses/SDK compatibility, implement a liquidation-buffer check, qualify stronger close protection, settle actual funding/gas attribution, prove recovery and revocation behavior, complete browser/mobile wallet QA, and obtain authorization for funded real-money execution. The bounty's final $200 requires actual mainnet orders within 30 days of launch, not simply a configuration flag.

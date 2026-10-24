# Pact architecture

## User promise

A shared setup gets an account-specific check, one explicit approval, and an inspectable outcome. The application must not claim that submission means fill, or that monitoring means an exchange-held stop.

## Boundaries

| Path                 | Responsibility                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/core`           | Exact decimal sizing, admission and receipt calculations. No network or database access.                  |
| `server/app.ts`      | Hono routes, request validation, origin checks, session ownership and rate limiting.                      |
| `server/auth.ts`     | Time-limited domain-bound SIWE message, one-use nonce and hashed opaque sessions. EOA signatures only.    |
| `server/service.ts`  | Plan publication, preview binding, atomic approval/reservation, durable execution and reconciliation.     |
| `server/store.ts`    | Node SQLite connection for the shared record store.                                                       |
| `server/dreamdex.ts` | Official SDK discovery/reads plus simulated and pre-signed viem operator writes. Testnet chain enforced.  |
| `server/replay.ts`   | Explicit deterministic market scenarios. No credentials, network or transaction hashes.                   |
| `server/socket.ts`   | Optional supported SDK WebSocket constructor for Node hosts using an HTTPS CONNECT proxy.                 |
| `src/pages`          | Landing, setups, account-specific preview, orders/receipts, authoring, rules, account and evidence pages. |

## Data path

1. An author publishes immutable setup terms with a canonical SHA-256 digest.
2. A preview binds the setup, account, effective risk policy and current snapshot. It expires after 15 seconds.
3. Approval verifies session ownership, current terms and policy, active reservations and budgets in a synchronous SQLite transaction, `BEGIN IMMEDIATE` on Node or `transactionSync` in the Durable Object.
4. A unique `(account, plan, version)` approval points to one intent. Repeated clicks return it.
5. The single-process executor rechecks the account and market. A worse price, excess quantity/risk, lower size allowance or stale approval blocks submission. The approved `decision` remains immutable. A separate `execution` records the fresh decision and is the exact quantity/price supplied to simulation and signing. Receipts include both the approval bound and checked execution limit/planned risk.
6. Before broadcasting testnet execution, an immutable action row contains the signed raw transaction, its computed hash, nonce, per-action `recordedAt` timestamp and decoding metadata. The unique `(intent, role)` constraint prevents another action for the same leg.
7. Reconciliation checks that hash, receipt status and decoded fill quantities. A lost response stays uncertain, with risk still reserved. Timeouts use the matching action timestamp, with a matching submission-event fallback for older databases. Attention retains its leg identity by the durable action, and continues reconciliation. It is never treated as a failed order to retry.
8. A matching entry fill and current position open monitoring. The monitor reads position and mark validity separately from entry admission, rejects invalid/nonpositive/stale/future marks, and pauses with a named attention reason.
9. Closing is a separate action. Matched close fills and a fresh zero-position observation are both required before declaring it closed and releasing its reservation. Unknown or mismatched positions retain planned risk.
10. The worker rechecks attention states. An owner-only, same-origin recovery endpoint runs the same reconciliation under the process lock. It only reads the existing action and position. It never signs, broadcasts, replaces or retries an order. A reverted close or externally changed position stays visible for management in dreamDEX. Both entry and close submissions share the unresolved-operator gate.

The JSON record store is intentionally small. It is not a high-volume analytics schema. Monetary values are serialized as decimal strings. Approval/action identities are separate SQL columns with uniqueness constraints, not only JSON checks.

## Risk model

Quantity is the smallest allowance across personal planned risk, protocol max, visible depth, margin and notional cap, floored to the lot grid. Entry price stays inside the published entry range and slippage bound. Funding reserve uses the per-market funding window normalized to hours.

`planned risk = entry-to-stop loss + stop slippage reserve + funding reserve`

Current protocol maker/taker trading fees are zero and builder fees are not requested. The risk model does not enforce a maximum realized loss. It does not yet include a separate liquidation-price buffer; execution must use small dedicated testnet accounts, and mainnet qualification is blocked on adding and testing that check. Live daily-loss accounting remains conservative: a closed testnet trade with incomplete net PnL consumes its approved planned-risk allowance rather than pretending its actual cost is known.

## Node deployment alternative

One Node 24 process serves the built React app, API, SQLite connection and timer-driven executor. Use one persistent volume. The timer-based Node entrypoint requires this persistent process. Cloudflare instead uses the Durable Object runtime described below. Do not scale the Node executor to multiple replicas.

Only server code imports the markets SDK and accesses the operator key. The browser receives public configuration, operator address and the user's own records. It never receives the private key or signed raw transaction body.

No financial order is placed during install, build, tests or the read-only doctor.

## Cloudflare runtime

`server/records.ts` is the shared synchronous SQL store. `cloudflare/sqlite.ts` adapts Durable Object SQL cursors and `transactionSync` without changing approval or action uniqueness. `cloudflare/worker.ts` serves embedded static assets and routes API requests to the configured owner/operator lane through typed RPC.

One Durable Object is the coordination atom for a shared operator nonce. Every handler and alarm joins one serial promise queue, including network awaits. Independent operators require independent keys and objects. This is intentionally a small single-owner testnet deployment, not a globally scalable multi-user trading service.

A mutation saves its next alarm before writing new work. Active intents keep alarms armed before external reads or execution. When there is no pending practice work or active testnet work, the alarm is removed and SDK connections close. Open simulated positions need no background mark checks. Cloudflare alarms are wakeups, not a hard one-second execution guarantee. Network failures or runtime delays can pause monitoring. There is no exchange-native stop.

The dedicated Cloudflare operator is generated once in private durable key-value storage. Its public address appears in configuration. Its private key has no API, export or rotation path. Preserve the namespace and owner routing identity across deploys. The only permitted testnet owner is checked before issuing or redeeming a wallet challenge and again on authenticated requests.

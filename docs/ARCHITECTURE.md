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
| `server/store.ts`    | SQLite transactions, persisted records, unique approval and action constraints.                           |
| `server/dreamdex.ts` | Official SDK discovery/reads plus simulated and pre-signed viem operator writes. Testnet chain enforced.  |
| `server/replay.ts`   | Explicit deterministic market scenarios. No credentials, network or transaction hashes.                   |
| `server/socket.ts`   | Optional supported SDK WebSocket constructor for Node hosts using an HTTPS CONNECT proxy.                 |
| `src/pages`          | Landing, setups, account-specific preview, orders/receipts, authoring, rules, account and evidence pages. |

## Data path

1. An author publishes immutable setup terms with a canonical SHA-256 digest.
2. A preview binds the setup, account, effective risk policy and current snapshot. It expires after 15 seconds.
3. Approval verifies session ownership, current terms and policy, active reservations and budgets in `BEGIN IMMEDIATE`.
4. A unique `(account, plan, version)` approval points to one intent. Repeated clicks return it.
5. The single-process executor rechecks the account and market. A worse price, excess quantity/risk, lower size allowance or stale approval blocks submission.
6. Before broadcasting testnet execution, an immutable action row contains the signed raw transaction, its computed hash, nonce and decoding metadata. The unique `(intent, role)` constraint prevents another action for the same leg.
7. Reconciliation checks that hash, receipt status and decoded fill quantities. A lost response stays uncertain, with risk still reserved. It is never treated as a failed order to retry.
8. An observed fill opens monitoring. Closing is a separate action and confirmed fills become a receipt.

The JSON record store is intentionally small. It is not a high-volume analytics schema. Monetary values are serialized as decimal strings. Approval/action identities are separate SQL columns with uniqueness constraints, not only JSON checks.

## Risk model

Quantity is the smallest allowance across personal planned risk, protocol max, visible depth, margin and notional cap, floored to the lot grid. Entry price stays inside the published entry range and slippage bound. Funding reserve uses the per-market funding window normalized to hours.

`planned risk = entry-to-stop loss + stop slippage reserve + funding reserve`

Current protocol maker/taker trading fees are zero and builder fees are not requested. The risk model does not enforce a maximum realized loss. It does not yet include a separate liquidation-price buffer; execution must use small dedicated testnet accounts, and mainnet qualification is blocked on adding and testing that check. Live daily-loss accounting remains conservative: a closed testnet trade with incomplete net PnL consumes its approved planned-risk allowance rather than pretending its actual cost is known.

## Deployment model

One Node 24 process serves the built React app, API, SQLite connection and timer-driven executor. Use one persistent volume. Do not place this executor on an ephemeral request-only function host, or scale it to multiple replicas.

Only the Node server imports the markets SDK and operator key. The browser receives public configuration, operator address and the user's own records. It never receives the private key or signed raw transaction body.

No financial order is placed during install, build, tests or the read-only doctor.

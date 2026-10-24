# Cloudflare testnet runbook

Pact runs at https://pact-testnet.tajudeenowoeteniyan.workers.dev. The app and API share the same origin. Cloudflare Workers serves the frontend and a SQLite-backed `PactLane` Durable Object stores the session, approvals, risk reservations, signed actions and dedicated operator.

## Owner and operator

Configured owner: `0x541291139b59570D1CD5D0E64df217b3F6efd7c8`.

Initial operator public address: `0x2E33B949b7a8C49b5156d666ed614F12fb798235`. Always compare this with the current address displayed on **Account** before funding or linking it.

The deployment generates a separate operator key once inside private durable storage. The browser receives only its public address. It never asks for the owner's private key. There is no signing-key export endpoint. Preserve the Durable Object namespace, owner routing identity and stored data. Changing the owner variable selects a different lane and key. Never do that with unresolved actions or open positions. Recoverability of exported key backups or key rotation is not implemented.

1. Open **Account** in a browser with the owner wallet's injected provider.
2. Sign the domain-bound sign-in message. Sign-in alone grants no trading permission.
3. In dreamDEX testnet, link the displayed operator to the owner's perps markets. Fund its STT gas and the owner's eligible paper USDso perps margin.
4. Add the signed-in account, publish a small testnet setup at valid current ticks, and check the size. Server preflight verifies permission and account state.
5. Read the bounds and monitored-exit terms before approving. The server caps each entry at 25 USDso notional. A market's minimum may exceed the permitted size, in which case no order is sent.
6. Observe matching entry fills, close and reconcile the position, then export the receipt. Save actual transaction links separately. None have been recorded yet.

WalletConnect QR pairing and smart-account owner mapping are not implemented. On a phone, use a wallet's own browser if it injects the expected EOA provider. That mobile-wallet path is unverified.

## Deploy and verify

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build:cloudflare
pnpm check:cloudflare
pnpm exec wrangler deploy --env production --minify
```

The Cloudflare connection can also upload the same Wrangler-built ESM bundle with the SQLite class migration and bindings. The initial deployment used that API because the local CLI had no independent login. No separate provider or database service is required.

Default local configuration has trading disabled and origin `http://localhost:8788`. `pnpm dev:cloudflare` uses local storage. The production environment in `wrangler.jsonc` declares the exact deployed origin, owner and enabled testnet adapter. Subsequent CLI deploys must use `--env production`. API uploads must preserve bindings and the current migration tag.

```bash
PACT_SMOKE_URL=https://pact-testnet.tajudeenowoeteniyan.workers.dev pnpm smoke:cloudflare
```

This command creates isolated practice sessions and simulated orders, tests duplicate approval, cross-session access, late-entry refusal and lost-response reconciliation, then closes the practice positions. It never signs or submits a real order. It requires the seeded practice setup to remain valid. Once it expires, publish a new practice setup rather than silently extending historical terms.

`GET /api/health` checks storage. `GET /api/network` performs read-only network discovery and mark validation. Neither verifies gas, owner/operator permissions, margin sufficiency or a filled trade.

## Alarms and recovery

Every mutating API request saves a wakeup before application writes. A serial queue coordinates HTTP requests and alarm callbacks, including asynchronous network operations. This keeps one operator nonce lane and avoids overlapping position management.

Active work re-arms its alarm before external I/O. Durable alarms keep the executor independent of an open browser or an in-memory Node timer. Idle lanes remove their alarm and close SDK connections. The nominal interval is one second while work exists, but alarm scheduling, provider limits and RPC latency can delay it. This is monitored protection, not an exchange-native stop or maximum-loss guarantee.

The shared service persists the signed transaction and hash before broadcasting. Recovery checks that original hash and position. It never blindly replaces a transaction. The operator lane stays blocked when an unresolved transaction makes another broadcast unsafe. Inspect the position directly in dreamDEX if urgent. Do not clear the database or namespace to remove a blocking state.

## Scope and remaining qualification

This is a small single-owner testnet deployment. The coordination atom is one operator and its shared nonce. Other operators require separate keys and lanes. Public traffic capacity, alarm costs under prolonged attention states, real fills, wallet/mobile compatibility and production load have not been qualified. Cloudflare plan quotas still apply.

The private ChatGPT Site remains a separate browser-local practice preview. It has no operator key, durable backend or trading permissions. Updating it does not deploy this Worker, and deploying this Worker does not update that preview.

## Public quotes

Migration `v2-public-quotes` adds the separate `PactMarketFeed` class and `PACT_MARKETS` binding. Preserve the existing `PactLane` namespace and owner routing identity. The public quote object has no operator key or private account records. See [LIVE_MARKETS.md](LIVE_MARKETS.md) for the read-only API, caching, deadlines and freshness rules.

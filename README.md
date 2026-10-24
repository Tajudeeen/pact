# Pact

**One setup. Your terms.**

A trade idea arrives in a group. Pact checks whether its entry still holds, sizes it around each person's account and risk rules, and records one explicit approval before execution.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty) on Somnia Tokyo testnet. Primary category: consumer perps. This is an original implementation, informed by a source review of Cadence's product and reliability patterns. No Cadence code, branding, or assets are included.

## Current status

- Complete **practice** workflow: publish, preview, approve, simulated fill, close, downloadable receipt.
- Five account scenarios: standard, late entry, stale data, thin liquidity, lost response.
- SQLite persistence, account-scoped reservations, unique approvals, exact execution rechecks and restart recovery.
- Automatic recovery checks and an owner-only recovery button. Invalid marks pause exits. A close requires both matched fills and a fresh flat-position read.
- EVM wallet sign-in and a separate, explicitly configured linked-operator testnet adapter.
- Read-only trading access checks show missing permissions, operator gas, perps margin, outside positions and market-feed blockers for the signed-in wallet. Reports expire after 30 seconds. A passing access check never approves an order.
- Read-only probe passed: chain ID 50383, 21 discovered markets and a valid live mark. **No actual testnet order has been placed by this build yet.** See [evidence](evidence/README.md).
- A [Cloudflare deployment](https://pact-testnet.tajudeenowoeteniyan.workers.dev) runs the server-backed app with SQLite Durable Objects and alarms. Testnet sign-in is restricted to the configured owner wallet.
- A [private build preview](https://pact-build-preview.deeen-code.chatgpt.site) is available on ChatGPT Sites. It simulates practice in your browser. The private preview remains browser-local practice. A demo recording and funded testnet lifecycle are still pending. The GitHub repository remains private.

The bounty's live-order requirement is still pending. A practice receipt or mocked-adapter test does not satisfy it.

Mainnet is blocked in this release. [Execution qualification and release gates](docs/MAINNET.md) document implemented defenses, independent receipt verification and the evidence still required before a future mainnet pilot.

## Who it is for

Trading communities sharing structured setups, and members who need an account-specific decision rather than copying someone else's quantity or chasing an expired entry.

Example: an entry range is 100–101, stop 98, target 107. Someone arriving at 105 gets a refusal. Someone inside the range receives a quantity based on their own planned-risk budget, available margin, liquidity, and protocol limits. Different accounts can correctly get different outcomes.

## Run it

Requires Node **24.13+** and pnpm **11.25.0**. Node's built-in SQLite is the only database dependency. Dependencies are locked in `pnpm-lock.yaml`.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm build
pnpm start
```

For the single-server build above, set `PACT_ORIGIN=http://localhost:8787` and open that URL. The API serves the built frontend and starts the executor in the same process.

For development, set `PACT_ORIGIN=http://localhost:5173`, then run in two terminals:

```bash
pnpm dev
pnpm dev:web
```

Open `http://localhost:5173`. Vite proxies `/api` to port 8787. Origin checks require the address bar's origin to match `PACT_ORIGIN` exactly, including `localhost` versus `127.0.0.1`.

On Windows, use `Copy-Item .env.example .env`. `pnpm start` uses a small Node launcher and works without POSIX environment syntax.

SQLite lives at `.data/pact.sqlite` by default. Keep `.data`, `.env`, signed transaction records and sessions private. Neither is committed.

## Try the product in two minutes

1. Press **Try it without a wallet**. Open **BTC, wait for the pullback**.
2. Choose **Practice · standard** and press **Check my size**.
3. Read the quantity, price bound, planned-risk components, account and protection mode. Confirm the terms and approve.
4. Watch **approval recorded → submitted → fill observed**. Press **Close practice position** and download its receipt.
5. Return to the setup and preview **arrives late**, **old data**, and **thin liquidity** accounts. Inspect their different decisions.
6. Try **lost response**. Its uncertain submission is reconciled without sending another simulated entry.

Practice closes at the entry price with zero simulated trading fees. It does not invent profits, transaction hashes or adoption numbers. Seeded setups expire 24 hours after the first database initialization. Publish a new practice setup with the same simulated range when they expire; production data is never silently rewritten to extend a setup's lifetime.

## Verify it

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm run doctor
```

Use **`pnpm run doctor`**, not pnpm's unrelated built-in `pnpm doctor` command. The project's doctor is read-only and writes local connectivity results to `.data/doctor.json`. It never places orders or claims execution.

The tests cover sizing bounds and grids, long/short price directions, invalid marks, stale/future data, exposure and budgets, duplicate approvals, consent expiry, cross-user isolation, policy changes, revoked plans, actual SQLite close/reopen recovery, uncertain broadcasts, persist-before-broadcast, close-specific timeouts, flat-position confirmation, and account-change/late-response consent invalidation. A rendered React recovery test calls the real API and SQLite service. Adapter tests decode the actual signed-call payload with mocked transports to check that it uses the freshly evaluated price.

Desktop browser practice QA passed through approval, simulated close, refresh persistence and receipt download. Mobile-wallet QA and a funded testnet lifecycle remain unverified. DOM integration tests exercise the real React → HTTP handler → SQLite service path without a browser or network.

Execution preflight requires the contract simulation's explicit success flag and sufficient operator balance for the prepared transaction's gas ceiling. A close signed more than five seconds after its position observation is held without broadcast. Access-check authentication, missing setup conditions, report expiry and changed-market response cancellation have regression coverage.

Entry sizing now uses the current effective margin rate, reserves trading fees, and requires an SDK liquidation projection beyond the stop with a 1% stop-price buffer. Account includes a persistent new-entry pause. Confirmed receipts bind sender, pool, nonce and calldata to the recorded transaction, wait for two canonical block confirmations, and export actual native gas evidence. Live trading fees remain unattributed rather than reported as zero. Use `pnpm run verify:receipt /path/to/receipt.json` to independently re-read closed testnet execution.

## Live market data

The landing page and workspace now show actual BTC/ETH dreamDEX testnet marks, bid/ask levels and observation age. Quotes refresh automatically. Invalid or unavailable observations never fall back to fabricated prices. Retained prices are labeled stale. The private ChatGPT preview reads the same anonymous feed while its trades remain simulated. [Source, freshness and verification](docs/LIVE_MARKETS.md).

## Branding

Pact uses a warm-charcoal and copper trade-ticket identity, a custom angular brace-and-P symbol without a wordmark, and a subtle dreamDEX logo motion background. Official dreamDEX integration attribution stays separate. [Brand sources and verification](docs/BRANDING.md).

## Private build preview

[Open Pact on ChatGPT Sites](https://pact-build-preview.deeen-code.chatgpt.site). Access is private to the owner. Start with **Try it without a wallet**. Explore the current screens, compare practice accounts, edit risk rules, publish a practice setup, approve, close and download a receipt.

This uses the same React screens, setup definitions, schemas, pure risk calculations and receipt model as the Node app. The preview adapter is a browser-local simulation. It does not run the Node/SQLite executor, test server crash recovery, sign wallet messages, connect an operator, or place testnet orders. Data stays in that browser. Locally published setup links only resolve where their data exists. **Reset preview** clears that browser's practice data after confirmation.

```bash
pnpm dev:preview
pnpm build:preview
```

Preview builds use hash navigation so refreshes work on static hosting. Standard `pnpm build` retains the server-backed app and normal URLs. `docs/PREVIEW.md` records the separate publication workflow and verification limits.

## Cloudflare deployment

[Open the server-backed app](https://pact-testnet.tajudeenowoeteniyan.workers.dev). Cloudflare serves the frontend and API, while one SQLite Durable Object coordinates the configured operator's nonce, approvals, signed actions and monitoring. Alarms advance pending work after the browser closes. The existing Node deployment remains available for local development.

```bash
pnpm build:cloudflare
pnpm check:cloudflare
pnpm dev:cloudflare
# Authenticated Cloudflare CLI, deploy the configured testnet environment:
pnpm exec wrangler deploy --env production --minify
# Exercise the deployed practice flow, without placing real orders:
PACT_SMOKE_URL=https://pact-testnet.tajudeenowoeteniyan.workers.dev pnpm smoke:cloudflare
```

The default Wrangler environment has trading disabled and uses `http://localhost:8788`. The `production` environment sets the deployed origin and owner `0x541291139b59570D1CD5D0E64df217b3F6efd7c8`. A separate operator key is generated inside private durable storage, survives restarts, and is never exposed through an API. Copy its public address from **Account**. The owner must link it in dreamDEX and fund its STT gas. Neither a deployment nor a successful network probe places an order.

Read [the Cloudflare runbook](docs/CLOUDFLARE.md) for deployment, alarms, key lifecycle, verification and limitations. `GET /api/network` checks chain discovery and a mark without signing or trading.

## Testnet execution

Read [TESTNET.md](docs/TESTNET.md) before enabling. Start with a dedicated EOA account and a separate operator key, both used only for this testnet exercise. The operator cannot be the account owner's key.

1. Fund perps margin with eligible paper USDso. Keep bounty-issued USDso out of Perps Arena accounts.
2. Configure `PACT_OPERATOR_PRIVATE_KEY` on the server, never in a browser-visible environment variable.
3. In dreamDEX, link that operator address to the signed-in owner's perps markets, and fund its STT gas.
4. Set `PACT_TESTNET_TRADING=true`, restart, sign in with the owner wallet, and add its testnet account.
5. Publish a testnet setup whose range and price ticks fit the actual market. Check its size and explicitly approve.
6. Inspect the persisted transaction hash, confirmed fill events and order timeline. Close, reconcile and save the receipt.

Testnet notional is capped at **25 USDso per entry**, in addition to the person's own cap. Chain **50383** is enforced. Mainnet trading is not implemented or enabled.

The adapter uses official SDK discovery and raw-unit chain reads. Signed operator orders use viem's simulation, signing and broadcast, with the SDK's fill decoder. The exact signed transaction, hash and nonce are persisted before broadcast. A lost response is checked by hash, not turned into a fresh order. New entries and closes both wait if another account has an unresolved operator transaction. An urgent position may need management directly in dreamDEX while that lane is blocked.

## Protection and execution limits

- A linked bot cannot arm native TP/SL for the owner. **Pact monitors exits while its process is running.** This is not exchange-native protection, and planned risk is not a maximum loss.
- The exposed ordinary linked-order path has no `reduceOnly` flag. Closing uses a **position-sized opposing FOK order**, after checking the position matches Pact's recorded fill. Outside trading between that check and inclusion can invalidate the assumption. Use a dedicated account without other bots or manual trades. A mismatch pauses automated management and requires review.
- Successful receipt status is separate from observed fills. A missing or unexpected fill is an attention state, not success. A close is complete only after matched close fills and a fresh flat-position read.
- Attention states are rechecked automatically. **Check recovery** on the order page performs the same read-only reconciliation. Valid matching positions resume monitoring. This never signs a replacement or retries a reverted close. See the [recovery runbook](docs/TESTNET.md#recover-an-order).
- A crash after persistence but before broadcast can leave a transaction unsent. Pact does not blindly retry it or sign a replacement. Operator review is required. This favors preventing duplicates over guaranteeing delivery.
- Testnet receipt net PnL stays incomplete until actual funding settlements are attributed. Gas is not silently converted into USDso.
- Wallet sign-in supports EOA `personal_sign` only. Smart-account sign-in, WalletConnect QR pairing, Telegram login and AI drafting are not implemented.
- Published setups are immutable version-1 records. Withdraw and publish a new setup for corrections. In-place revisions are not implemented.
- Cloudflare uses one persistent Durable Object per operator lane. The Node alternative uses one process with one persistent SQLite volume. Never reuse an operator in another lane or process. Production load and real testnet fills remain unqualified.

Full details: [architecture](docs/ARCHITECTURE.md), [failure behavior](docs/FAILURES.md), [security](SECURITY.md), [judge path](docs/JUDGE_GUIDE.md), [bounty checklist](docs/SUBMISSION.md), and [build evidence](evidence/README.md).

## X posts

**0 posts published. Required before submission: 2 or 3 posts tagging `@DreamDEXSomnia`.**

No placeholder post URLs are presented as evidence. Suggested topics and factual boundaries are in [SUBMISSION.md](docs/SUBMISSION.md). Add real public links here after publication.

## Bounty dates and payment

Submission closes **1 November 2026, 23:59 UTC**, or **2 November, 00:59 in Nigeria**. Results are due by 8 November. A DoraHacks email whitelist is required; its status is unverified.

Three MVP winners receive $300 at announcement and $200 after placing mainnet orders within 30 days of the perps mainnet launch. Mainnet migration is future work and needs separate verification and authorization.

Feedback entries go in individual `feedback/*.md` files. **Do not publish security vulnerabilities there.** The bounty directs security reports privately to `security@dreamdex.io`.

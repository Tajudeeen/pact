# Pact

**One setup. Your terms.**

Pact turns a shared perpetual-futures trade idea into an account-specific decision. It checks whether the entry is still valid, sizes the position against account and risk rules, and requires explicit consent before execution.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty) on **Somnia Tokyo testnet (chain ID 50383)**.

[Server-backed app](https://pact-testnet.tajudeenowoeteniyan.workers.dev) · [Private practice preview](https://pact-build-preview.deeen-code.chatgpt.site) · [Judge guide](docs/JUDGE_GUIDE.md) · [Evidence register](evidence/README.md)

> **Qualification status, October 29, 2026:** Practice flows and testnet infrastructure are implemented, but the last documented evidence contains **zero real DreamDEX orders**. A live, funded entry and close, matching on-chain fills, and an independently verified receipt are **still pending**. Do not treat simulations, read-only chain probes or mocked adapter tests as live trading proof. Mainnet trading is deliberately blocked.

## Why Pact?

A group shares an entry range, stop and target. Someone arriving after price has moved may need to skip it. Another member inside the entry window may be able to trade a different amount, based on their available margin and personal risk limits. Pact makes those decisions explicit before the user approves anything.

The workflow is **share setup → inspect live market and account → calculate eligibility and size → approve terms → observe execution → reconcile outcome**. In practice mode, execution is simulated and labeled accordingly.

## What works today

| Area | Implementation | Proof boundary |
| --- | --- | --- |
| Shareable setups and account-specific previews | Publish, size, reject late/stale/thin-liquidity scenarios | Practice and local tests |
| Live market feed | BTC/ETH testnet marks, best bid/ask and observation age | Read-only market data, never an execution claim |
| Wallet sign-in | EOA signature login, Tokyo switch/add handling, owner restriction | Mobile-wallet compatibility still unverified |
| Testnet adapter | dreamDEX SDK discovery, perps reads, linked operator, simulation and signing path | No funded entry/close yet recorded |
| Risk and recovery | Margin/fee-aware sizing, liquidation buffer, capped notional, one-use approvals, persisted reservations and nonce recovery | Local regression suite; live fill/recovery qualification pending |
| Order receipts | Canonical confirmation checks, matched fills, flat-position read, independently rebuilt fee/funding ledger | Requires actual chain data for a genuine testnet receipt |
| Hosting | Cloudflare Worker, SQLite Durable Objects and alarms | Deployed practice flow checked previously; no live trading proof |

The evidence register records **170 tests passed in the last documented local run**. This is historical evidence, not a claim that CI was rerun today. [Read the exact scope](evidence/README.md).

### Important execution limits

- Testnet entries are capped at **25 USDso notional** by the server, subject to stricter personal and market minimums.
- Linked-operator orders cannot place exchange-native TP/SL for the account. Pact monitors exits while its executor is running, and availability, latency and slippage can increase losses.
- The linked-order close route is **not protocol-enforced reduce-only**. It checks position state and uses an opposing fill-or-kill order, so external position changes can make a close unsafe.
- Uncertain broadcasts reconcile by the saved hash. Pact does not blindly resend a replacement trade.
- A successful transaction receipt alone is insufficient: matching fill events and a fresh flat-position observation are required to mark a close complete.
- STT gas is reported separately from USDso trading PnL. Incomplete bank-event coverage leaves net USDso PnL unknown.
- Mainnet trading, smart-account sign-in and WalletConnect QR pairing are not supported. [Security](SECURITY.md) · [Mainnet release gates](docs/MAINNET.md).

## Run locally

Requires **Node.js 24.13+** and **pnpm 11.25.0**. The lockfile is committed.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
# In .env, set PACT_ORIGIN=http://localhost:8787
pnpm build
pnpm start
```

Open `http://localhost:8787`. On Windows use `Copy-Item .env.example .env`. Never commit `.env`, `.data/`, operator keys, sessions or signed transaction bodies.

For frontend development set `PACT_ORIGIN=http://localhost:5173` and run `pnpm dev` and `pnpm dev:web` in separate terminals. For the static practice-only build use `pnpm dev:preview` or `pnpm build:preview`. Preview state is browser-local and never places testnet orders. [Preview details](docs/PREVIEW.md).

## Two-minute judge path

1. Open the [server-backed app](https://pact-testnet.tajudeenowoeteniyan.workers.dev) and choose **Try it without a wallet**.
2. Open **BTC, wait for the pullback** and compare the **standard** and **arrives late** scenarios.
3. Select **standard**, choose **Check my size**, read the terms and approve.
4. Inspect the **simulated** fill timeline, close the practice position and download the practice receipt.
5. Test **old data**, **thin liquidity** and **lost response** to see refusals and recovery without a second submission.

Practice transactions are intentionally simulated, with no fabricated hashes or profits. Seeded setups expire 24 hours after the database's first initialization; publish a new setup if necessary.

## Qualify a real Tokyo trade

**Only the wallet owner can approve testnet execution. Do not paste any private key into chat, GitHub or the browser.**

1. Open **Account** in the deployed app with the configured owner EOA. Confirm Tokyo chain **50383**.
2. Compare the app's **current operator public address** with the operator linked under dreamDEX **Link a Bot**. Fund operator STT gas and eligible owner paper USDso perps margin in a dedicated testnet account.
3. Run authenticated **Check testnet access**, fix any permission, margin, gas or market blockers, and review a fresh setup. The report is read-only and expires after 30 seconds.
4. After explicit approval, record a real entry hash, canonical confirmations, matched fills and current position. Then close and independently verify both close fills and a flat-position read.
5. Export a sanitized receipt and verify it with `pnpm run verify:receipt /path/to/receipt.json`. Keep raw signed actions and secrets private.

The Cloudflare deployment maintains its operator in private Durable Object storage. **Do not change or recreate the owner lane or operator identity during cleanup.** For Node-only development, the separately documented operator-secret setup applies. [Full Tokyo runbook](docs/TESTNET.md) · [Cloudflare runbook](docs/CLOUDFLARE.md).

## Test and build

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm run doctor
pnpm check:cloudflare
pnpm build:cloudflare
pnpm run release:check
```

`pnpm run doctor` is a **read-only** connectivity probe. The available Cloudflare smoke test exercises practice only:

```bash
PACT_SMOKE_URL=https://pact-testnet.tajudeenowoeteniyan.workers.dev pnpm smoke:cloudflare
```

Deploy only after reviewing the production configuration and preserving Durable Object bindings:

```bash
pnpm exec wrangler deploy --env production --minify
```

## Bounty submission status

Submission deadline: **November 1, 2026 at 23:59 UTC** (**November 2 at 00:59 Africa/Lagos**).

| Requirement | Current evidence |
| --- | --- |
| DoraHacks whitelist | Not verified |
| Real testnet entry, fill and close | Pending |
| Demo recording | Pending |
| GitHub judge access | Repository private, access unverified |
| 2 or 3 X updates tagging @DreamDEXSomnia | No published links recorded |

Track the outstanding acceptance work in [issue #1](https://github.com/Tajudeeen/pact/issues/1) and the [submission checklist](docs/SUBMISSION.md). Do not add placeholder transaction hashes, demo URLs or social links.

## Project references

[Architecture](docs/ARCHITECTURE.md) · [Failure behavior](docs/FAILURES.md) · [Live market data](docs/LIVE_MARKETS.md) · [Branding](docs/BRANDING.md) · [Judge guide](docs/JUDGE_GUIDE.md) · [Evidence](evidence/README.md) · [Security disclosure](SECURITY.md)

Pact is an independent bounty prototype. DreamDEX and Somnia names identify integrations; they do not imply an endorsement or a production-ready trading service.

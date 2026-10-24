# Pact

**One setup. Your terms.**

A trade idea arrives in a group. Pact checks whether its entry still holds, sizes it around each person's account and risk rules, and records one explicit approval before execution.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty) on Somnia Tokyo testnet. Primary category: consumer perps. This is an original implementation, informed by a source review of Cadence's product and reliability patterns. No Cadence code, branding, or assets are included.

## Current status

- Complete **practice** workflow: publish, preview, approve, simulated fill, close, downloadable receipt.
- Five account scenarios: standard, late entry, stale data, thin liquidity, lost response.
- SQLite persistence, account-scoped reservations, unique approvals, fresh rechecks and restart recovery.
- EVM wallet sign-in and a separate, explicitly configured linked-operator testnet adapter.
- Read-only probe passed: chain ID 50383, 21 discovered markets and a valid live mark. **No actual testnet order has been placed by this build yet.** See [evidence](evidence/README.md).
- No deployment URL or demo recording yet. The GitHub repository remains private.

The bounty's live-order requirement is still pending. A practice receipt or mocked-adapter test does not satisfy it.

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

The tests cover sizing bounds and grids, long/short price directions, stale/future data, exposure and budgets, duplicate approvals, consent expiry, cross-user isolation, policy changes, revoked plans, an actual SQLite close/reopen, uncertain broadcasts, persist-before-broadcast, and account-change/late-response consent invalidation in the rendered React flow.

Browser visual QA and a funded testnet lifecycle remain unverified. DOM integration tests exercise the real React → HTTP handler → SQLite service path without a browser or network.

## Testnet execution

Read [TESTNET.md](docs/TESTNET.md) before enabling. Start with a dedicated EOA account and a separate operator key, both used only for this testnet exercise. The operator cannot be the account owner's key.

1. Fund perps margin with eligible paper USDso. Keep bounty-issued USDso out of Perps Arena accounts.
2. Configure `PACT_OPERATOR_PRIVATE_KEY` on the server, never in a browser-visible environment variable.
3. In dreamDEX, link that operator address to the signed-in owner's perps markets, and fund its STT gas.
4. Set `PACT_TESTNET_TRADING=true`, restart, sign in with the owner wallet, and add its testnet account.
5. Publish a testnet setup whose range and price ticks fit the actual market. Check its size and explicitly approve.
6. Inspect the persisted transaction hash, confirmed fill events and order timeline. Close, reconcile and save the receipt.

Testnet notional is capped at **25 USDso per entry**, in addition to the person's own cap. Chain **50383** is enforced. Mainnet trading is not implemented or enabled.

The adapter uses official SDK discovery and raw-unit chain reads. Signed operator orders use viem's simulation, signing and broadcast, with the SDK's fill decoder. The exact signed transaction, hash and nonce are persisted before broadcast. A lost response is checked by hash, not turned into a fresh order. Only one unresolved operator transaction is permitted before new entries proceed.

## Protection and execution limits

- A linked bot cannot arm native TP/SL for the owner. **Pact monitors exits while its process is running.** This is not exchange-native protection, and planned risk is not a maximum loss.
- The exposed ordinary linked-order path has no `reduceOnly` flag. Closing uses a **position-sized opposing FOK order**, after checking the position matches Pact's recorded fill. Outside trading between that check and inclusion can invalidate the assumption. Use a dedicated account without other bots or manual trades. A mismatch pauses automated management and requires review.
- Successful receipt status is separate from observed fills. A missing or unexpected fill is an attention state, not success.
- A crash after persistence but before broadcast can leave a transaction unsent. Pact does not blindly retry it or sign a replacement. Operator review is required. This favors preventing duplicates over guaranteeing delivery.
- Testnet receipt net PnL stays incomplete until actual funding settlements are attributed. Gas is not silently converted into USDso.
- Wallet sign-in supports EOA `personal_sign` only. Smart-account sign-in, WalletConnect QR pairing, Telegram login and AI drafting are not implemented.
- Published setups are immutable version-1 records. Withdraw and publish a new setup for corrections. In-place revisions are not implemented.
- Deploy as **one Node process with one persistent SQLite volume**. Multiple replicas, multiple operator processes and production load are not qualified.

Full details: [architecture](docs/ARCHITECTURE.md), [failure behavior](docs/FAILURES.md), [security](SECURITY.md), [judge path](docs/JUDGE_GUIDE.md), [bounty checklist](docs/SUBMISSION.md), and [build evidence](evidence/README.md).

## X posts

**0 posts published. Required before submission: 2 or 3 posts tagging `@DreamDEXSomnia`.**

No placeholder post URLs are presented as evidence. Suggested topics and factual boundaries are in [SUBMISSION.md](docs/SUBMISSION.md). Add real public links here after publication.

## Bounty dates and payment

Submission closes **1 November 2026, 23:59 UTC**, or **2 November, 00:59 in Nigeria**. Results are due by 8 November. A DoraHacks email whitelist is required; its status is unverified.

Three MVP winners receive $300 at announcement and $200 after placing mainnet orders within 30 days of the perps mainnet launch. Mainnet migration is future work and needs separate verification and authorization.

Feedback entries go in individual `feedback/*.md` files. **Do not publish security vulnerabilities there.** The bounty directs security reports privately to `security@dreamdex.io`.

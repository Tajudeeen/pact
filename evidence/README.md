# Pact Access evidence register

This is the evidence ledger for the Concordium Trusted Agents Hackathon submission. It lists what has actually been verified, how, and what has not.

Everything under [`legacy-somnia/`](legacy-somnia/) is from the previous Somnia/dreamDEX perpetual-trading product this repository used to be. It establishes nothing about Pact Access and is kept only as historical project context, per the convention already used in `docs/` (see the "archived" banner on `docs/ARCHITECTURE.md`, `docs/FAILURES.md`, and others). Do not cite it as submission evidence.

## How to re-verify any claim in this register

| Command | What it actually establishes | What it does not |
| --- | --- | --- |
| `pnpm test` | Pipeline state-machine transitions, owner-binding checks, settlement denial paths, challenge replay/expiry handling — all against fixtures, not a live network | Real chain behavior |
| `pnpm typecheck` / `pnpm build` | Type correctness and that the frontend compiles | Runtime correctness |
| `pnpm run check:cloudflare` / `pnpm run build:cloudflare` | The Worker bundles and type-checks against the Cloudflare runtime | That it is deployed or configured correctly |
| `pnpm run live:check` | The real, current state of the deployed endpoints (`/api/health`, `/api/access/payment-health`, and optionally a CIS-8004 registry lookup), written to a timestamped file in this directory | Identity proof, payment, or resource delivery — it is a read-only reachability and status check |

`pnpm run live:check` exists specifically so that "Current status" in the README and in `docs/RELEASE_STATUS.md` is a claim you can re-run and check, not prose that quietly goes stale. Run it before recording a demo or submitting, and commit the resulting `pact-live-check-*.json` file alongside whatever it confirms or contradicts.

## What is verified as of this register

See `docs/RELEASE_STATUS.md` for the full dated snapshot. In short: the main access Worker, D1, owner-challenge issuance, and server-side Ed25519 signature verification are deployed and have been exercised, including a production negative-signature test that correctly returned HTTP 401. The dedicated x402 facilitator builds and type-checks but is not deployed, pending one GitHub Actions secret (`docs/PC_CHECKLIST.md` has the exact steps).

## What is not yet verified

No real CIS-8004 badge has passed the official Agent Registry verifier. No genuine owner signature, settled CCD payment, CCDScan transaction link, or actual protected-resource delivery has occurred. Do not treat any test fixture, synthetic signature, or simulated payment anywhere in this repository as evidence of a working end-to-end flow. `docs/JUDGE_GUIDE.md` has the exact sequence still required to close this gap.

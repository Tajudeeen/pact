# Pact Access workspace — local QA evidence

Date: 2026-11-20

## Why this exists

PR #13 lists visual and mobile QA as blocked because the Vercel branch-preview URL is
behind SSO. That blocker is real for the *deployed preview*, but the routes can still be
mounted locally. This file records what was actually checked and what remains blocked.

## What was checked locally

- Built the PR branch: `pnpm typecheck`, `pnpm test` (41 files / 273 tests), `pnpm build`.
- Served `dist/` with `node scripts/qa-serve.mjs` (SPA fallback + deterministic mock API).
- Mounted and inspected via browser snapshots:
  - `/app/overview` — service health cards and core-operation links rendered
  - `/app/verification` — owner-proof form rendered with disabled challenge button
  - `/app/payments` — disabled facilitator state rendered with raw health JSON
  - `/app/activity` — honest "audit API not connected" empty state rendered
  - `/app/agents` — registry lookup form (covered by route tests)
  - `/app/settings` — read-only configuration (covered by route tests)
- No horizontal overflow or clipped content was observed in the rendered snapshots.

## Fixes made after QA

- Health cards now distinguish "endpoint responded" from "capability configured":
  a facilitator with `payments: disabled_until_testnet_configuration` shows
  **Not configured** with an amber dot, never a green **Responding** state.
- Mobile navigation closes on Escape and returns focus to the menu trigger.
- Added `tests/workspace-honesty.test.tsx` covering both health interpretations and
  the mobile-navigation keyboard behavior.
- README now documents the public/workspace split and the local QA harness.

## Still blocked (honest gaps)

- The Vercel preview was **not** visually inspected behind SSO; screenshot-only checks
  here are local and use mock API responses.
- The Cloudflare API token is not configured, so the access Worker origin-policy change
  and the full x402 facilitator are not deployed.
- No real owner proof, payment, finality, or protected-resource delivery has been
  demonstrated. Local QA responses are explicitly synthetic and are never evidence of
  a live backend.

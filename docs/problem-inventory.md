# Problem inventory — Pact Access (evidence-led, 2026-11-20)

Evidence levels: verified | plausible hypothesis | unverified.

## PRB-001 — Live readiness evidence is discarded by the workspace (verified)

The production `/api/health` returns 11 fields including `challengeIssuance=configured`,
`ownerSignatureVerification=configured`, `accountInfoRpc=concordium-testnet-grpc-web`,
`payments=disabled`, `resourceDelivery=disabled`. The workspace collapses all of
this to "Responding / D1 storage ready" and shows nothing about which integration
is actually wired. Evidence: live curl + `src/pages/workspace/Overview.tsx`.
Severity: high — judges score depth of component use and end-to-end flow.

## PRB-002 — Two payment-health payload shapes, one brittle interpretation (verified)

Production `/api/access/payment-health` uses `paymentsEnabled: false` +
`x402: "not-deployed"` + `resourceDelivery`; the facilitator source (not deployed)
emits `payments: "disabled_until_testnet_configuration"` +
`facilitatorConfigured`. The Payments page only recognizes the second shape and
currently mislabels live production as "Payments disabled" via a fallback, while
Overview's interpretation can't see the disabled state at all. Evidence: live curl
vs `cloudflare/facilitator-worker/src/index.ts` + Overview.tsx tests.

## PRB-003 — Zero judge re-verifiable evidence on the site (verified)

The official judging criteria require a CCDExplorer link and reward working
end-to-end flows. There is no transaction to link (honest blocker), and the site
offers no copy-paste commands a judge can run to verify the claims that *are*
live (health, registry, origin policy). Evidence: official article + site UI.
Severity: high but bounded — no tx can be fabricated; verifiable commands are.

## PRB-004 — Brief/product mismatch on the human-identity claim (verified)

The brief's centerpiece is a Verified by Concordium badge proving an accountable
human. Pact deliberately implements owner account-control only. Docs are honest
about this, but the public site/judge guide do not explicitly map the gap to the
brief or state what would be needed. Score risk if a judge expects identity proof.
Evidence: official article + docs/PACT_ACCESS_SPEC.md.

## PRB-005 — Activity route empty (verified, accepted)

No sanitized audit API exists; the route correctly says so. Adding fake activity
would violate anti-fabrication. Keep as honest gap unless a backend endpoint is
built.

## PRB-006 — Local dev install breaks on Windows workerd binary (verified)

`pnpm install --frozen-lockfile` fails in this environment because
`@cloudflare/workerd-windows-64@1.20261019.1` is unavailable on npm;
`--ignore-scripts` works. CI on Linux is unaffected. Affects local QA only.

## Idea cards (generated from the verified problems, then pressure-tested)

| Idea | Problem | MVP | Rejected? |
| --- | --- | --- | --- |
| A. Wire live readiness fields into Overview + robust payment-health interpretation | PRB-001/002 | UI + tests; no backend change | SELECTED — feasible, verifiable, honest |
| B. Judge re-verification panel + evidence doc with exact live commands | PRB-003/004 | UI panel + docs; no fabricated tx | SELECTED — feasible, high judging value |
| C. Implement Verified-by-Concordium identity predicate gate | PRB-004 | Requires real IdP verification, new backend + valid badge | REJECTED for this build window — dependency unavailable, cannot verify end-to-end, anti-fabrication rule |
| D. Build sanitized audit API + populate Activity | PRB-005 | Backend auth design needed, new scope | DEFERRED — authorization model undefined (per PRODUCT_ARCHITECTURE.md) |
| E. Pin/workaround workerd Windows dependency | PRB-006 | Repo config change | REJECTED — local env only, CI unaffected; out of scoring scope |

## Scoring (skill rubric, 0–100; evidence-based estimates)

| Idea | Evidence 20 | Track 20 | Originality 15 | Feasibility 15 | Depth 10 | Demo 10 | Lasting 10 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 19 | 18 | 10 | 15 | 7 | 9 | 7 | 85 |
| B | 18 | 19 | 12 | 15 | 6 | 10 | 7 | 87 |
| C | 12 | 20 | 15 | 3 | 10 | 3 | 9 | 72 |
| D | 15 | 15 | 10 | 7 | 8 | 6 | 8 | 69 |
| E | 12 | 4 | 2 | 12 | 2 | 2 | 4 | 38 |

Top two (A and B) share a single coherent milestone: surface real live evidence
in the workspace and make every claim re-verifiable, without inventing payments.
Critical assumptions checked: both live endpoint shapes were read directly
today; no new keys or deployments required; all changes are frontend/docs with
testable acceptance criteria.

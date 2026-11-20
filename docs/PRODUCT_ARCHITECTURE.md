# Pact Access product architecture

## Product shape

Pact Access has two distinct surfaces:

- Public website at `/`: product explanation, trust model, integration documentation, and entry points.
- Authenticated-style workspace at `/app/*`: operational views for registry lookups, owner verification, payment readiness, and audit evidence.

The workspace must not imply authentication or seller tenancy until those capabilities exist. The first release is a single-operator testnet workspace.

## Route map

| Route | Responsibility | Data source |
| --- | --- | --- |
| `/` | Public product site | Static product content |
| `/app/overview` | System health and current integration readiness | Main Worker health and facilitator payment health |
| `/app/agents` | Look up a CIS-8004 badge and inspect registry verification | Main Worker registry endpoint |
| `/app/verification` | Request a challenge and verify the current owner signature | Main Worker challenge and proof endpoints |
| `/app/payments` | Inspect x402 facilitator readiness and settlement availability | Facilitator payment-health endpoint |
| `/app/activity` | Sanitized request and settlement audit trail | Future read-only audit API, not yet exposed |
| `/app/settings` | Read-only network and registry configuration | Documented build-time configuration |

Unknown routes inside the workspace render a workspace-level not-found page. They must not silently redirect to the marketing homepage.

## Frontend boundaries

- `src/main.tsx` owns only router setup, global styles, and the root render.
- `src/App.tsx` owns the route tree and public/workspace separation.
- `src/layouts/WorkspaceLayout.tsx` owns workspace navigation, responsive shell, active route state, and page chrome.
- `src/pages/workspace/*` owns route-level screens.
- `src/components/OwnerProofConsole.tsx` remains the owner-proof interaction and is composed by the verification route.
- `src/api.ts` remains the same-origin API transport. Pages call only documented endpoints.
- Existing Somnia market/session state is legacy and must not be mounted in the Pact Access runtime.

## Backend trust boundaries

- Main access Worker: health, registry verification, one-use owner challenges, and owner-signature verification.
- Facilitator Worker: x402 requirements, payment settlement/finality, protected-resource upload and release.
- D1: request state, sanitized audit events, and protected resource metadata/content.
- Vercel: public website, workspace shell, and same-origin API proxy.
- Concordium: authoritative registry and account credential state.

Frontend state is presentation only. No page can authorize access or mark a payment successful. The server must re-check registry state and proof, settle payment, confirm finality, and only then release resource bytes.

## Data honesty rules

- No seeded activity, fabricated transactions, fake agents, invented balances, or sample success metrics in production UI.
- If an endpoint is missing, show that the capability is not connected and identify the backend contract needed.
- A payment-health response is readiness evidence, not a payment.
- A registry lookup is not owner authorization.
- A verified owner signature is not a settled payment.
- A submitted transaction is not finality.
- Do not label the workspace authenticated until a real authentication and authorization model exists.

## Initial release scope

1. Route separation and responsive workspace shell.
2. Live health and payment-readiness views using documented endpoints.
3. Live CIS-8004 registry lookup.
4. Owner verification flow re-used from the existing proof console.
5. Explicit unavailable state for audit history until a sanitized audit API is exposed.
6. Route, accessibility, loading, error, and mobile-navigation tests.
7. Remove legacy trading providers from the Pact Access runtime without deleting their historical source.

## Follow-on backend contracts

- `GET /api/access/audit?limit=&cursor=`: sanitized, paginated request/proof/payment/delivery events. Never return raw signatures, credential blobs, private keys, or protected resource bytes.
- Seller/resource management endpoints: separate read/write scopes and server-side authorization before exposing resource configuration.
- Authentication and tenancy: only add when the seller/operator model is defined. Scope every record and mutation to a verified principal.
- Payment history: derive from finalized facilitator/D1 settlement records, not client-side transaction claims.

## Security and release gates

- Every write action remains server-authoritative and request-bound.
- Route guards are not security controls. Backend authorization is mandatory for future authenticated routes.
- No secret or private key is sent to the browser.
- The UI must preserve fail-closed messaging for invalid proof, stale registry state, unknown payment state, and unavailable chain services.
- CI must pass type-check, tests, production build, and Cloudflare checks before merge.

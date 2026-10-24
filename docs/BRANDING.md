# Pact and dreamDEX branding

Pact uses its own custom brace-and-P mark, with separate dreamDEX integration attribution. This does not present Pact as an official dreamDEX product or imply endorsement.

## Sources checked on 24 October 2026

- Official app: https://app.testnet.dreamdex.io/
- Official site: https://www.dreamdex.io/

The app's rendered theme tokens supplied the palette: page `#0e1217`, surface `#14191f`, raised surface `#1c222a`, purple action `#5b55c8`, body text `#c9d1d9`, muted text `#8d98a3`, green buy state `#00fa89`, and red sell state `#dc0b4a`. These are observations from the current app, not a published brand-guideline document. Pact uses lighter purple and red text where needed for contrast on its dark surfaces.

The dreamDEX symbol and wordmark in `public/brand/` preserve the official site's SVG paths. Their fill is white for dark surfaces. They appear alongside the words “built on.” The assets remain the dreamDEX brand owner's marks and are included for integration attribution. No other page content, layout, metrics or product claims were copied.

Pact's serif headlines were replaced with a clean sans-serif system stack and monospace labels. Font files are not copied or fetched from external font services. The local Pact favicon and accent stroke match the purple theme. Positive, warning and error states retain distinct colors and text labels.

## Preview and verification

The existing private ChatGPT Site receives the same theme as the server-backed app. Practice labels, wallet restrictions and execution behavior are unchanged. Verify the landing page, workspace, personal sizing decision and order receipt after theme changes. Brand-only changes require compilation and visual inspection, not new behavioral tests.

Desktop managed-browser checks passed for the landing page, workspace, ready sizing decision and late-entry refusal. Both official logo assets loaded, the observed body background matched the slate token, and the inspected pages had no horizontal overflow. Mobile visual and wallet QA remain unverified.

## Pact trade-ticket identity

The current product uses warm charcoal, ivory paper and copper accents. The official dreamDEX logo and wordmark remain unmodified in the smaller “built on” attribution. The custom `public/brand/pact-mark.svg` reuses the outer brace paths and replaces the center letter with a geometric uppercase P and copper rule, as requested by the owner. It is Pact's custom mark, not an official dreamDEX logo variant. The favicon uses the same geometry.

`src/identity.css` owns this product layer. The earlier dreamDEX token observations above document provenance, not the current full Pact palette. The main changes are:

- Trade-ticket setup cards with a version/environment header, decorative price rail, dashed receipt boundary and alternating paper/charcoal surfaces.
- Distinct setup slip, account-decision and receipt illustrations in the workflow section. Each illustration is labeled practice, and creates no records or execution claims.
- A large unmodified dreamDEX symbol masked behind the app, with a slow copper light sweep. The backdrop never handles pointer input. A labeled control pauses it, session preference survives navigation, hidden documents pause it, and the system reduced-motion setting disables it. The existing risk-gate animation remains separately labeled and pausable.
- Route changes reset document scroll so moving from a lower landing section to the workspace starts at its heading.

The price rail only places decorative markers. All exact amounts and trading decisions still come from the existing deterministic risk engine. No network, wallet, operator, approval or execution behavior is changed by the identity layer.

### Verification of this revision

All 68 behavioral tests pass. Standard and preview builds, Worker bundling and Cloudflare type checking pass. Managed-browser inspection checked the new mark and all official attribution assets, backdrop pause persistence, desktop landing/workflow/setup tickets, and a 390-pixel iframe with a 375-pixel content viewport. Landing and workspace had no horizontal overflow in that narrow viewport. Opening the workspace reset scroll to zero. This is responsive layout evidence, not physical-device or mobile-wallet qualification.

# Live testnet market data

The landing page, workspace, setup details and authoring screen read BTC/ETH perp marks through the official dreamDEX SDK on Somnia Tokyo, chain 50383. Available bid/ask prices, pool addresses, observation age and the index oracle timestamp accompany the marks. These are testnet USDso quotes, not mainnet spot prices or executable order guarantees.

## Read boundary

`DreamDex.quotes()` uses only chain ID, market discovery, perp state and book reads. It has no owner, account, approval or signing operation. `PactMarketFeed` is a separate SQLite-backed Durable Object bound as `PACT_MARKETS`. Migration `v2-public-quotes` adds it without changing the existing trading lane, operator identity or stored orders.

The public `GET /api/markets` endpoint intentionally permits anonymous, credential-free cross-origin reads. The private ChatGPT preview fetches this endpoint without cookies. Other API routes retain their original authentication and origin checks. The preview's trading workflow remains browser-local simulation.

## Freshness and recovery

- One ten-second source cache coalesces simultaneous requests. Hidden browser tabs stop polling.
- A source read has a twelve-second deadline and shuts down its transport on completion or timeout. Browser fetches have a separate sixteen-second deadline.
- Oracle validity uses the protocol's own `markPriceOk` verdict. Pact does not derive protocol validity from the index timestamp.
- The display separately requires a positive, valid mark observed by Pact within thirty seconds. Future-dated, zero, malformed or invalid observations cannot be labeled live.
- An outage retains the last valid price with its original observation time and labels it stale. No valid observation means unavailable. A broken market does not discard a healthy neighboring market.
- Missing best bids or asks remain unavailable. No price history, percentage change, spread or volume is invented.

A displayed live mark never silently changes immutable setup terms or recorded approval bounds. The hero uses actual quotes. Seeded practice setup entry/stop/target levels remain explicitly simulated. Real testnet execution still requires a fresh account-specific snapshot and explicit approval.

## Verification

78 tests across ten files pass, including quote unit conversion, wrong-network rejection before discovery, cache coalescing, last-valid timestamp retention, invalid/zero/future/old observations, partial market outages, timeout cleanup and rendered stale/wrong-network states. Standard and preview builds, Worker bundling and type checks pass.

The deployed endpoint returned valid BTC and ETH marks, bid/ask levels and oracle timestamps. The live landing page displayed the returned values. The local executor's read-only probe timed out and correctly reported unavailable. No trade was submitted by any quote check.

Desktop and a 390-pixel iframe layout displayed the real quote feed without horizontal overflow. The mark values and observation timestamps changed on subsequent reads. This checks browser layout and public quote transport, not mobile wallet execution.

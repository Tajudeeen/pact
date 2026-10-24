# A short path through Pact

## Ten seconds

A shared trade setup should produce an account-specific decision. Pact checks the current entry, sizes the position around your rules, and records exactly what you approved.

## One minute

Start practice, open BTC pullback, compare **standard** with **arrives late**, then return to standard and approve. Inspect the order trail, close it and download the receipt. Everything in this path is explicitly simulated.

## Five minutes

Try old data and thin liquidity. Use the lost-response account and inspect how uncertainty reconciles without another simulated send. Run `pnpm test` to inspect the restart, budget, ownership and UI consent cases. Read `evidence/README.md` for exactly what has and has not been demonstrated.

## Actual testnet proof

Pending. The submission is not ready until this section links actual entry/close hashes and a recorded demo. Do not represent practice receipts as testnet evidence.

## Hard questions

- Does the account selector actually change the account being approved? Changing it clears the old preview and consent. Late responses are discarded.
- What happens after a missing response? The intent remains reserved and the persisted action is reconciled, without signing another order.
- Are the stops exchange-native? No. Linked keys cannot arm native stops. Monitored exits have explicit availability and close-path limits.
- Is the result after all costs? Net testnet PnL remains incomplete until actual funding and gas attribution is implemented.

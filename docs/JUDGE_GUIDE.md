# A short path through Pact

## Ten seconds

A shared trade setup should produce an account-specific decision. Pact checks the current entry, sizes the position around your rules, and records exactly what you approved.

## One minute

Start practice, open BTC pullback, compare **standard** with **arrives late**, then return to standard and approve. Inspect the order trail, close it and download the receipt. Everything in this path is explicitly simulated.

## Five minutes

Try old data and thin liquidity. Use the lost-response account and inspect how uncertainty reconciles without another simulated send. Run `pnpm test` to inspect the restart, budget, ownership and UI consent cases. Read `evidence/README.md` for exactly what has and has not been demonstrated.

## Challenge recovery locally

Run `pnpm test tests/execution.test.ts tests/dreamdex.test.ts tests/recovery-ui.test.tsx`. The fixtures inject invalid marks and lost responses, age a trade before submitting its close, and reopen SQLite after a close timeout. The tests assert that no replacement action is prepared, risk stays reserved while the account is not flat, and the owner can recover through the rendered app. The adapter test decodes actual generated calldata and compares its price with the fresh checked decision. All market/chain transports in these tests are mocked. This does not establish a live testnet order.

## Actual testnet proof

**Pending as of the last recorded evidence.** The MVP must link real Tokyo entry and close transaction hashes, matching decoded fill events, a final flat-position read, and an independently verified sanitized receipt. Record the demo only after those outcomes can be shown. Practice receipts and read-only network probes are not substitutes. See [the qualification tracker](https://github.com/Tajudeeen/pact/issues/1).

## Hard questions

- Does the account selector actually change the account being approved? Changing it clears the old preview and consent. Late responses are discarded.
- What happens after a missing response? The intent remains reserved and the persisted action is reconciled, without signing another order.
- Are the stops exchange-native? No. Linked keys cannot arm native stops. Monitored exits have explicit availability and close-path limits.
- Is the result after all costs? The implemented ledger can attribute fees, rebates, funding and realized USDso PnL when canonical bank-event coverage is complete. Until a real filled lifecycle is qualified, no actual net result is established. Native STT gas is separately reported, not converted to USDso.

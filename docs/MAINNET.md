# Execution qualification and mainnet release

Pact's current release is Tokyo testnet only, chain 50383. The dreamDEX perps documentation checked on 24 October 2026 states that perps have no mainnet markets yet: https://app.testnet.dreamdex.io/docs/trading/perps-testnet. Somnia mainnet existing does not establish a mainnet perps deployment.

## Enforced today

- `PACT_NETWORK=mainnet` is rejected during adapter construction. Network overrides cannot enable it. `pnpm run release:check mainnet` exits nonzero and lists outstanding gates.
- Before broadcast, the signed bytes must hash to the saved hash, recover to the configured operator, target the saved pool, carry the saved nonce, send zero native value and identify chain 50383. The broadcast RPC must independently report that chain.
- Observation compares the chain transaction and receipt with the saved sender, destination, nonce and complete calldata. Two canonical block confirmations are required. A mismatched block hash or changed transaction never establishes a fill.
- Testnet entry sizing reads the current effective IMF and the on-chain taker fee rate. Planned risk reserves entry and stop-exit trading fees. Reward/risk also includes target-exit fees. Missing or malformed prices, grids, balances, rates or timestamps block admission.
- The SDK's one-block liquidation projection checks the exact proposed FOK size and limit before approval and again before signing. The account must start flat and finish with the expected size and positive equity. Projected liquidation must sit beyond the stop by at least 1% of the stop price. This is Pact's conservative admission policy, not a protocol requirement or guaranteed loss limit. The projection can change with funding, price and collateral.
- The owner can pause new entries in Account. The setting survives restarts and is rechecked after preparation. Already submitted transactions cannot be cancelled by pausing. Closing, monitoring and reconciliation remain available. On-chain permission revocation still happens in dreamDEX.

## Evidence and independent checks

Download a closed testnet receipt from its order page, then run:

```sh
pnpm run verify:receipt /path/to/pact-receipt.json
```

The read-only checker validates the receipt format and full setup digest, discovers the selected market through the official SDK, re-reads the entry and close transaction/receipt/block, checks canonicality and two confirmations, compares order owner, side, setup tag, quantity and entry price bound, and decodes actual `OrderFilled` events through the SDK. It rejects practice receipts, changed terms, mismatched fills, changed blocks, unsupported chains and incomplete receipts. It sends no transaction and uses no operator key.

If the receipt claims complete accounting, the checker independently scans the canonical bank logs from entry through close. It compares every attributed event, actual fees, rebates, signed funding, bank realized PnL, USDso net result and native gas. It does not trust the exported cursor or totals. A changed event, cost, bank or net result is refused. Without complete accounting it reports execution verification only.

The result is RPC-relative evidence of matching execution and, when present, matching bank-event accounting. It does not independently prove off-chain user consent, a historical flat-position observation or security. The order's full digest is an off-chain commitment. Only its first 64 bits are passed as the on-chain setup tag. A verifier must not describe that short tag alone as the full plan committed on-chain.

Receipts include actual gas units and effective gas price for each confirmed leg. Their product is native gas cost in wei. The persisted accounting scan attributes `FeeCharged`, `RebatePaid`, `FundingSettled` and `PositionUpdated` from the official SDK bank ABI. Complete block coverage and the approved opening size followed by a zero closing size are required. Positive funding is paid; negative funding is received. `net USDso = bank realized PnL - fees + rebates - signed funding`. STT gas remains a separate native cost without an invented conversion. Zero cost is accepted only after complete coverage, never inferred from an advertised fee.

Because planned loss is not an upper bound on actual loss, a closed testnet trade with incomplete settled costs blocks another entry for that account in the same UTC day. Pact does not substitute its risk estimate for verified daily PnL. The first testnet lifecycle remains possible. Complete USDso accounting releases this hold and supplies the actual daily USDso loss. The close timestamp remains fixed across retries and midnight. Before another entry, the latest complete ledger's anchors are checked again. These paths have controlled regression coverage; live filled-order qualification remains pending.

## Gates before any mainnet execution

| Gate                       | Current evidence                                                       | Remaining requirement                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Published protocol         | Official documentation says perps are testnet only                     | Published mainnet addresses, deployment/version identities, collateral, decimals, fee rules and compatible SDK                          |
| Actual execution           | Local tests and deployed practice, no real order claimed               | Owner-approved funded testnet entry/close with matching fills and exported proof                                                        |
| Closing and protection     | Monitored, position-sized opposing FOK close                           | Qualify protocol-enforced reduce-only or an independently reviewed alternative and loss-of-service behavior                             |
| Complete accounting        | Resumable bank ledger, independently checked totals, native gas proof  | Qualify actual filled-order fee/funding events and margin reconciliation; keep STT gas separate or qualify an explicit valuation method |
| Recovery and custody       | Local restart/uncertain-response tests and persistent operator storage | Live revocation test, operator compromise response, encrypted backup/restore drill, restore identity and reconcile unresolved nonces    |
| User flow and operations   | Desktop practice and automated failure tests                           | Real mobile wallet flow, user trials, outage/load tests and monitoring/alert escalation                                                 |
| Security and authorization | Application-level limits and one owner                                 | Independent review, on-chain permission review and explicit authorization for a bounded real-money pilot                                |

Changing this table to “passed” does not unlock mainnet. A future release must implement and review a separate mainnet network profile and adapter qualification, update explorer/token labels and evidence schemas, and pass the gates with inspectable artifacts. The current adapter, receipts and UI deliberately remain testnet-specific. Never substitute mainnet RPC URLs into this release.

## Reproduce current qualification

```sh
pnpm test
pnpm typecheck
pnpm check:cloudflare
pnpm build:cloudflare
pnpm run release:check tokyo-testnet
pnpm run release:check mainnet # expected refusal, exit 1
```

Local fake transports exercise failure behavior but do not establish external feasibility or real execution. Funded testnet and future mainnet transactions require the owner to sign in, link and fund the separate operator, inspect the setup and explicitly approve the trade. No actual order was placed for this qualification work.

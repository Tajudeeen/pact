# Failure behavior and proof

| Failure                                      | Correct response                               | Existing check                                                    |
| -------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Duplicate approval                           | Return one intent                              | Service/API tests, unique approval key                            |
| Account changes after preview                | Clear preview and consent                      | Rendered React integration test                                   |
| Old response returns after account change    | Discard it                                     | Delayed-response React integration test                           |
| Entry price leaves range                     | Block before approval                          | Risk tests, late replay scenario                                  |
| Stale or future-dated observation            | Block                                          | Risk tests, stale replay scenario                                 |
| Policy changes                               | Require a new preview                          | Service test                                                      |
| Setup expires or is withdrawn                | Block                                          | Risk/service tests                                                |
| Another setup consumes the account           | Reject another approval                        | Atomic approval service test                                      |
| Restart after simulated uncertain submission | Reconcile existing fill, never submit again    | Actual SQLite close/reopen test                                   |
| RPC broadcast response lost                  | Retain signed hash and reserve, reconcile hash | Fake-venue boundary test checks action exists before broadcast    |
| Receipt reverts                              | Rejected entry or close attention              | Implemented adapter/service path, real-chain verification pending |
| Unexpected decoded fill size                 | Attention, no success claim                    | Implemented service path, additional adversarial fixtures pending |
| Monitor sees outside position change         | Stop automated management, flag attention      | Implemented path, real-chain verification pending                 |
| Native protection unavailable to linked key  | Say monitored, not native                      | Explicit UI, README and consent                                   |
| Funding settlements absent                   | Keep net testnet PnL incomplete                | Receipt model and service tests                                   |
| Browser cannot reach local preview           | Report visual verification incomplete          | Current environment limitation                                    |

## At-most-once trade-off

A crash between persisting the signed transaction and broadcasting can leave a valid action unsent. The worker will look for its hash and eventually flag attention. It does not construct a new action. An operator must inspect the original nonce, hash and expiry, then resolve the account outside this version. Automated replacement, rebroadcast and a manual recovery console are deliberately not implemented yet.

## Protection gap

Monitored exits depend on process uptime, RPC availability, live marks, liquidity and permitted actions. A position-sized opposing FOK close is not protocol-enforced reduce-only. An external fill between position check and inclusion can change the result. Dedicated accounts are a deployment requirement, and mainnet use remains unqualified.

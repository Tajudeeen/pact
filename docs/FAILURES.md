# Failure behavior and proof

| Failure                                            | Correct response                                                       | Existing check                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Duplicate approval                                 | Return one intent                                                      | Service/API tests, unique approval key                                                 |
| Account changes after preview                      | Clear preview and consent                                              | Rendered React integration test                                                        |
| Old response returns after account change          | Discard it                                                             | Delayed-response React integration test                                                |
| Entry price leaves range                           | Block before approval                                                  | Risk tests, late replay scenario                                                       |
| Stale or future-dated observation                  | Block                                                                  | Risk tests, stale replay scenario                                                      |
| Policy changes                                     | Require a new preview                                                  | Service test                                                                           |
| Setup expires or is withdrawn                      | Block                                                                  | Risk/service tests                                                                     |
| Another setup consumes the account                 | Reject another approval                                                | Atomic approval service test                                                           |
| Restart after simulated uncertain submission       | Reconcile existing fill, never submit again                            | Actual SQLite close/reopen test                                                        |
| RPC broadcast response lost                        | Retain signed hash and reserve, reconcile hash                         | Fake-venue boundary test checks action exists before broadcast                         |
| Invalid, zero or non-finite monitor mark           | Pause exits, retain risk, recover when valid                           | Execution regression tests, no close prepared                                          |
| Entry admission unavailable on an open position    | Use independent position/mark observation                              | Execution test, real adapter transport mock                                            |
| Improved price with higher funding                 | Sign the fresh checked price within consent                            | Service regression plus actual calldata decode test                                    |
| Fresh close on an old trade                        | Time from close action, not approval                                   | Execution test, including legacy event fallback                                        |
| Timed-out close later confirms after restart       | Reconcile close hash, require flat position                            | Actual SQLite close/reopen with fake venue                                             |
| Close fills match but account is not flat          | Attention, keep risk reserved                                          | Execution regression, then read-only recovery                                          |
| Owner requests recovery                            | Read-only recheck, no new order                                        | Rendered React → API → SQLite test                                                     |
| Another user requests recovery                     | Deny without leaking the order                                         | API authorization and origin tests                                                     |
| Another account has unresolved operator action     | Refuse entry/close preparation                                         | Execution boundary test                                                                |
| Receipt reverts                                    | Rejected entry or close attention                                      | Local entry/close regression tests; real-chain verification pending                    |
| Unexpected decoded fill size                       | Attention, no success claim                                            | Local quantity/hash/role/price adversarial tests; real-chain verification pending      |
| Monitor sees outside position change               | Stop automated management, flag attention                              | Local regression test; real-chain verification pending                                 |
| Native protection unavailable to linked key        | Say monitored, not native                                              | Explicit UI, README and consent                                                        |
| Bank logs missing, reorged or unsupported          | Keep net unknown, hold repeat entries, retry without skipping coverage | Settlement and service accounting tests                                                |
| Exported fee, funding, event or net result changed | Reject independent verification                                        | Receipt verifier tampering tests                                                       |
| Close tick or depth exceeds the permitted bound    | Refuse before signing                                                  | Long/short adapter close tests                                                         |
| Wallet changes network or account during sign-in   | Refuse the login                                                       | Wallet provider regression tests                                                       |
| Browser runtime unavailable                        | Report visual verification incomplete                                  | Chromium missing, installation download failed; see evidence/browser-verification.json |

## At-most-once trade-off

A crash between persisting the signed transaction and broadcasting can leave a valid action unsent. The worker will look for its hash and eventually flag attention. It does not construct a new action. An operator must inspect the original nonce, hash and expiry, then resolve the account outside this version. The order page now has an owner-only **Check recovery** button, and the worker keeps rechecking attention states. These only reconcile the existing transaction and position. Automated replacement, rebroadcast and retry of a reverted close remain unsupported. See [the operator steps](TESTNET.md#recover-an-order).

## Protection gap

Monitored exits depend on process uptime, RPC availability, live marks, liquidity and permitted actions. A position-sized opposing FOK close is not protocol-enforced reduce-only. An external fill between position check and inclusion can change the result. Dedicated accounts are a deployment requirement, and mainnet use remains unqualified.

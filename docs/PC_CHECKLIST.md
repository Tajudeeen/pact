# Pact Access: PC implementation checklist

Do not merge PR #9 until the real integration and checks pass. The branch is still separate from `main`.

## 1. Pull the branch

Run in PowerShell from the Pact repository:

```powershell
git status
git fetch origin
git switch concordium/pact-access-gateway
git pull --ff-only
node --version
pnpm --version
```

Required Node: `>=24.13`. If pnpm is missing and Corepack is available:

```powershell
corepack enable
corepack prepare pnpm@11.25.0 --activate
```

## 2. Install the pinned integration packages

The package versions below are the documented stable versions checked for this branch. Add them exactly and commit the generated lockfile:

```powershell
pnpm add -E @x402/concordium@2.28.0 @x402/core@2.28.0 @x402/hono@2.28.0 @x402/fetch@2.28.0 @concordium/web-sdk@12.0.2 @concordium/browser-wallet-api-helpers@3.3.0 @grpc/grpc-js
```

Do not add any private key to source code or a committed env file.

## 3. Run checks before integration

```powershell
pnpm install --frozen-lockfile
pnpm verify
pnpm typecheck
pnpm test
pnpm build
```

Stop at the first failure. Save the full output, fix it, and rerun the failed check. Don't report a check as passed until its exit code is zero.

## 4. Configure testnet identities and secrets

Use Concordium testnet only. The network ID is:

```text
ccd:4221332d34e1694168c2a0c0b3fd0f27
```

The official testnet gRPC endpoint documented by the x402 package is:

```text
grpc.testnet.concordium.com:20000
```

Create a testnet seller account, a registered agent owner account, and a separate agent payment account. Register the agent in the trusted CIS-8004 testnet registry, then set its `agentWallet` to the payment account. CIS-8004 requires the owner to authorize that change and the new wallet to prove control.

Do not assume the mainnet registry contract index is also the testnet address. Confirm the exact testnet registry contract and configure its canonical CAIP-10 ID.

Keep these values in local secrets or the deployment secret manager:

- `PACT_SELLER_PAY_TO`
- `CONCORDIUM_AGENT_REGISTRY_ID`
- `X402_FACILITATOR_URL`
- `CCD_FACILITATOR_ADDRESS`
- `CCD_FACILITATOR_PRIVATE_KEY`
- `PACT_AGENT_WALLET_ADDRESS`
- `PACT_AGENT_WALLET_PRIVATE_KEY`

The agentWallet private key belongs only in the buyer-agent runtime. The facilitator sponsor key belongs only in the facilitator service. Never place either key in the browser or Git.

## 5. Finish the live integrations

1. Browser: use `detectConcordiumProvider()`, connect the owner account, and call `provider.signMessage(ownerAccount, message)` with the exact server-issued message.
2. Backend: use `@concordium/web-sdk` and a testnet gRPC client to fetch fresh account information. Verify the returned signature with `verifyMessageSignature`. Never accept account information supplied by the browser.
3. Registry: resolve the agent against the configured trusted CIS-8004 contract. Derive `ownerAccount` and `agentWallet` from the live record, require `Active`, and verify the signed owner account matches the record owner.
4. Payment: configure `ExactConcordiumScheme` and `paymentMiddleware` in Hono. Use a Concordium-capable facilitator, not the default x402.org facilitator. Keep `requireFinalization: true`.
5. Binding: before verification/settlement, require the x402 payload sender to equal the agent's current on-chain `agentWallet`. The human owner signature and payment sender are intentionally different accounts.
6. Delivery: release the protected resource only after the facilitator confirms finalized settlement. The resource handler must never run on missing proof, invalid proof, wrong payer, pending settlement, or facilitator failure.

## 6. Test the failure paths

- no owner signature;
- signature from a different account;
- modified message, wrong request, wrong network, or expired challenge;
- replayed challenge;
- revoked agent or untrusted registry;
- registry owner mismatch;
- payer does not match current `agentWallet`;
- x402 amount, asset, or recipient mismatch;
- pending, failed, or timed-out settlement;
- facilitator/node outage;
- duplicate request and duplicate delivery attempt.

For every blocked case, verify that no protected bytes are returned.

## 7. Demo evidence

- [ ] First request returns an owner-signature challenge, no resource bytes.
- [ ] Owner signs the exact request-bound message in Concordium Wallet.
- [ ] Backend verifies the signature against fresh account credentials.
- [ ] Live CIS-8004 resolution confirms active owner and agentWallet.
- [ ] Buyer agent pays from the registered agentWallet through x402.
- [ ] Facilitator confirms finalization on testnet.
- [ ] Protected resource is delivered once, after settlement.
- [ ] CCDExplorer transaction link and sanitized audit record are visible.
- [ ] Invalid proof, wrong payer, and failed/pending payment never deliver.
- [ ] Demo labels any simulation or fixture honestly.

## Current remote implementation boundary

The branch now contains the Pact Access landing, owner-signature message/verifier adapter, CIS-8004 binding adapter, server-issued challenge flow, SQLite request/challenge repository, fail-closed pipeline, state machine, and tests.

The browser wallet, real Concordium node client, live registry resolver, x402 Hono middleware/facilitator, protected seller route, testnet transactions, and deployment are still outstanding. No live integration or test pass is claimed.

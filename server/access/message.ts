import type { AccessContext, AccountOwnershipPolicy } from "./contracts";

/** Stable, domain-separated message the owner signs in the Concordium wallet. */
export function accessAccountProofMessage(
  context: AccessContext,
  policy: AccountOwnershipPolicy,
): string {
  return JSON.stringify({
    domain: "pact-access",
    version: 1,
    network: context.network,
    requestId: context.requestId,
    sellerId: context.sellerId,
    resourceId: context.resourceId,
    buyerAgentId: context.buyerAgentId,
    ownerAccount: context.ownerAccount,
    payerAccount: context.payerAccount,
    challenge: context.challenge,
    expiresAt: context.expiresAt,
    policyId: policy.policyId,
  });
}

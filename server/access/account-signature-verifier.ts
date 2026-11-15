import type {
  AccessContext,
  AccountOwnershipPolicy,
  ConcordiumProofVerifier,
  ProofResult,
} from "./contracts";
import { accessAccountProofMessage } from "./message";

export interface ConcordiumAccountInfoReader {
  getAccountInfo(
    accountAddress: string,
    network: AccessContext["network"],
  ): Promise<unknown>;
}

export interface ConcordiumMessageSignatureChecker {
  verifyMessageSignature(
    message: string,
    signature: unknown,
    accountInfo: unknown,
  ): boolean | Promise<boolean>;
}

function isSignaturePresentation(
  value: unknown,
): value is { account: string; signature: unknown } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.account === "string" &&
    candidate.account.length > 0 &&
    candidate.signature !== undefined &&
    candidate.signature !== null
  );
}

/**
 * Verifies a wallet signature against fresh on-chain account credentials.
 * The signed message binds the account to this exact request, agent, resource,
 * network, seller, policy, challenge, and expiry.
 */
export class ConcordiumAccountSignatureVerifier
  implements ConcordiumProofVerifier
{
  constructor(
    private readonly accounts: ConcordiumAccountInfoReader,
    private readonly signatures: ConcordiumMessageSignatureChecker,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async verify(input: {
    presentation: unknown;
    context: AccessContext;
    policy: AccountOwnershipPolicy;
  }): Promise<ProofResult> {
    if (!isSignaturePresentation(input.presentation))
      return { valid: false, reason: "invalid" };

    // Concordium Base58Check account addresses are case-sensitive.
    if (input.presentation.account !== input.context.ownerAccount)
      return { valid: false, reason: "wrong_account" };

    let accountInfo: unknown;
    try {
      accountInfo = await this.accounts.getAccountInfo(
        input.context.ownerAccount,
        input.context.network,
      );
    } catch {
      return { valid: false, reason: "unavailable" };
    }

    const message = accessAccountProofMessage(input.context, input.policy);
    let valid = false;
    try {
      valid = await this.signatures.verifyMessageSignature(
        message,
        input.presentation.signature,
        accountInfo,
      );
    } catch {
      valid = false;
    }

    if (!valid) return { valid: false, reason: "invalid" };

    return {
      valid: true,
      verifiedAccount: input.context.ownerAccount,
      policyId: input.policy.policyId,
      challenge: input.context.challenge,
      verifiedAt: this.now().toISOString(),
      verificationReference: `account-signature:${input.context.requestId}`,
    };
  }
}

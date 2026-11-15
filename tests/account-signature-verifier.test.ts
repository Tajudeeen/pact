import { describe, expect, it, vi } from "vitest";
import type { AccessContext, AccountOwnershipPolicy } from "../server/access/contracts";
import { ConcordiumAccountSignatureVerifier } from "../server/access/account-signature-verifier";
import { accessAccountProofMessage } from "../server/access/message";

const context: AccessContext = {
  requestId: "sig-req-1",
  sellerId: "seller-1",
  resourceId: "resource-1",
  buyerAgentId: "agent-1",
  ownerAccount: "3kBx2h5Y2veb4hZgAJWPrr8RyQESKm5TjzF3ti1QQ4VSYLwK1G",
  payerAccount: "payer-account",
  network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
  challenge: "34".repeat(32),
  expiresAt: "2026-11-15T12:01:30.000Z",
};
const policy: AccountOwnershipPolicy = {
  policyId: "agent-owner-account-v1",
  description: "Sign to prove control of the active agent owner account",
};

describe("ConcordiumAccountSignatureVerifier", () => {
  it("verifies the exact server-bound message against fresh account credentials", async () => {
    const accountInfo = { credentials: ["fresh-chain-credential"] };
    const getAccountInfo = vi.fn(async () => accountInfo);
    const verifyMessageSignature = vi.fn(() => true);
    const verifier = new ConcordiumAccountSignatureVerifier(
      { getAccountInfo },
      { verifyMessageSignature },
      () => new Date("2026-11-15T12:00:30.000Z"),
    );
    const signature = { credential: "opaque-signature" };

    const result = await verifier.verify({
      presentation: { account: context.ownerAccount, signature },
      context,
      policy,
    });

    expect(getAccountInfo).toHaveBeenCalledWith(context.ownerAccount, context.network);
    expect(verifyMessageSignature).toHaveBeenCalledWith(
      accessAccountProofMessage(context, policy),
      signature,
      accountInfo,
    );
    expect(result).toEqual({
      valid: true,
      verifiedAccount: context.ownerAccount,
      policyId: policy.policyId,
      challenge: context.challenge,
      verifiedAt: "2026-11-15T12:00:30.000Z",
      verificationReference: "account-signature:sig-req-1",
    });
  });

  it("rejects a signature from an account other than the intended owner", async () => {
    const getAccountInfo = vi.fn(async () => ({}));
    const verifyMessageSignature = vi.fn(() => true);
    const verifier = new ConcordiumAccountSignatureVerifier(
      { getAccountInfo },
      { verifyMessageSignature },
    );

    const result = await verifier.verify({
      presentation: { account: "different-account", signature: {} },
      context,
      policy,
    });

    expect(result).toEqual({ valid: false, reason: "wrong_account" });
    expect(getAccountInfo).not.toHaveBeenCalled();
    expect(verifyMessageSignature).not.toHaveBeenCalled();
  });

  it("fails closed when the Concordium node cannot return current credentials", async () => {
    const verifier = new ConcordiumAccountSignatureVerifier(
      { getAccountInfo: async () => { throw new Error("node unavailable"); } },
      { verifyMessageSignature: () => true },
    );

    const result = await verifier.verify({
      presentation: { account: context.ownerAccount, signature: {} },
      context,
      policy,
    });
    expect(result).toEqual({ valid: false, reason: "unavailable" });
  });

  it("rejects an invalid signature", async () => {
    const verifier = new ConcordiumAccountSignatureVerifier(
      { getAccountInfo: async () => ({}) },
      { verifyMessageSignature: () => false },
    );
    const result = await verifier.verify({
      presentation: { account: context.ownerAccount, signature: {} },
      context,
      policy,
    });
    expect(result).toEqual({ valid: false, reason: "invalid" });
  });
});

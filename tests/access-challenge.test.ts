import { describe, expect, it, vi } from "vitest";
import type { AccessContext, AccountOwnershipPolicy } from "../server/access/contracts";
import { AccessChallengeIssuer } from "../server/access/challenge";
import { accessAccountProofMessage } from "../server/access/message";

const policy: AccountOwnershipPolicy = {
  policyId: "owner-account-signature-v1",
  description: "Sign to prove control of the registered owner account",
};

const input = {
  sellerId: "seller-1",
  resourceId: "resource-1",
  buyerAgentId: "agent-1",
  ownerAccount: "owner-account",
  payerAccount: "payer-1",
  network: "ccd:4221332d34e1694168c2a0c0b3fd0f27" as const,
  policy,
};

describe("AccessChallengeIssuer", () => {
  it("persists a server-generated challenge bound to the request context", async () => {
    const create = vi.fn(async (_context: AccessContext) => {});
    const issuer = new AccessChallengeIssuer(
      { create },
      () => new Date("2026-11-15T12:00:00.000Z"),
      5 * 60 * 1000,
      () => "request-1",
      () => "ab".repeat(32),
    );

    const issued = await issuer.issue(input);
    expect(issued).toEqual({
      requestId: "request-1",
      challenge: "ab".repeat(32),
      expiresAt: "2026-11-15T12:05:00.000Z",
      policyId: policy.policyId,
      message: accessAccountProofMessage({
        requestId: "request-1", sellerId: "seller-1", resourceId: "resource-1",
        buyerAgentId: "agent-1", ownerAccount: "owner-account", payerAccount: "payer-1", network: input.network,
        challenge: "ab".repeat(32), expiresAt: "2026-11-15T12:05:00.000Z",
      }, policy),
    });
    expect(create).toHaveBeenCalledWith({
      requestId: "request-1",
      sellerId: "seller-1",
      resourceId: "resource-1",
      buyerAgentId: "agent-1",
      ownerAccount: "owner-account",
      payerAccount: "payer-1",
      network: input.network,
      challenge: "ab".repeat(32),
      expiresAt: "2026-11-15T12:05:00.000Z",
    }, policy);
  });

  it("derives owner and payer from the trusted active registry record", async () => {
    const create = vi.fn(async (_context: AccessContext) => {});
    const issuer = new AccessChallengeIssuer(
      { create },
      () => new Date("2026-11-15T12:00:00.000Z"),
      90 * 1000,
      () => "registry-request",
      () => "cd".repeat(32),
    );
    const registry = {
      resolve: async () => ({
        tokenAddress: "agent-token-1",
        registryId: "trusted-test-registry",
        ownerAccount: "registry-owner",
        agentWallet: "registered-agent-wallet",
        status: "Active" as const,
      }),
    };
    const issued = await issuer.issueForAgent({
      sellerId: "seller-1",
      resourceId: "resource-1",
      buyerAgentId: "agent-token-1",
      network: input.network,
      policy,
    }, registry, "trusted-test-registry");

    expect(issued.requestId).toBe("registry-request");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerAccount: "registry-owner",
        payerAccount: "registered-agent-wallet",
      }),
      policy,
    );
  });

  it("does not issue challenges for revoked or untrusted agents", async () => {
    const create = vi.fn(async (_context: AccessContext) => {});
    const issuer = new AccessChallengeIssuer(
      { create },
      () => new Date("2026-11-15T12:00:00.000Z"),
      90 * 1000,
      () => "blocked-request",
      () => "ef".repeat(32),
    );
    const revoked = {
      resolve: async () => ({
        tokenAddress: "agent-token-1",
        registryId: "trusted-test-registry",
        ownerAccount: "registry-owner",
        agentWallet: "registered-agent-wallet",
        status: "Revoked" as const,
      }),
    };
    await expect(issuer.issueForAgent({
      sellerId: "seller-1",
      resourceId: "resource-1",
      buyerAgentId: "agent-token-1",
      network: input.network,
      policy,
    }, revoked, "trusted-test-registry")).rejects.toThrow("inactive");
    expect(create).not.toHaveBeenCalled();
  });

  it("does not return a challenge if persistence fails", async () => {
    const issuer = new AccessChallengeIssuer(
      { create: async () => { throw new Error("storage unavailable"); } },
      () => new Date("2026-11-15T12:00:00.000Z"),
      5 * 60 * 1000,
      () => "request-2",
      () => "cd".repeat(32),
    );
    await expect(issuer.issue(input)).rejects.toThrow("storage unavailable");
  });

  it("rejects malformed challenge material", async () => {
    const create = vi.fn(async () => {});
    const issuer = new AccessChallengeIssuer(
      { create },
      () => new Date("2026-11-15T12:00:00.000Z"),
      5 * 60 * 1000,
      () => "request-3",
      () => "weak",
    );
    await expect(issuer.issue(input)).rejects.toThrow("32 bytes encoded as hex");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an empty seller or resource identifier", async () => {
    const create = vi.fn(async () => {});
    const issuer = new AccessChallengeIssuer(
      { create },
      () => new Date("2026-11-15T12:00:00.000Z"),
      5 * 60 * 1000,
      () => "request-4",
      () => "ef".repeat(32),
    );
    await expect(issuer.issue({ ...input, sellerId: " " })).rejects.toThrow("sellerId");
    expect(create).not.toHaveBeenCalled();
  });
});

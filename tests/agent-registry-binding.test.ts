import { describe, expect, it, vi } from "vitest";
import type { AccessContext } from "../server/access/contracts";
import {
  Cis8004OwnerBindingVerifier,
  type ResolvedCis8004Agent,
} from "../server/access/agent-registry-binding";

const context: AccessContext = {
  requestId: "registry-req-1",
  sellerId: "seller-1",
  resourceId: "resource-1",
  buyerAgentId: "ccd:4221332d34e1694168c2a0c0b3fd0f27/cis-2:agent-token",
  ownerAccount: "owner-account",
  payerAccount: "payer-account",
  network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
  challenge: "45".repeat(32),
  expiresAt: "2026-11-15T12:01:30.000Z",
};
const agent: ResolvedCis8004Agent = {
  tokenAddress: context.buyerAgentId,
  registryId: "ccd:4221332d34e1694168c2a0c0b3fd0f27:10082.0",
  ownerAccount: "owner-account",
  agentWallet: "payer-account",
  status: "Active",
};

describe("Cis8004OwnerBindingVerifier", () => {
  it("accepts an active agent when the signed owner and registered payment wallet match", async () => {
    const resolve = vi.fn(async () => agent);
    const verifier = new Cis8004OwnerBindingVerifier(
      { resolve },
      agent.registryId,
    );

    const result = await verifier.verify({
      verifiedAccount: "owner-account",
      buyerAgentId: context.buyerAgentId,
      payerAccount: "payer-account",
      network: context.network,
    });

    expect(result).toEqual({ valid: true, registryReference: agent.tokenAddress });
    expect(resolve).toHaveBeenCalledWith({
      tokenAddress: context.buyerAgentId,
      network: context.network,
    });
  });

  it("rejects an owner mismatch", async () => {
    const verifier = new Cis8004OwnerBindingVerifier(
      { resolve: async () => ({ ...agent, ownerAccount: "other-account" }) },
      agent.registryId,
    );
    const result = await verifier.verify({
      verifiedAccount: "owner-account",
      buyerAgentId: context.buyerAgentId,
      payerAccount: "payer-account",
      network: context.network,
    });
    expect(result).toEqual({ valid: false });
  });

  it("rejects revoked agents and untrusted registries", async () => {
    const revoked = new Cis8004OwnerBindingVerifier(
      { resolve: async () => ({ ...agent, status: "Revoked" }) },
      agent.registryId,
    );
    const untrusted = new Cis8004OwnerBindingVerifier(
      { resolve: async () => agent },
      "ccd:4221332d34e1694168c2a0c0b3fd0f27:9999.0",
    );
    const input = {
      verifiedAccount: "owner-account",
      buyerAgentId: context.buyerAgentId,
      payerAccount: "payer-account",
      network: context.network,
    };
    expect(await revoked.verify(input)).toEqual({ valid: false });
    expect(await untrusted.verify(input)).toEqual({ valid: false });
  });

  it("rejects when the payer differs from the registered agentWallet", async () => {
    const verifier = new Cis8004OwnerBindingVerifier(
      { resolve: async () => ({ ...agent, agentWallet: "different-wallet" }) },
      agent.registryId,
    );
    expect(await verifier.verify({
      verifiedAccount: "owner-account",
      buyerAgentId: context.buyerAgentId,
      payerAccount: "owner-account",
      network: context.network,
    })).toEqual({ valid: false });
  });

  it("fails closed if registry resolution is unavailable", async () => {
    const verifier = new Cis8004OwnerBindingVerifier(
      { resolve: async () => { throw new Error("node unavailable"); } },
      agent.registryId,
    );
    expect(await verifier.verify({
      verifiedAccount: "owner-account",
      buyerAgentId: context.buyerAgentId,
      payerAccount: "owner-account",
      network: context.network,
    })).toEqual({ valid: false });
  });
});

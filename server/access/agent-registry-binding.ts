import type { AccessContext } from "./contracts";
import type { AgentOwnerBindingVerifier } from "./pipeline";

export interface ResolvedCis8004Agent {
  /** Canonical CAIP-19 CIS-2 token address of the registered agent. */
  tokenAddress: string;
  /** Canonical CAIP-10 identity of the registry contract used to resolve it. */
  registryId: string;
  ownerAccount: string;
  agentWallet: string | null;
  status: "Active" | "Revoked";
}

export interface Cis8004AgentResolver {
  resolve(input: {
    tokenAddress: string;
    network: AccessContext["network"];
  }): Promise<ResolvedCis8004Agent | null>;
}

/**
 * The active CIS-8004 owner must be the account that signed Pact's challenge.
 * The on-chain agentWallet must be the x402 payer. CIS-8004 setAgentWallet
 * requires the owner to authorize the change and the new wallet to prove control.
 */
export class Cis8004OwnerBindingVerifier
  implements AgentOwnerBindingVerifier
{
  constructor(
    private readonly resolver: Cis8004AgentResolver,
    private readonly trustedRegistryId: string,
  ) {
    if (!trustedRegistryId.trim())
      throw new Error("A trusted CIS-8004 registry identifier is required.");
  }

  async verify(input: {
    verifiedAccount: string;
    buyerAgentId: string;
    payerAccount: string;
    network: AccessContext["network"];
  }): Promise<{ valid: true; registryReference: string } | { valid: false }> {
    let agent: ResolvedCis8004Agent | null;
    try {
      agent = await this.resolver.resolve({
        tokenAddress: input.buyerAgentId,
        network: input.network,
      });
    } catch {
      return { valid: false };
    }
    if (!agent) return { valid: false };

    // Concordium addresses and canonical token identifiers are case-sensitive.
    const valid =
      agent.tokenAddress === input.buyerAgentId &&
      agent.registryId === this.trustedRegistryId &&
      agent.status === "Active" &&
      agent.ownerAccount === input.verifiedAccount &&
      agent.agentWallet === input.payerAccount;

    return valid
      ? { valid: true, registryReference: agent.tokenAddress }
      : { valid: false };
  }
}

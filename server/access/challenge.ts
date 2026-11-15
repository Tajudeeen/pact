import type { AccessContext, AccountOwnershipPolicy } from "./contracts";
import { accessAccountProofMessage } from "./message";
import type { ResolvedCis8004Agent, Cis8004AgentResolver } from "./agent-registry-binding";

export interface AccessRequestProvisioner {
  /** Persist the context and initial proof_required state before returning a challenge. */
  create(context: AccessContext, policy: AccountOwnershipPolicy): Promise<void>;
}

export interface IssueAccessChallengeInput {
  sellerId: string;
  resourceId: string;
  buyerAgentId: string;
  ownerAccount: string;
  payerAccount: string;
  network: AccessContext["network"];
  policy: AccountOwnershipPolicy;
}

export interface IssuedAccessChallenge {
  requestId: string;
  challenge: string;
  expiresAt: string;
  policyId: string;
  message: string;
}

function required(value: string, field: string): string {
  const clean = value.trim();
  if (!clean || clean.length > 256)
    throw new Error(`${field} must contain 1 to 256 characters.`);
  return clean;
}

function randomHex32(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class AccessChallengeIssuer {
  constructor(
    private readonly provisioner: AccessRequestProvisioner,
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs = 90 * 1000,
    private readonly createId: () => string = () => globalThis.crypto.randomUUID(),
    private readonly createChallenge: () => string = randomHex32,
  ) {
    if (!Number.isInteger(ttlMs) || ttlMs < 30_000 || ttlMs > 10 * 60 * 1000)
      throw new Error("Challenge lifetime must be between 30 seconds and 10 minutes.");
  }

  /**
   * Public request path: derive owner and payer from the trusted live registry.
   * Never accept ownerAccount or payerAccount from the HTTP client.
   */
  async issueForAgent(
    input: Omit<IssueAccessChallengeInput, "ownerAccount" | "payerAccount">,
    resolver: Cis8004AgentResolver,
    trustedRegistryId: string,
  ): Promise<IssuedAccessChallenge> {
    const agent: ResolvedCis8004Agent | null = await resolver.resolve({
      tokenAddress: input.buyerAgentId,
      network: input.network,
    });
    if (
      !agent ||
      agent.tokenAddress !== input.buyerAgentId ||
      agent.registryId !== trustedRegistryId ||
      agent.status !== "Active" ||
      !agent.agentWallet
    ) throw new Error("Agent is missing, inactive, untrusted, or has no registered payment wallet.");

    return this.issue({
      ...input,
      ownerAccount: agent.ownerAccount,
      payerAccount: agent.agentWallet,
    });
  }

  async issue(input: IssueAccessChallengeInput): Promise<IssuedAccessChallenge> {
    const policyId = required(input.policy.policyId, "policyId");
    if (
      input.network !== "ccd:4221332d34e1694168c2a0c0b3fd0f27" &&
      input.network !== "ccd:9dd9ca4d19e9393877d2c44b70f89acb"
    ) throw new Error("Unsupported Concordium network identifier.");
    const requestId = required(this.createId(), "requestId");
    const challenge = this.createChallenge();
    if (!/^[a-f0-9]{64}$/i.test(challenge))
      throw new Error("Challenge generator must return 32 bytes encoded as hex.");

    const issuedAt = this.now();
    if (!Number.isFinite(issuedAt.getTime()))
      throw new Error("Clock returned an invalid date.");
    const expiresAt = new Date(issuedAt.getTime() + this.ttlMs).toISOString();

    const context: AccessContext = {
      requestId,
      sellerId: required(input.sellerId, "sellerId"),
      resourceId: required(input.resourceId, "resourceId"),
      buyerAgentId: required(input.buyerAgentId, "buyerAgentId"),
      ownerAccount: required(input.ownerAccount, "ownerAccount"),
      payerAccount: required(input.payerAccount, "payerAccount"),
      network: input.network,
      challenge: challenge.toLowerCase(),
      expiresAt,
    };

    await this.provisioner.create(context, input.policy);
    return {
      requestId,
      challenge: context.challenge,
      expiresAt,
      policyId,
      message: accessAccountProofMessage(context, input.policy),
    };
  }
}

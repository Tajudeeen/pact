import {
  canDeliverResource,
  type AccessEvent,
  type AccessRequestState,
} from "./state-machine";
import type {
  AccessAuditWriter,
  AccessChallengeRepository,
  AccessContext,
  ConcordiumProofVerifier,
  ConcordiumX402Settlement,
  AccountOwnershipPolicy,
  InvalidAccountProof,
  PaymentPayload,
  PaymentRequirement,
  ProtectedResource,
  SettlementResult,
} from "./contracts";

export interface AgentOwnerBindingVerifier {
  /** Must match the signed owner account to the current registry owner and the payer to agentWallet. */
  verify(input: {
    verifiedAccount: string;
    buyerAgentId: string;
    payerAccount: string;
    network: AccessContext["network"];
  }): Promise<{ valid: true; registryReference: string } | { valid: false }>;
}

export interface AccessRequestRepository {
  get(requestId: string): Promise<AccessRequestState | null>;
  transition(
    requestId: string,
    expected: AccessRequestState["state"],
    event: AccessEvent,
    details?: { reason?: string; paymentReference?: string; deliveredAt?: string },
  ): Promise<AccessRequestState>;
  /** Atomic compare-and-set. Only one concurrent request may own delivery. */
  claimDelivery(requestId: string): Promise<boolean>;
  completeDelivery(requestId: string, deliveredAt: string): Promise<void>;
  releaseDeliveryClaim(requestId: string): Promise<void>;
}

export interface AccessPipelineDependencies<T> {
  requests: AccessRequestRepository;
  context(requestId: string): Promise<AccessContext>;
  policy(context: AccessContext): Promise<AccountOwnershipPolicy>;
  challenges: AccessChallengeRepository;
  proof: ConcordiumProofVerifier;
  ownerBinding: AgentOwnerBindingVerifier;
  payments: ConcordiumX402Settlement;
  resource: ProtectedResource<T>;
  audit: AccessAuditWriter;
  now?: () => Date;
}

export type AccessPipelineResult<T> =
  | { status: "delivered"; value: T; paymentReference: string }
  | { status: "payment_pending"; paymentReference: string }
  | { status: "delivery_in_progress" }
  | { status: "denied"; reason: string };

export class AccessPipelineError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "REQUEST_NOT_FOUND"
      | "REQUEST_EXPIRED"
      | "INVALID_STATE"
      | "PROOF_INVALID"
      | "OWNER_BINDING_FAILED"
      | "PAYMENT_NOT_CONFIRMED"
      | "SETTLEMENT_NETWORK_MISMATCH"
      | "DELIVERY_FAILED",
  ) {
    super(message);
    this.name = "AccessPipelineError";
  }
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export class AccessPipeline<T> {
  private readonly now: () => Date;
  constructor(private readonly deps: AccessPipelineDependencies<T>) {
    this.now = deps.now ?? (() => new Date());
  }

  async verifyOwner(input: {
    requestId: string;
    presentation: unknown;
  }): Promise<{ status: "verified" } | { status: "denied"; reason: string }> {
    const state = await this.requireState(input.requestId);
    if (state.state !== "proof_required")
      throw new AccessPipelineError("Request is not waiting for an owner signature.", "INVALID_STATE");

    const context = await this.requireLiveContext(input.requestId);
    const policy = await this.deps.policy(context);
    const proof = await this.deps.proof.verify({
      presentation: input.presentation,
      context,
      policy,
    });

    if (!proof.valid) {
      await this.deny(input.requestId, state.state, proof.reason);
      return { status: "denied", reason: proof.reason };
    }
    if (
      !same(proof.challenge, context.challenge) ||
      proof.policyId !== policy.policyId
    ) {
      await this.deny(input.requestId, state.state, "proof_context_mismatch");
      return { status: "denied", reason: "proof_context_mismatch" };
    }

    const binding = await this.deps.ownerBinding.verify({
      verifiedAccount: proof.verifiedAccount,
      buyerAgentId: context.buyerAgentId,
      payerAccount: context.payerAccount,
      network: context.network,
    });
    if (!binding.valid) {
      await this.deny(input.requestId, state.state, "agent_owner_binding_failed");
      return { status: "denied", reason: "agent_owner_binding_failed" };
    }

    const challengeConsumed = await this.deps.challenges.consume(input.requestId, context.challenge);
    if (!challengeConsumed) {
      await this.deny(input.requestId, state.state, "challenge_replayed");
      return { status: "denied", reason: "challenge_replayed" };
    }

    await this.deps.requests.transition(input.requestId, "proof_required", "proof_valid");
    await this.deps.audit.append({
      requestId: input.requestId,
      state: "proof_verified",
      at: this.now().toISOString(),
      proofReference: proof.verificationReference,
      registryReference: binding.registryReference,
    });
    return { status: "verified" };
  }

  async settleAndDeliver(input: {
    requestId: string;
    paymentPayload: PaymentPayload;
  }): Promise<AccessPipelineResult<T>> {
    const state = await this.requireState(input.requestId);
    if (state.state !== "proof_verified")
      throw new AccessPipelineError("Owner signature must pass before payment.", "INVALID_STATE");

    const context = await this.requireContext(input.requestId);
    if (input.paymentPayload.value.sender !== context.payerAccount)
      throw new AccessPipelineError("x402 payer does not match the verified agent owner account.", "PAYMENT_NOT_CONFIRMED");
    const requirement = await this.deps.payments.requirements(context);
    this.assertRequirement(requirement, context);
    await this.deps.requests.transition(input.requestId, "proof_verified", "payment_started");
    let settlement: SettlementResult;
    try {
      settlement = await this.deps.payments.settle({
        context,
        requirements: requirement,
        payload: input.paymentPayload,
      });
    } catch {
      await this.deps.audit.append({
        requestId: input.requestId,
        state: "payment_pending",
        at: this.now().toISOString(),
        reasonCode: "settlement_unconfirmed",
      });
      throw new AccessPipelineError("Settlement outcome is unknown. Keep the resource locked and reconcile before retrying.", "PAYMENT_NOT_CONFIRMED");
    }

    if (settlement.status === "failed") {
      await this.deps.requests.transition(input.requestId, "payment_pending", "payment_failed", {
        reason: settlement.reason,
      });
      await this.deps.audit.append({
        requestId: input.requestId,
        state: "failed",
        at: this.now().toISOString(),
        reasonCode: "settlement_failed",
      });
      throw new AccessPipelineError("Payment settlement failed.", "PAYMENT_NOT_CONFIRMED");
    }

    if (settlement.status === "pending") {
      await this.deps.requests.transition(
        input.requestId,
        "payment_pending",
        "payment_reference_recorded",
        { paymentReference: settlement.transactionReference },
      );
      await this.deps.audit.append({
        requestId: input.requestId,
        state: "payment_pending",
        at: this.now().toISOString(),
        paymentReference: settlement.transactionReference,
      });
      return {
        status: "payment_pending",
        paymentReference: settlement.transactionReference,
      };
    }

    await this.markPaid(input.requestId, context, settlement);
    return this.deliver(input.requestId, context, settlement.transactionReference);
  }

  /** Convenience for tests and non-HTTP callers. HTTP integrations should use the two phases. */
  async execute(input: {
    requestId: string;
    presentation: unknown;
    paymentPayload: PaymentPayload;
  }): Promise<AccessPipelineResult<T>> {
    const authorization = await this.verifyOwner({
      requestId: input.requestId,
      presentation: input.presentation,
    });
    if (authorization.status === "denied") return authorization;
    return this.settleAndDeliver({
      requestId: input.requestId,
      paymentPayload: input.paymentPayload,
    });
  }

  async reconcileAndDeliver(requestId: string): Promise<AccessPipelineResult<T>> {
    const state = await this.requireState(requestId);
    const context = await this.requireContext(requestId);

    if (state.state === "paid") {
      if (!state.paymentReference)
        throw new AccessPipelineError("Paid request has no settlement reference.", "PAYMENT_NOT_CONFIRMED");
      return this.deliver(requestId, context, state.paymentReference);
    }
    if (state.state !== "payment_pending" || !state.paymentReference)
      throw new AccessPipelineError("No pending settlement can be reconciled.", "INVALID_STATE");

    let settlement: SettlementResult;
    try {
      settlement = await this.deps.payments.reconcile({
        context,
        transactionReference: state.paymentReference,
      });
    } catch {
      await this.deps.audit.append({
        requestId,
        state: "payment_pending",
        at: this.now().toISOString(),
        reasonCode: "reconciliation_unavailable",
        paymentReference: state.paymentReference,
      });
      throw new AccessPipelineError("Settlement could not be reconciled. Resource remains locked.", "PAYMENT_NOT_CONFIRMED");
    }
    if (settlement.status === "pending")
      return { status: "payment_pending", paymentReference: state.paymentReference };
    if (settlement.status === "failed") {
      await this.deps.requests.transition(requestId, "payment_pending", "payment_failed", {
        reason: settlement.reason ?? "settlement_failed",
      });
      await this.deps.audit.append({
        requestId,
        state: "failed",
        at: this.now().toISOString(),
        reasonCode: "settlement_failed",
      });
      throw new AccessPipelineError("Payment settlement failed.", "PAYMENT_NOT_CONFIRMED");
    }

    await this.markPaid(requestId, context, settlement);
    return this.deliver(requestId, context, settlement.transactionReference!);
  }

  private async deliver(
    requestId: string,
    context: AccessContext,
    paymentReference: string,
  ): Promise<AccessPipelineResult<T>> {
    const state = await this.requireState(requestId);
    if (!canDeliverResource(state))
      throw new AccessPipelineError("Resource is locked until payment is confirmed.", "PAYMENT_NOT_CONFIRMED");

    const claimed = await this.deps.requests.claimDelivery(requestId);
    if (!claimed) return { status: "delivery_in_progress" };

    try {
      // The idempotency key is mandatory at the resource boundary to protect retries.
      const value = await this.deps.resource.deliver(context, requestId);
      const deliveredAt = this.now().toISOString();
      await this.deps.requests.transition(requestId, "paid", "resource_delivered", { deliveredAt });
      await this.deps.requests.completeDelivery(requestId, deliveredAt);
      await this.deps.audit.append({
        requestId,
        state: "delivered",
        at: deliveredAt,
        paymentReference,
      });
      return { status: "delivered", value, paymentReference };
    } catch {
      await this.deps.requests.releaseDeliveryClaim(requestId);
      await this.deps.audit.append({
        requestId,
        state: "paid",
        at: this.now().toISOString(),
        reasonCode: "delivery_failed_retryable",
        paymentReference,
      });
      throw new AccessPipelineError("Protected resource delivery failed. Payment remains confirmed and delivery can be retried idempotently.", "DELIVERY_FAILED");
    }
  }

  private async markPaid(
    requestId: string,
    context: AccessContext,
    settlement: Extract<SettlementResult, { status: "confirmed" }>,
  ) {
    if (!settlement.transactionReference)
      throw new AccessPipelineError("Confirmed settlement has no transaction reference.", "PAYMENT_NOT_CONFIRMED");
    if (settlement.network !== context.network) {
      await this.deps.requests.transition(requestId, "payment_pending", "payment_failed", {
        reason: "settlement_network_mismatch",
      });
      await this.deps.audit.append({
        requestId,
        state: "failed",
        at: this.now().toISOString(),
        reasonCode: "settlement_network_mismatch",
        paymentReference: settlement.transactionReference,
      });
      throw new AccessPipelineError("Settlement network does not match the access request.", "SETTLEMENT_NETWORK_MISMATCH");
    }
    await this.deps.requests.transition(
      requestId,
      "payment_pending",
      "payment_confirmed",
      { paymentReference: settlement.transactionReference },
    );
    await this.deps.audit.append({
      requestId,
      state: "paid",
      at: this.now().toISOString(),
      paymentReference: settlement.transactionReference,
    });
  }

  private assertRequirement(
    requirement: PaymentRequirement,
    context: AccessContext,
  ) {
    if (
      requirement.network !== context.network ||
      requirement.resourceId !== context.resourceId ||
      !requirement.amount.trim() ||
      !requirement.asset.trim() ||
      !requirement.payTo.trim()
    )
      throw new AccessPipelineError("Payment requirement does not match the server-owned access context.", "PAYMENT_NOT_CONFIRMED");
  }

  private async deny(
    requestId: string,
    expected: AccessRequestState["state"],
    reason: InvalidAccountProof["reason"] | "proof_context_mismatch" | "agent_owner_binding_failed" | "challenge_replayed",
  ) {
    await this.deps.requests.transition(requestId, expected, "proof_invalid", { reason });
    await this.deps.audit.append({
      requestId,
      state: "denied",
      at: this.now().toISOString(),
      reasonCode: reason,
    });
  }

  private async requireState(requestId: string) {
    const state = await this.deps.requests.get(requestId);
    if (!state) throw new AccessPipelineError("Access request was not found.", "REQUEST_NOT_FOUND");
    return state;
  }

  private async requireContext(requestId: string) {
    const context = await this.deps.context(requestId);
    if (
      context.requestId !== requestId ||
      !/^[a-f0-9]{64}$/i.test(context.challenge)
    )
      throw new AccessPipelineError("Access request context is mismatched.", "REQUEST_NOT_FOUND");
    return context;
  }

  private async requireLiveContext(requestId: string) {
    const context = await this.requireContext(requestId);
    const expiresAt = Date.parse(context.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= this.now().getTime())
      throw new AccessPipelineError("Access request signature challenge has expired.", "REQUEST_EXPIRED");
    return context;
  }
}

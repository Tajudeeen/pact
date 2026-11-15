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
  /** Atomically transition paid -> delivered and persist the delivery receipt. */
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
  | { status: "paid"; paymentReference: string }
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

  async requestState(requestId: string): Promise<AccessRequestState> {
    return this.requireState(requestId);
  }

  async verifyOwner(input: {
    requestId: string;
    presentation: unknown;
  }): Promise<{ status: "verified" } | { status: "denied"; reason: string }> {
    const state = await this.requireState(input.requestId);
    // x402 retries the same protected request after the initial 402 response.
    // Once proof is accepted, the same request remains authorized without
    // consuming or re-verifying the one-time challenge.
    if (["proof_verified", "payment_pending", "paid", "delivered"].includes(state.state))
      return { status: "verified" };
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

  /** Called by x402 beforeSettle after the facilitator has verified the payment payload. */
  async beginExternalSettlement(input: {
    requestId: string;
    paymentPayload: PaymentPayload;
    requirement: PaymentRequirement;
  }): Promise<void> {
    const state = await this.requireState(input.requestId);
    if (state.state !== "proof_verified")
      throw new AccessPipelineError("Owner signature must pass before payment.", "INVALID_STATE");
    const context = await this.requireContext(input.requestId);
    if (input.paymentPayload.value.sender !== context.payerAccount)
      throw new AccessPipelineError("x402 sender does not match the agent's registered payment wallet.", "PAYMENT_NOT_CONFIRMED");
    await this.assertRequirement(input.requirement, context);
    await this.deps.requests.transition(input.requestId, "proof_verified", "payment_started");
  }

  /** Called by x402 afterSettle. Finalized settlement is required before this can mark paid. */
  async completeExternalSettlement(
    requestId: string,
    settlement: SettlementResult,
  ): Promise<{ status: "paid"; paymentReference: string } | { status: "payment_pending"; paymentReference: string }> {
    const state = await this.requireState(requestId);
    if (state.state !== "payment_pending")
      throw new AccessPipelineError("Request is not awaiting settlement.", "INVALID_STATE");
    const context = await this.requireContext(requestId);

    if (settlement.status === "failed") {
      await this.deps.requests.transition(requestId, "payment_pending", "payment_failed", {
        reason: settlement.reason,
      });
      await this.deps.audit.append({
        requestId,
        state: "failed",
        at: this.now().toISOString(),
        reasonCode: "settlement_failed",
      });
      throw new AccessPipelineError("Payment settlement failed.", "PAYMENT_NOT_CONFIRMED");
    }

    if (settlement.status === "pending") {
      await this.deps.requests.transition(
        requestId,
        "payment_pending",
        "payment_reference_recorded",
        { paymentReference: settlement.transactionReference },
      );
      await this.deps.audit.append({
        requestId,
        state: "payment_pending",
        at: this.now().toISOString(),
        paymentReference: settlement.transactionReference,
      });
      return { status: "payment_pending", paymentReference: settlement.transactionReference };
    }

    await this.markPaid(requestId, context, settlement);
    return { status: "paid", paymentReference: settlement.transactionReference };
  }

  /** Resource handlers call this only after the x402 middleware has finalized settlement. */
  async deliverPaidResource(requestId: string): Promise<AccessPipelineResult<T>> {
    const state = await this.requireState(requestId);
    if (state.state !== "paid" || !state.paymentReference)
      throw new AccessPipelineError("Resource is locked until x402 settlement is finalized.", "PAYMENT_NOT_CONFIRMED");
    const context = await this.requireContext(requestId);
    return this.deliver(requestId, context, state.paymentReference);
  }

  async settleAndDeliver(input: {
    requestId: string;
    paymentPayload: PaymentPayload;
  }): Promise<AccessPipelineResult<T>> {
    const context = await this.requireContext(input.requestId);
    const requirement = await this.deps.payments.requirements(context);
    await this.beginExternalSettlement({
      requestId: input.requestId,
      paymentPayload: input.paymentPayload,
      requirement,
    });

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

    const outcome = await this.completeExternalSettlement(input.requestId, settlement);
    if (outcome.status === "payment_pending") return outcome;
    return this.deliverPaidResource(input.requestId);
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

    let value: T;
    const deliveredAt = this.now().toISOString();
    try {
      // The idempotency key is mandatory at the resource boundary to protect retries.
      value = await this.deps.resource.deliver(context, requestId);
      // State + delivery receipt are committed atomically by the repository.
      await this.deps.requests.completeDelivery(requestId, deliveredAt);
    } catch {
      await this.deps.requests.releaseDeliveryClaim(requestId);
      await this.deps.audit.append({
        requestId,
        state: "paid",
        at: this.now().toISOString(),
        reasonCode: "delivery_failed_retryable",
        paymentReference,
      }).catch(() => undefined);
      throw new AccessPipelineError("Protected resource delivery failed. Payment remains confirmed and delivery can be retried idempotently.", "DELIVERY_FAILED");
    }

    // An audit sink outage must not discard already-authorized resource bytes.
    await this.deps.audit.append({
      requestId,
      state: "delivered",
      at: deliveredAt,
      paymentReference,
    }).catch(() => undefined);
    return { status: "delivered", value, paymentReference };
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

  private async assertRequirement(
    requirement: PaymentRequirement,
    context: AccessContext,
  ) {
    // Compare the facilitator-bound requirement with the seller's server-side
    // configuration. Non-empty fields alone are not enough to authorize a price.
    const expected = await this.deps.payments.requirements(context);
    if (
      requirement.network !== expected.network ||
      requirement.resourceId !== expected.resourceId ||
      requirement.amount !== expected.amount ||
      requirement.asset !== expected.asset ||
      requirement.payTo !== expected.payTo ||
      requirement.network !== context.network ||
      requirement.resourceId !== context.resourceId
    )
      throw new AccessPipelineError("Payment requirement does not match the seller's configured price and resource.", "PAYMENT_NOT_CONFIRMED");
  }

  /** Keep ambiguous x402 settlement failures pending for explicit reconciliation. */
  async recordExternalSettlementFailure(requestId: string, reasonCode: string): Promise<void> {
    const state = await this.requireState(requestId);
    if (state.state !== "payment_pending")
      throw new AccessPipelineError("Only a pending payment can be reconciled.", "INVALID_STATE");
    await this.deps.audit.append({
      requestId,
      state: "payment_pending",
      at: this.now().toISOString(),
      reasonCode: reasonCode.slice(0, 80),
    });
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

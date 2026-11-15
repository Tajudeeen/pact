import { describe, expect, it, vi } from "vitest";
import type {
  AccessAuditEvent,
  AccessChallengeRepository,
  AccessContext,
  ConcordiumProofVerifier,
  ConcordiumX402Settlement,
  AccountOwnershipPolicy,
  PaymentRequirement,
  ProtectedResource,
} from "../server/access/contracts";
import { AccessPipeline, type AccessPipelineDependencies, type AccessRequestRepository } from "../server/access/pipeline";
import {
  createAccessRequest,
  transitionAccessRequest,
  type AccessRequestState,
} from "../server/access/state-machine";

const context: AccessContext = {
  requestId: "req-100",
  sellerId: "seller-1",
  resourceId: "dataset-1",
  buyerAgentId: "agent-1",
  ownerAccount: "owner-account",
  payerAccount: "payer-account",
  network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
  challenge: "a".repeat(64),
  expiresAt: "2026-11-16T00:00:00.000Z",
};
const policy: AccountOwnershipPolicy = {
  policyId: "owner-account-signature-v1",
  description: "The registered owner account authorizes this agent request",
};
const requirement: PaymentRequirement = {
  scheme: "exact",
  network: context.network,
  amount: "1000000",
  asset: "CCD",
  payTo: "seller-payout",
  resourceId: context.resourceId,
};

function harness(overrides: Partial<AccessPipelineDependencies<string>> = {}) {
  let state: AccessRequestState = transitionAccessRequest(
    createAccessRequest(context.requestId),
    "challenge",
  );
  let deliveryClaimed = false;
  const events: string[] = [];
  const audit: AccessAuditEvent[] = [];
  const requests: AccessRequestRepository = {
    get: async () => state,
    transition: async (_id, expected, event, details) => {
      if (state.state !== expected) throw new Error("state compare-and-set failed");
      state = transitionAccessRequest(state, event, details);
      events.push(event);
      return state;
    },
    claimDelivery: async () => {
      if (deliveryClaimed) return false;
      deliveryClaimed = true;
      return true;
    },
    completeDelivery: async (_id, deliveredAt) => {
      state = transitionAccessRequest(state, "resource_delivered", { deliveredAt });
      events.push("resource_delivered");
      events.push("delivery_complete");
    },
    releaseDeliveryClaim: async () => { deliveryClaimed = false; },
  };
  const challenges: AccessChallengeRepository = { consume: vi.fn(async () => true) };
  const proof: ConcordiumProofVerifier = {
    verify: vi.fn(async () => ({
      valid: true as const,
      verifiedAccount: "owner-account",
      policyId: policy.policyId,
      challenge: context.challenge,
      verifiedAt: "2026-11-15T12:00:00.000Z",
      verificationReference: "verify-ref-1",
    })),
  };
  const ownerBinding = {
    verify: vi.fn(async () => ({ valid: true as const, registryReference: "registry-ref-1" })),
  };
  const payments: ConcordiumX402Settlement = {
    requirements: vi.fn(async () => requirement),
    settle: vi.fn(async () => ({
      status: "confirmed" as const,
      transactionReference: "ccd-tx-1",
      network: context.network,
    })),
    reconcile: vi.fn(async () => ({
      status: "confirmed" as const,
      transactionReference: "ccd-tx-1",
      network: context.network,
    })),
  };
  const resource: ProtectedResource<string> = {
    deliver: vi.fn(async () => {
      events.push("resource_callback");
      return "protected dataset";
    }),
  };
  const deps: AccessPipelineDependencies<string> = {
    requests,
    context: async () => context,
    policy: async () => policy,
    challenges,
    proof,
    ownerBinding,
    payments,
    resource,
    audit: { append: async (event) => { audit.push(event); } },
    now: () => new Date("2026-11-15T12:00:00.000Z"),
    ...overrides,
  };
  return {
    pipeline: new AccessPipeline(deps),
    state: () => state,
    events,
    audit,
    challenges,
    proof,
    ownerBinding,
    payments,
    resource,
  };
}

describe("Pact Access proof and payment pipeline", () => {
  it("separates owner authorization from payment settlement", async () => {
    const h = harness();
    const authorization = await h.pipeline.verifyOwner({
      requestId: context.requestId,
      presentation: { account: context.ownerAccount, signature: { opaque: true } },
    });
    expect(authorization).toEqual({ status: "verified" });
    expect(h.state().state).toBe("proof_verified");
    expect(h.payments.settle).not.toHaveBeenCalled();
    expect(h.resource.deliver).not.toHaveBeenCalled();

    const result = await h.pipeline.settleAndDeliver({
      requestId: context.requestId,
      paymentPayload: { value: { sender: context.payerAccount, signedTransaction: { opaque: true } } },
    });
    expect(result).toMatchObject({ status: "delivered", paymentReference: "ccd-tx-1" });
  });

  it("supports x402 middleware hooks and keeps delivery in the resource handler", async () => {
    const h = harness();
    await h.pipeline.verifyOwner({
      requestId: context.requestId,
      presentation: { account: context.ownerAccount, signature: {} },
    });
    await h.pipeline.beginExternalSettlement({
      requestId: context.requestId,
      paymentPayload: {
        value: { sender: context.payerAccount, signedTransaction: {} },
      },
      requirement,
    });
    const paid = await h.pipeline.completeExternalSettlement(context.requestId, {
      status: "confirmed",
      transactionReference: "middleware-tx",
      network: context.network,
    });
    expect(paid).toEqual({ status: "paid", paymentReference: "middleware-tx" });
    expect(h.resource.deliver).not.toHaveBeenCalled();

    const delivered = await h.pipeline.deliverPaidResource(context.requestId);
    expect(delivered).toMatchObject({ status: "delivered", paymentReference: "middleware-tx" });
    expect(h.resource.deliver).toHaveBeenCalledTimes(1);
  });

  it("delivers only after proof, owner binding, and confirmed settlement", async () => {
    const h = harness();
    const result = await h.pipeline.execute({
      requestId: context.requestId,
      presentation: { opaque: true },
      paymentPayload: { value: { sender: context.payerAccount, signedTransaction: { opaque: true } } },
    });

    expect(result).toEqual({
      status: "delivered",
      value: "protected dataset",
      paymentReference: "ccd-tx-1",
    });
    expect(h.events).toEqual([
      "proof_valid",
      "payment_started",
      "payment_confirmed",
      "resource_callback",
      "resource_delivered",
      "delivery_complete",
    ]);
    expect(h.resource.deliver).toHaveBeenCalledWith(context, context.requestId);
    expect(h.audit.some((event) => event.state === "delivered")).toBe(true);
    expect(h.audit.some((event) => "identity" in event || "presentation" in event)).toBe(false);
  });

  it("rejects an x402 sender that differs from the verified owner", async () => {
    const h = harness();
    await h.pipeline.verifyOwner({
      requestId: context.requestId,
      presentation: { account: context.payerAccount, signature: {} },
    });
    await expect(h.pipeline.settleAndDeliver({
      requestId: context.requestId,
      paymentPayload: {
        value: { sender: "different-payer", signedTransaction: {} },
      },
    })).rejects.toMatchObject({ code: "PAYMENT_NOT_CONFIRMED" });
    expect(h.state().state).toBe("proof_verified");
    expect(h.payments.settle).not.toHaveBeenCalled();
    expect(h.resource.deliver).not.toHaveBeenCalled();
  });

  it("does not discard paid resource bytes if the post-delivery audit sink is unavailable", async () => {
    const events: AccessAuditEvent[] = [];
    const h = harness({
      audit: {
        append: async (event) => {
          if (event.state === "delivered") throw new Error("audit storage unavailable");
          events.push(event);
        },
      },
    });
    const result = await h.pipeline.execute({
      requestId: context.requestId,
      presentation: { account: context.ownerAccount, signature: {} },
      paymentPayload: {
        value: { sender: context.payerAccount, signedTransaction: {} },
      },
    });
    expect(result).toMatchObject({ status: "delivered", value: "protected dataset" });
    expect(h.state().state).toBe("delivered");
  });

  it("denies invalid proof before payment or delivery", async () => {
    const h = harness({
      proof: {
        verify: vi.fn(async () => ({ valid: false as const, reason: "invalid" as const })),
      },
    });
    const result = await h.pipeline.execute({
      requestId: context.requestId,
      presentation: {},
      paymentPayload: { value: { sender: context.payerAccount, signedTransaction: {} } },
    });

    expect(result).toEqual({ status: "denied", reason: "invalid" });
    expect(h.state().state).toBe("denied");
    expect(h.payments.settle).not.toHaveBeenCalled();
    expect(h.resource.deliver).not.toHaveBeenCalled();
  });

  it("denies a valid proof when the registry owner does not match", async () => {
    const h = harness({
      ownerBinding: {
        verify: vi.fn(async () => ({ valid: false as const })),
      },
    });
    const result = await h.pipeline.execute({
      requestId: context.requestId,
      presentation: {},
      paymentPayload: { value: { sender: context.payerAccount, signedTransaction: {} } },
    });

    expect(result).toEqual({ status: "denied", reason: "agent_owner_binding_failed" });
    expect(h.payments.settle).not.toHaveBeenCalled();
    expect(h.resource.deliver).not.toHaveBeenCalled();
  });

  it("does not enter payment state when server requirements are invalid", async () => {
    const h = harness();
    vi.mocked(h.payments.requirements).mockResolvedValue({
      ...requirement,
      network: "ccd:9dd9ca4d19e9393877d2c44b70f89acb",
    });
    await h.pipeline.verifyOwner({
      requestId: context.requestId,
      presentation: { account: context.ownerAccount, signature: {} },
    });
    await expect(h.pipeline.settleAndDeliver({
      requestId: context.requestId,
      paymentPayload: {
        value: { sender: context.payerAccount, signedTransaction: {} },
      },
    })).rejects.toMatchObject({ code: "PAYMENT_NOT_CONFIRMED" });
    expect(h.state().state).toBe("proof_verified");
    expect(h.payments.settle).not.toHaveBeenCalled();
  });

  it("keeps resources locked when the settlement result is unknown", async () => {
    const h = harness();
    vi.mocked(h.payments.settle).mockRejectedValue(new Error("facilitator timeout"));
    await h.pipeline.verifyOwner({
      requestId: context.requestId,
      presentation: { account: context.ownerAccount, signature: {} },
    });
    await expect(h.pipeline.settleAndDeliver({
      requestId: context.requestId,
      paymentPayload: {
        value: { sender: context.payerAccount, signedTransaction: {} },
      },
    })).rejects.toMatchObject({ code: "PAYMENT_NOT_CONFIRMED" });
    expect(h.state().state).toBe("payment_pending");
    expect(h.resource.deliver).not.toHaveBeenCalled();
    expect(h.audit.some((event) => event.reasonCode === "settlement_unconfirmed")).toBe(true);
  });

  it("keeps the resource locked while settlement is pending, then reconciles", async () => {
    const h = harness();
    vi.mocked(h.payments.settle).mockResolvedValue({
      status: "pending",
      transactionReference: "ccd-tx-pending",
    });

    const first = await h.pipeline.execute({
      requestId: context.requestId,
      presentation: {},
      paymentPayload: { value: { sender: context.payerAccount, signedTransaction: {} } },
    });
    expect(first).toEqual({ status: "payment_pending", paymentReference: "ccd-tx-pending" });
    expect(h.state().state).toBe("payment_pending");
    expect(h.resource.deliver).not.toHaveBeenCalled();

    const second = await h.pipeline.reconcileAndDeliver(context.requestId);
    expect(second).toEqual({
      status: "delivered",
      value: "protected dataset",
      paymentReference: "ccd-tx-1",
    });
  });

  it("does not deliver when settlement reports the wrong network", async () => {
    const h = harness();
    vi.mocked(h.payments.settle).mockResolvedValue({
      status: "confirmed",
      transactionReference: "wrong-network-tx",
      network: "ccd:9dd9ca4d19e9393877d2c44b70f89acb",
    });

    await expect(h.pipeline.execute({
      requestId: context.requestId,
      presentation: {},
      paymentPayload: { value: { sender: context.payerAccount, signedTransaction: {} } },
    })).rejects.toMatchObject({ code: "SETTLEMENT_NETWORK_MISMATCH" });
    expect(h.resource.deliver).not.toHaveBeenCalled();
    expect(h.state().state).toBe("failed");
  });

  it("rejects a replayed challenge before payment or delivery", async () => {
    const h = harness({
      challenges: { consume: vi.fn(async () => false) },
    });
    const result = await h.pipeline.execute({
      requestId: context.requestId,
      presentation: {},
      paymentPayload: { value: { sender: context.payerAccount, signedTransaction: {} } },
    });
    expect(result).toEqual({ status: "denied", reason: "challenge_replayed" });
    expect(h.payments.settle).not.toHaveBeenCalled();
    expect(h.resource.deliver).not.toHaveBeenCalled();
  });

  it("rejects an expired request before calling the proof verifier", async () => {
    const h = harness({
      context: async () => ({ ...context, expiresAt: "2026-11-15T11:59:59.000Z" }),
    });

    await expect(h.pipeline.execute({
      requestId: context.requestId,
      presentation: {},
      paymentPayload: { value: { sender: context.payerAccount, signedTransaction: {} } },
    })).rejects.toMatchObject({ code: "REQUEST_EXPIRED" });
    expect(h.proof.verify).not.toHaveBeenCalled();
    expect(h.payments.settle).not.toHaveBeenCalled();
  });
});

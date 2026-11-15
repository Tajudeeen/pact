import { describe, expect, it, vi } from "vitest";
import type { AccessRequestState } from "../server/access/state-machine";
import {
  createPactX402Hooks,
  PactSettlementPersistenceError,
  PACT_ACCESS_REQUEST_HEADER,
  PACT_OWNER_PROOF_HEADER,
} from "../server/access/x402-hooks";

const network = "ccd:4221332d34e1694168c2a0c0b3fd0f27" as const;
const requestId = "access-request-1";
const owner = "4".repeat(50);
const payer = "5".repeat(50);
const resource = "https://pact.test/api/datasets/weather";

function harness(state: AccessRequestState["state"] = "proof_required") {
  const current: AccessRequestState = { requestId, state };
  const pipeline = {
    requestState: vi.fn(async () => current),
    verifyOwner: vi.fn(async () => ({ status: "verified" as const })),
    beginExternalSettlement: vi.fn(async () => {}),
    completeExternalSettlement: vi.fn(async () => ({ status: "paid" })),
    recordExternalSettlementFailure: vi.fn(async () => {}),
  };
  const adapter = {
    getHeader: (name: string) => ({
      [PACT_ACCESS_REQUEST_HEADER]: requestId,
      [PACT_OWNER_PROOF_HEADER]: Buffer.from(
        JSON.stringify({ account: owner, signature: { "0": { "0": "aa" } } }),
      ).toString("base64url"),
    })[name],
  };
  const settleContext = {
    paymentPayload: {
      resource: { url: resource },
      payload: {
        signedTransaction: {
          version: 1,
          header: { sender: payer },
        },
      },
    },
    requirements: {
      scheme: "exact",
      network,
      amount: "1000000",
      asset: "CCD",
      payTo: "6".repeat(50),
    },
    transportContext: { request: { adapter } },
  };
  return { pipeline, adapter, settleContext, hooks: createPactX402Hooks(pipeline) };
}

describe("Pact x402 hooks", () => {
  it("requires an owner proof before x402 payment processing", async () => {
    const h = harness();
    const result = await h.hooks.onProtectedRequest({
      adapter: { getHeader: () => undefined },
      path: "/api/datasets/weather",
    });
    expect(result).toEqual({ abort: true, reason: "pact_owner_proof_required" });
    expect(h.pipeline.verifyOwner).not.toHaveBeenCalled();
  });

  it("verifies the owner proof before allowing x402 to issue payment requirements", async () => {
    const h = harness();
    const result = await h.hooks.onProtectedRequest({
      adapter: h.adapter,
      path: "/api/datasets/weather",
    });
    expect(result).toBeUndefined();
    expect(h.pipeline.verifyOwner).toHaveBeenCalledWith({
      requestId,
      presentation: {
        account: owner,
        signature: { "0": { "0": "aa" } },
      },
    });
  });

  it("skips x402 and grants access when this request is already paid", async () => {
    const h = harness("paid");
    const result = await h.hooks.onProtectedRequest({
      adapter: h.adapter,
      path: "/api/datasets/weather",
    });
    expect(result).toEqual({ grantAccess: true });
    expect(h.pipeline.verifyOwner).not.toHaveBeenCalled();
  });

  it("blocks another payment while a prior settlement is ambiguous", async () => {
    const h = harness("payment_pending");
    const result = await h.hooks.onProtectedRequest({
      adapter: h.adapter,
      path: "/api/datasets/weather",
    });
    expect(result).toEqual({
      abort: true,
      reason: "pact_payment_reconciliation_required",
    });
  });

  it("binds before-settle checks to the signed sender and exact resource", async () => {
    const h = harness();
    const result = await h.hooks.onBeforeSettle(h.settleContext);
    expect(result).toBeUndefined();
    expect(h.pipeline.beginExternalSettlement).toHaveBeenCalledWith({
      requestId,
      paymentPayload: {
        value: {
          sender: payer,
          signedTransaction: h.settleContext.paymentPayload.payload.signedTransaction,
        },
      },
      requirement: {
        scheme: "exact",
        network,
        amount: "1000000",
        asset: "CCD",
        payTo: "6".repeat(50),
        resourceId: resource,
      },
    });
  });

  it("marks paid only after the facilitator confirms finalization and payer", async () => {
    const h = harness();
    await h.hooks.onAfterSettle({
      ...h.settleContext,
      result: {
        success: true,
        payer,
        transaction: "ccd-transaction-hash",
        network,
      },
    });
    expect(h.pipeline.completeExternalSettlement).toHaveBeenCalledWith(requestId, {
      status: "confirmed",
      transactionReference: "ccd-transaction-hash",
      network,
      payerAccount: payer,
    });
  });

  it("fails closed when the facilitator omits the confirmed payer", async () => {
    const h = harness();
    await expect(h.hooks.onAfterSettle({
      ...h.settleContext,
      result: {
        success: true,
        transaction: "ccd-transaction-hash",
        network,
      },
    })).rejects.toBeInstanceOf(PactSettlementPersistenceError);
    expect(h.pipeline.completeExternalSettlement).not.toHaveBeenCalled();
  });

  it("keeps ambiguous facilitator failures pending for reconciliation", async () => {
    const h = harness("payment_pending");
    await h.hooks.onSettleFailure({
      ...h.settleContext,
      error: new Error("facilitator timeout"),
    });
    expect(h.pipeline.recordExternalSettlementFailure).toHaveBeenCalledWith(
      requestId,
      "x402_error",
    );
  });
});

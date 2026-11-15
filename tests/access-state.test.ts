import { describe, expect, it } from "vitest";
import {
  canDeliverResource,
  createAccessRequest,
  InvalidAccessTransition,
  transitionAccessRequest,
} from "../server/access/state-machine";

describe("Pact Access request state machine", () => {
  it("blocks delivery until proof and payment have passed", () => {
    let request = createAccessRequest("req-1");
    expect(canDeliverResource(request)).toBe(false);

    request = transitionAccessRequest(request, "challenge");
    request = transitionAccessRequest(request, "proof_valid");
    expect(canDeliverResource(request)).toBe(false);

    request = transitionAccessRequest(request, "payment_started");
    expect(canDeliverResource(request)).toBe(false);

    request = transitionAccessRequest(request, "payment_confirmed", {
      paymentReference: "tx-test-1",
    });
    expect(canDeliverResource(request)).toBe(true);

    request = transitionAccessRequest(request, "resource_delivered", {
      deliveredAt: "2026-11-15T12:00:00.000Z",
    });
    expect(request.state).toBe("delivered");
  });

  it("denies an invalid proof and makes denial terminal", () => {
    let request = createAccessRequest("req-2");
    request = transitionAccessRequest(request, "challenge");
    request = transitionAccessRequest(request, "proof_invalid", {
      reason: "proof_not_bound_to_buyer",
    });

    expect(request.state).toBe("denied");
    expect(canDeliverResource(request)).toBe(false);
    expect(() => transitionAccessRequest(request, "payment_started"))
      .toThrow(InvalidAccessTransition);
  });

  it("requires a settlement reference before marking payment confirmed", () => {
    let request = createAccessRequest("req-3");
    request = transitionAccessRequest(request, "challenge");
    request = transitionAccessRequest(request, "proof_valid");
    request = transitionAccessRequest(request, "payment_started");

    expect(() => transitionAccessRequest(request, "payment_confirmed"))
      .toThrow("A confirmed payment requires a payment reference.");
  });

  it("does not allow delivery from payment-pending", () => {
    let request = createAccessRequest("req-4");
    request = transitionAccessRequest(request, "challenge");
    request = transitionAccessRequest(request, "proof_valid");
    request = transitionAccessRequest(request, "payment_started");

    expect(() => transitionAccessRequest(request, "resource_delivered", {
      deliveredAt: "2026-11-15T12:00:00.000Z",
    })).toThrow(InvalidAccessTransition);
  });
});

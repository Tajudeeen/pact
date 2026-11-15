export type AccessState =
  | "requested"
  | "proof_required"
  | "proof_verified"
  | "payment_pending"
  | "paid"
  | "delivered"
  | "denied"
  | "failed";

export type AccessEvent =
  | "challenge"
  | "proof_valid"
  | "proof_invalid"
  | "payment_started"
  | "payment_confirmed"
  | "payment_reference_recorded"
  | "payment_failed"
  | "resource_delivered"
  | "request_denied"
  | "request_failed";

export interface AccessRequestState {
  requestId: string;
  state: AccessState;
  reason?: string;
  paymentReference?: string;
  deliveredAt?: string;
}

const transitions: Record<AccessState, Partial<Record<AccessEvent, AccessState>>> = {
  requested: {
    challenge: "proof_required",
    request_denied: "denied",
    request_failed: "failed",
  },
  proof_required: {
    proof_valid: "proof_verified",
    proof_invalid: "denied",
    request_denied: "denied",
    request_failed: "failed",
  },
  proof_verified: {
    payment_started: "payment_pending",
    request_denied: "denied",
    request_failed: "failed",
  },
  payment_pending: {
    payment_reference_recorded: "payment_pending",
    payment_confirmed: "paid",
    payment_failed: "failed",
    request_failed: "failed",
  },
  paid: {
    resource_delivered: "delivered",
    request_failed: "failed",
  },
  delivered: {},
  denied: {},
  failed: {},
};

export class InvalidAccessTransition extends Error {
  constructor(state: AccessState, event: AccessEvent) {
    super(`Cannot apply "${event}" while access request is "${state}".`);
    this.name = "InvalidAccessTransition";
  }
}

export function createAccessRequest(requestId: string): AccessRequestState {
  if (!requestId.trim()) throw new Error("requestId is required");
  return { requestId, state: "requested" };
}

export function transitionAccessRequest(
  current: AccessRequestState,
  event: AccessEvent,
  details: { reason?: string; paymentReference?: string; deliveredAt?: string } = {},
): AccessRequestState {
  const next = transitions[current.state][event];
  if (!next) throw new InvalidAccessTransition(current.state, event);

  if ((event === "payment_confirmed" || event === "payment_reference_recorded") && !details.paymentReference?.trim()) {
    throw new Error("A confirmed payment requires a payment reference.");
  }
  if (event === "resource_delivered" && !details.deliveredAt?.trim()) {
    throw new Error("Resource delivery requires a timestamp.");
  }
  if ((event === "proof_invalid" || event === "request_denied" || event === "payment_failed") &&
      !details.reason?.trim()) {
    throw new Error(`Event "${event}" requires a reason.`);
  }

  return {
    ...current,
    state: next,
    ...(details.reason ? { reason: details.reason } : {}),
    ...(details.paymentReference ? { paymentReference: details.paymentReference } : {}),
    ...(details.deliveredAt ? { deliveredAt: details.deliveredAt } : {}),
  };
}

/** Access is deliverable only after the state machine has confirmed payment. */
export function canDeliverResource(state: AccessRequestState): boolean {
  return state.state === "paid";
}

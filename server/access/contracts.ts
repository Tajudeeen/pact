import type { AccessRequestState } from "./state-machine";

/** Server-issued context. Every field must be derived or validated server-side. */
export interface AccessContext {
  requestId: string;
  sellerId: string;
  resourceId: string;
  buyerAgentId: string;
  ownerAccount: string;
  payerAccount: string;
  network: "ccd:4221332d34e1694168c2a0c0b3fd0f27" | "ccd:9dd9ca4d19e9393877d2c44b70f89acb";
  challenge: string;
  expiresAt: string;
}

/** The policy names one exact claim. Never accept a client-selected statement. */
export interface AccountOwnershipPolicy {
  policyId: string;
  description: string;
}

/** Adapter returns only verified facts, not the raw presentation or identity attributes. */
export interface VerifiedAccountProof {
  valid: true;
  verifiedAccount: string;
  policyId: string;
  challenge: string;
  verifiedAt: string;
  verificationReference: string;
}

export interface InvalidAccountProof {
  valid: false;
  reason: "invalid" | "expired" | "wrong_challenge" | "wrong_policy" | "wrong_account" | "unavailable";
}

export type ProofResult = VerifiedAccountProof | InvalidAccountProof;

export interface AccessChallengeRepository {
  /** Atomically marks a server-issued challenge as consumed exactly once. */
  consume(requestId: string, challenge: string): Promise<boolean>;
}

export interface ConcordiumProofVerifier {
  verify(input: {
    presentation: unknown;
    context: AccessContext;
    policy: AccountOwnershipPolicy;
  }): Promise<ProofResult>;
}

/** x402 payment requirements must be created from seller configuration, never client input. */
export interface PaymentRequirement {
  scheme: "exact";
  network: AccessContext["network"];
  amount: string;
  asset: string;
  payTo: string;
  resourceId: string;
}

export interface PaymentPayload {
  /** @x402/concordium Exact V2 payload. Do not log or persist raw signatures. */
  value: {
    sender: string;
    signedTransaction: unknown;
  };
}

export type SettlementResult =
  | {
      status: "confirmed";
      transactionReference: string;
      network: AccessContext["network"];
      payerAccount?: string;
    }
  | { status: "pending"; transactionReference: string }
  | { status: "failed"; reason: string };

export interface ConcordiumX402Settlement {
  requirements(context: AccessContext): Promise<PaymentRequirement>;
  /** Adapter must independently enforce payload.sender === context.payerAccount. */
  settle(input: {
    context: AccessContext;
    requirements: PaymentRequirement;
    payload: PaymentPayload;
  }): Promise<SettlementResult>;
  reconcile(input: {
    context: AccessContext;
    transactionReference: string;
  }): Promise<SettlementResult>;
}

export interface ProtectedResource<T = unknown> {
  /** This callback is invoked only after proof and settlement are confirmed. */
  deliver(context: AccessContext, idempotencyKey: string): Promise<T>;
}

export interface AccessAuditEvent {
  requestId: string;
  state: AccessRequestState["state"];
  at: string;
  reasonCode?: string;
  proofReference?: string;
  registryReference?: string;
  paymentReference?: string;
  /** Deliberately no raw proof, identity attributes, or payment signature. */
}

export interface AccessAuditWriter {
  append(event: AccessAuditEvent): Promise<void>;
}

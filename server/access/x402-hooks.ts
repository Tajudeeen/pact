import type {
  AccessContext,
  PaymentPayload,
  PaymentRequirement,
  SettlementResult,
} from "./contracts";
import type { AccessRequestState } from "./state-machine";

export const PACT_ACCESS_REQUEST_HEADER = "x-pact-access-request";
export const PACT_OWNER_PROOF_HEADER = "x-pact-owner-proof";

export interface PactAccessPipeline {
  requestState(requestId: string): Promise<AccessRequestState>;
  verifyOwner(input: {
    requestId: string;
    presentation: unknown;
  }): Promise<{ status: "verified" } | { status: "denied"; reason: string }>;
  beginExternalSettlement(input: {
    requestId: string;
    paymentPayload: PaymentPayload;
    requirement: PaymentRequirement;
  }): Promise<void>;
  completeExternalSettlement(
    requestId: string,
    settlement: SettlementResult,
  ): Promise<unknown>;
  recordExternalSettlementFailure(requestId: string, reasonCode: string): Promise<void>;
}

interface RequestAdapter {
  getHeader(name: string): string | undefined;
}

interface X402HttpRequestContext {
  adapter: RequestAdapter;
  path: string;
  method?: string;
}

interface X402TransportContext {
  request?: X402HttpRequestContext;
}

interface X402PaymentPayload {
  resource?: { url?: string };
  payload?: {
    signedTransaction?: {
      version?: number;
      header?: { sender?: string };
    };
  };
}

interface X402PaymentRequirements {
  scheme: string;
  network: AccessContext["network"];
  amount: string;
  asset: string;
  payTo: string;
}

interface X402SettleContext {
  paymentPayload: {
    resource?: { url?: string };
    payload: Record<string, unknown>;
  };
  requirements: {
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
  };
  transportContext?: unknown;
}

interface X402SettleResultContext extends X402SettleContext {
  result: {
    success: boolean;
    payer?: string;
    transaction: string;
    network: string;
  };
}

interface X402SettleFailureContext extends X402SettleContext {
  error: Error;
}

function safeRequestId(value: string | undefined): string | null {
  if (!value || value.length > 150 || !/^[A-Za-z0-9._:-]+$/.test(value)) return null;
  return value;
}

function requestIdFrom(context: X402SettleContext): string | null {
  if (!context.transportContext || typeof context.transportContext !== "object") return null;
  const request = (context.transportContext as Record<string, unknown>).request;
  if (!request || typeof request !== "object") return null;
  const adapter = (request as Record<string, unknown>).adapter;
  if (!adapter || typeof adapter !== "object") return null;
  const getHeader = (adapter as Record<string, unknown>).getHeader;
  if (typeof getHeader !== "function") return null;
  return safeRequestId(
    (getHeader as (name: string) => string | undefined).call(adapter, PACT_ACCESS_REQUEST_HEADER),
  );
}

function isConcordiumNetwork(value: string): value is AccessContext["network"] {
  return value === "ccd:4221332d34e1694168c2a0c0b3fd0f27" ||
    value === "ccd:9dd9ca4d19e9393877d2c44b70f89acb";
}

function decodeOwnerProof(value: string | undefined): unknown | null {
  if (!value || value.length > 16_384 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const proof = parsed as Record<string, unknown>;
    if (
      typeof proof.account !== "string" ||
      proof.account.length < 45 ||
      proof.account.length > 55 ||
      !proof.signature ||
      typeof proof.signature !== "object"
    ) return null;
    return { account: proof.account, signature: proof.signature };
  } catch {
    return null;
  }
}

function signedTransactionFrom(payload: X402SettleContext["paymentPayload"]) {
  const transaction = payload.payload?.signedTransaction as X402PaymentPayload["payload"] extends { signedTransaction?: infer T } ? T : never;
  if (
    !transaction ||
    transaction.version !== 1 ||
    !transaction.header ||
    typeof transaction.header.sender !== "string" ||
    !transaction.header.sender
  ) return null;
  return transaction;
}

/** Error name is recognized by x402 core and turns an after-settle persistence
 * failure into a failed HTTP settlement response. The funds may already have
 * moved, so the Pact request remains reconcilable and the resource stays locked.
 */
export class PactSettlementPersistenceError extends Error {
  readonly reason = "pact_access_state_persistence_failed";
  constructor() {
    super("Pact could not persist the confirmed settlement. Resource delivery is blocked pending reconciliation.");
    this.name = "AfterSettleAbortError";
  }
}

/**
 * Hooks for x402 v2's HTTP resource server and resource server.
 *
 * The owner gate runs before x402 emits a 402 challenge. The before-settle hook
 * rechecks the sender and exact seller price after facilitator verification.
 * The after-settle hook only marks the request paid after finalized settlement.
 */
export function createPactX402Hooks(pipeline: PactAccessPipeline) {
  return {
    async onProtectedRequest(
      context: X402HttpRequestContext,
    ): Promise<void | { grantAccess: true } | { abort: true; reason: string }> {
      const requestId = safeRequestId(
        context.adapter.getHeader(PACT_ACCESS_REQUEST_HEADER),
      );
      if (!requestId) return { abort: true, reason: "pact_access_request_required" };

      try {
        const state = await pipeline.requestState(requestId);
        if (state.state === "paid") return { grantAccess: true };
        if (state.state === "payment_pending")
          return { abort: true, reason: "pact_payment_reconciliation_required" };
        if (state.state === "delivered")
          return { abort: true, reason: "pact_access_already_delivered" };
        if (state.state !== "proof_required" && state.state !== "proof_verified")
          return { abort: true, reason: "pact_access_not_authorized" };
        if (state.state === "proof_verified") return;

        const proof = decodeOwnerProof(
          context.adapter.getHeader(PACT_OWNER_PROOF_HEADER),
        );
        if (!proof) return { abort: true, reason: "pact_owner_proof_required" };

        const result = await pipeline.verifyOwner({ requestId, presentation: proof });
        if (result.status !== "verified")
          return { abort: true, reason: "pact_owner_proof_rejected" };
        return;
      } catch {
        return { abort: true, reason: "pact_access_verifier_unavailable" };
      }
    },

    async onBeforeSettle(
      context: X402SettleContext,
    ): Promise<void | { abort: true; reason: string; message: string }> {
      const requestId = requestIdFrom(context);
      const transaction = signedTransactionFrom(context.paymentPayload);
      const resourceId = context.paymentPayload.resource?.url;
      if (!requestId || !transaction || !resourceId ||
        context.requirements.scheme !== "exact" ||
        !isConcordiumNetwork(context.requirements.network))
        return {
          abort: true,
          reason: "pact_payment_context_invalid",
          message: "Pact could not bind this payment to its access request.",
        };

      try {
        await pipeline.beginExternalSettlement({
          requestId,
          paymentPayload: {
            value: {
              sender: transaction.header!.sender!,
              signedTransaction: transaction,
            },
          },
          requirement: {
            scheme: "exact",
            network: context.requirements.network,
            amount: context.requirements.amount,
            asset: context.requirements.asset,
            payTo: context.requirements.payTo,
            resourceId,
          },
        });
        return;
      } catch {
        return {
          abort: true,
          reason: "pact_access_payment_gate_failed",
          message: "Payment does not match the verified agent access request.",
        };
      }
    },

    async onAfterSettle(context: X402SettleResultContext): Promise<void> {
      const requestId = requestIdFrom(context);
      const { result } = context;
      if (
        !requestId ||
        !result.success ||
        !result.transaction ||
        !isConcordiumNetwork(result.network) ||
        result.network !== context.requirements.network ||
        !result.payer
      ) throw new PactSettlementPersistenceError();

      try {
        await pipeline.completeExternalSettlement(requestId, {
          status: "confirmed",
          transactionReference: result.transaction,
          network: result.network,
          payerAccount: result.payer,
        });
      } catch {
        throw new PactSettlementPersistenceError();
      }
    },

    async onSettleFailure(context: X402SettleFailureContext): Promise<void> {
      const requestId = requestIdFrom(context);
      if (!requestId) return;
      // A timeout can happen after broadcast. Never mark it failed based only
      // on an exception. Keep the resource locked and require chain reconciliation.
      await pipeline.recordExternalSettlementFailure(
        requestId,
        "x402_" + context.error.name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      ).catch(() => undefined);
    },
  };
}

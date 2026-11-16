import {
  AccountAddress,
  CcdAmount,
  ConcordiumGRPCWebClient,
  Transaction,
  TransactionHash,
  buildBasicAccountSigner,
} from "@concordium/web-sdk";
import { ExactConcordiumScheme } from "@x402/concordium/exact/facilitator";

const NETWORK = "ccd:4221332d34e1694168c2a0c0b3fd0f27";
const MAX_RESOURCE_BYTES = 256 * 1024;
const FINALITY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

interface Env {
  DB: D1Database;
  PACT_ACCESS_RESOURCE_URL: string;
  PACT_ACCESS_PRICE_ATOMIC?: string;
  PACT_SELLER_PAY_TO?: string;
  PACT_RESOURCE_ADMIN_KEY?: string;
  CCD_FACILITATOR_ADDRESS?: string;
  CCD_FACILITATOR_PRIVATE_KEY?: string;
}

interface PaymentConfig {
  enabled: boolean;
  price: string;
  payTo: string;
  sponsor: string;
  privateKey: string;
}

interface FinalizedInfo {
  txHash: string;
  status: string;
  sender: string;
  recipient?: string;
  amount?: string;
  asset?: string;
}

function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...extraHeaders,
    },
  });
}

function base64EncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64DecodeUtf8(value: string): string {
  if (
    !value ||
    value.length > 96 * 1024 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error("Invalid PAYMENT-SIGNATURE header.");
  }
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function getPaymentConfig(env: Env): PaymentConfig {
  const price = env.PACT_ACCESS_PRICE_ATOMIC || "";
  const payTo = env.PACT_SELLER_PAY_TO || "";
  const sponsor = env.CCD_FACILITATOR_ADDRESS || "";
  const privateKey = env.CCD_FACILITATOR_PRIVATE_KEY || "";
  const enabled =
    /^\d+$/.test(price) &&
    BigInt(price || "0") > 0n &&
    !!payTo &&
    !!sponsor &&
    !!privateKey;
  return { enabled, price, payTo, sponsor, privateKey };
}

function isAllowedAdmin(request: Request, env: Env): boolean {
  const expected = env.PACT_RESOURCE_ADMIN_KEY;
  const authorization = request.headers.get("Authorization") || "";
  return !!expected && authorization === "Bearer " + expected;
}

function createSettlementRuntime(env: Env, requestId: string): {
  scheme: ExactConcordiumScheme;
  signer: SettlementSigner;
  config: PaymentConfig;
} {
  const config = getPaymentConfig(env);
  if (!config.enabled) {
    throw new Error("Concordium x402 facilitator is not configured.");
  }

  const sponsorAccount = AccountAddress.fromBase58(config.sponsor);
  const sponsorSigner = buildBasicAccountSigner(config.privateKey);
  const grpc = new ConcordiumGRPCWebClient(
    "https://grpc.testnet.concordium.com",
    20000,
    { timeout: 15_000 },
  );

  const signer = {
    getAddress() {
      return sponsorAccount.toString();
    },
    getNetwork() {
      return NETWORK;
    },
    async getAccountInfo(address: string) {
      return grpc.getAccountInfo(AccountAddress.fromBase58(address));
    },
    async addSponsorSignature(tx: any) {
      const signable = Transaction.signableFromJSON(tx);
      const sponsored = await Transaction.sponsor(
        signable as Parameters<typeof Transaction.sponsor>[0],
        sponsorSigner,
      );
      return Transaction.toJSON(sponsored);
    },
    async submitTransaction(signedTxJSON: any): Promise<string> {
      const signable = Transaction.signableFromJSON(signedTxJSON);
      const finalized = Transaction.finalize(signable);
      const transactionHash = await grpc.sendTransaction(finalized);
      const hash = transactionHash.toString();

      const stored = await env.DB.prepare(
        "UPDATE pact_access_requests SET payment_reference = ? " +
        "WHERE request_id = ? AND state = 'payment_pending' " +
        "AND payment_reference IS NULL",
      ).bind(hash, requestId).run();

      if (stored?.meta?.changes !== 1) {
        throw new Error(
          "PAYMENT_ALREADY_BROADCAST: Concordium accepted the transaction, but Pact could not store its hash. Do not submit another payment.",
        );
      }
      return hash;
    },
    async waitForFinalization(
      txHash: string,
      timeoutMs = FINALITY_TIMEOUT_MS,
    ): Promise<FinalizedInfo> {
      const hash = TransactionHash.fromHexString(txHash);
      const deadline = Date.now() + Math.min(timeoutMs, FINALITY_TIMEOUT_MS);

      while (Date.now() < deadline) {
        const blockStatus: any = await grpc.getBlockItemStatus(hash);
        if (blockStatus?.status === "finalized") {
          const summary = blockStatus.outcome?.summary;
          if (!summary) {
            throw new Error("Finalized Concordium transaction has no outcome summary.");
          }
          const failed = summary.transactionType === "failed";
          const transfer = summary.transfer || {};
          return {
            txHash,
            status: failed ? "failed" : "finalized",
            sender: summary.sender?.address || "",
            recipient: transfer.to?.address,
            amount: transfer.amount
              ? CcdAmount.toMicroCcd(transfer.amount).toString()
              : "0",
            asset: "CCD",
          };
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      throw new Error("Concordium transaction finalization is still pending.");
    },
    async getTokenBalance() {
      return undefined;
    },
    async getTokenDecimals() {
      throw new Error("Pact accepts native CCD only.");
    },
  };

  const scheme = new ExactConcordiumScheme({
    signer: signer as any,
    requireFinalization: true,
    finalizationTimeoutMs: FINALITY_TIMEOUT_MS,
    maxExpiryOffsetSeconds: 600,
  });

  return { scheme, signer, config };
}

function buildPaymentRequired(
  env: Env,
  mimeType: string,
  config: PaymentConfig,
) {
  return {
    x402Version: 2,
    resource: {
      url: env.PACT_ACCESS_RESOURCE_URL,
      description: "Pact proof-gated protected resource",
      mimeType,
    },
    accepts: [{
      scheme: "exact",
      network: NETWORK,
      asset: "CCD",
      amount: config.price,
      payTo: config.payTo,
      maxTimeoutSeconds: 600,
      extra: { feePayer: config.sponsor },
    }],
  };
}

async function readPaymentPayload(request: Request): Promise<any> {
  const header = request.headers.get("PAYMENT-SIGNATURE");
  if (!header) return null;
  const payload = JSON.parse(base64DecodeUtf8(header));

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("PAYMENT-SIGNATURE must contain a JSON object.");
  }
  if (payload.x402Version !== 2) {
    throw new Error("Only x402 version 2 is supported.");
  }
  return payload;
}

async function uploadResource(request: Request, env: Env): Promise<Response> {
  if (!isAllowedAdmin(request, env)) {
    return json({
      code: "RESOURCE_ADMIN_REQUIRED",
      message: "A resource administrator token is required.",
    }, 401);
  }

  let body: any;
  try {
    const raw = await request.text();
    if (raw.length > MAX_RESOURCE_BYTES + 8192) {
      throw new Error("Resource upload is too large.");
    }
    body = JSON.parse(raw);
  } catch {
    return json({
      code: "INVALID_RESOURCE",
      message: "Provide a valid JSON resource upload.",
    }, 400);
  }

  if (
    body?.resourceId !== env.PACT_ACCESS_RESOURCE_URL ||
    typeof body.content !== "string" ||
    !["application/json", "text/csv", "text/plain"].includes(body.contentType)
  ) {
    return json({
      code: "INVALID_RESOURCE",
      message: "The resource id or content type is invalid.",
    }, 400);
  }

  const contentBytes = new TextEncoder().encode(body.content);
  if (contentBytes.length === 0 || contentBytes.length > MAX_RESOURCE_BYTES) {
    return json({
      code: "INVALID_RESOURCE_SIZE",
      message: "Resource content must be between 1 byte and 256 KiB.",
    }, 413);
  }

  const digest = await sha256Hex(body.content);
  const updatedAt = new Date().toISOString();

  try {
    await env.DB.prepare(
      "INSERT INTO pact_access_resources " +
      "(resource_id, content, mime_type, sha256, updated_at) " +
      "VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(resource_id) DO UPDATE SET " +
      "content = excluded.content, mime_type = excluded.mime_type, " +
      "sha256 = excluded.sha256, updated_at = excluded.updated_at",
    ).bind(
      body.resourceId,
      body.content,
      body.contentType,
      digest,
      updatedAt,
    ).run();
  } catch {
    return json({
      code: "RESOURCE_SAVE_FAILED",
      message: "Pact could not store the protected resource.",
    }, 503);
  }

  return json({
    resourceId: body.resourceId,
    contentType: body.contentType,
    bytes: contentBytes.length,
    sha256: digest,
    updatedAt,
  }, 201);
}

async function findRequest(env: Env, requestId: string): Promise<any> {
  return env.DB.prepare(
    "SELECT request_id, resource_id, buyer_agent_id, owner_account, " +
    "payer_account, state, payment_reference, expires_at " +
    "FROM pact_access_requests WHERE request_id = ? LIMIT 1",
  ).bind(requestId).first();
}

async function readResource(env: Env): Promise<any> {
  return env.DB.prepare(
    "SELECT resource_id, content, mime_type, sha256, updated_at " +
    "FROM pact_access_resources WHERE resource_id = ? LIMIT 1",
  ).bind(env.PACT_ACCESS_RESOURCE_URL).first();
}

async function insertAudit(
  env: Env,
  requestId: string,
  state: string,
  reason: string,
  txHash: string | null,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO pact_access_audit " +
    "(request_id, state, at, reason_code, payment_reference) " +
    "VALUES (?, ?, ?, ?, ?)",
  ).bind(requestId, state, new Date().toISOString(), reason, txHash).run();
}

async function resetUnbroadcastPayment(
  env: Env,
  requestId: string,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE pact_access_requests SET state = 'proof_verified' " +
      "WHERE request_id = ? AND state = 'payment_pending' " +
      "AND payment_reference IS NULL",
    ).bind(requestId),
    env.DB.prepare(
      "INSERT INTO pact_access_audit " +
      "(request_id, state, at, reason_code) " +
      "SELECT ?, 'proof_verified', ?, ? WHERE changes() = 1",
    ).bind(requestId, now, reason),
  ]);
}

async function markPaid(
  env: Env,
  requestId: string,
  txHash: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE pact_access_requests SET state = 'paid' " +
      "WHERE request_id = ? AND state = 'payment_pending' " +
      "AND payment_reference = ?",
    ).bind(requestId, txHash),
    env.DB.prepare(
      "INSERT INTO pact_access_audit " +
      "(request_id, state, at, reason_code, payment_reference) " +
      "SELECT ?, 'paid', ?, 'concordium_x402_finalized', ? " +
      "WHERE changes() = 1",
    ).bind(requestId, now, txHash),
  ]);
  return results[0]?.meta?.changes === 1;
}

async function markBlocked(
  env: Env,
  requestId: string,
  txHash: string,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE pact_access_requests SET state = 'blocked' " +
      "WHERE request_id = ? AND state = 'payment_pending' " +
      "AND payment_reference = ?",
    ).bind(requestId, txHash),
    env.DB.prepare(
      "INSERT INTO pact_access_audit " +
      "(request_id, state, at, reason_code, payment_reference) " +
      "SELECT ?, 'blocked', ?, ?, ? WHERE changes() = 1",
    ).bind(requestId, now, reason, txHash),
  ]);
  if (results[0]?.meta?.changes !== 1) {
    const latest = await findRequest(env, requestId);
    if (latest?.state !== "blocked") {
      throw new Error("Pact could not lock an invalid finalized payment.");
    }
  }
}

async function claimDelivery(
  env: Env,
  requestId: string,
  txHash: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE pact_access_requests SET state = 'delivered', delivered_at = ? " +
      "WHERE request_id = ? AND state = 'paid' AND payment_reference = ?",
    ).bind(now, requestId, txHash),
    env.DB.prepare(
      "INSERT INTO pact_access_audit " +
      "(request_id, state, at, reason_code, payment_reference) " +
      "SELECT ?, 'delivered', ?, 'protected_resource_released', ? " +
      "WHERE changes() = 1",
    ).bind(requestId, now, txHash),
  ]);
  return results[0]?.meta?.changes === 1;
}

async function verifyPaymentMatchesRequest(
  info: FinalizedInfo,
  record: any,
  config: PaymentConfig,
): Promise<boolean> {
  return (
    info.status === "finalized" &&
    info.sender === record.payer_account &&
    info.recipient === config.payTo &&
    info.amount === config.price &&
    info.asset === "CCD"
  );
}

async function deliverResource(
  request: Request,
  env: Env,
  record: any,
  txHash: string,
  payer: string,
): Promise<Response> {
  const resource = await readResource(env);
  if (!resource) {
    return json({
      code: "PROTECTED_RESOURCE_NOT_LOADED",
      message: "Pact's protected resource has not been uploaded yet.",
    }, 503);
  }

  if (
    typeof resource.content !== "string" ||
    await sha256Hex(resource.content) !== resource.sha256
  ) {
    return json({
      code: "PROTECTED_RESOURCE_INTEGRITY_FAILED",
      message: "Pact's protected resource failed its integrity check.",
    }, 503);
  }

  const claimed = await claimDelivery(env, record.request_id, txHash);
  if (!claimed) {
    const latest = await findRequest(env, record.request_id);
    if (latest?.state !== "delivered" || latest.payment_reference !== txHash) {
      return json({
        code: "RESOURCE_DELIVERY_STATE_CONFLICT",
        message: "Pact could not confirm the already-finalized access state.",
      }, 409);
    }
    // Retry the same unguessable request id if the first response was lost.
  }

  return new Response(resource.content, {
    status: 200,
    headers: {
      "Content-Type": resource.mime_type,
      "Cache-Control": "no-store",
      "X-Content-SHA256": resource.sha256,
      "X-Pact-Request-Id": record.request_id,
      "PAYMENT-RESPONSE": base64EncodeUtf8(JSON.stringify({
        success: true,
        network: NETWORK,
        transaction: txHash,
        payer,
      })),
    },
  });
}

async function reconcilePending(
  request: Request,
  env: Env,
  record: any,
): Promise<Response> {
  if (!record.payment_reference) {
    return json({
      code: "PAYMENT_PROCESSING",
      message: "Pact has reserved this request. Do not submit a second payment.",
    }, 202);
  }

  try {
    const runtime = createSettlementRuntime(env, record.request_id);
    const info = await runtime.signer.waitForFinalization(
      record.payment_reference,
      FINALITY_TIMEOUT_MS,
    );

    if (!await verifyPaymentMatchesRequest(info, record, runtime.config)) {
      await markBlocked(
        env,
        record.request_id,
        record.payment_reference,
        info.status === "failed"
          ? "concordium_transaction_failed"
          : "concordium_finality_mismatch",
      );
      return json({
        code: "PAYMENT_FINALITY_MISMATCH",
        message: "The finalized transaction failed or did not match the registered agent wallet and Pact's price. This request is blocked.",
      }, 403);
    }

    await markPaid(env, record.request_id, record.payment_reference);
    return deliverResource(
      request,
      env,
      record,
      record.payment_reference,
      record.payer_account,
    );
  } catch {
    return json({
      code: "PAYMENT_PENDING",
      message: "Pact has not confirmed finalization yet. Retry this same request id. Do not send a second payment.",
    }, 202);
  }
}

async function ensureCurrentRegistryBinding(
  env: Env,
  record: any,
): Promise<Response | null> {
  const registryUrl =
    "https://pact-access.vercel.app/api/access/registry/" +
    encodeURIComponent(record.buyer_agent_id);

  let response: Response;
  try {
    response = await fetch(registryUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return json({
      code: "REGISTRY_UNAVAILABLE",
      message: "Pact could not refresh the current CIS-8004 owner and agentWallet. No payment was started. Retry this same request id.",
    }, 503);
  }

  if (response.status === 503 || response.status >= 500) {
    return json({
      code: "REGISTRY_UNAVAILABLE",
      message: "Concordium Agent Registry is temporarily unavailable. No payment was started. Retry this same request id.",
    }, 503);
  }

  let binding: any;
  try {
    binding = await response.json();
  } catch {
    return json({
      code: "REGISTRY_RESPONSE_INVALID",
      message: "Pact could not parse the current Agent Registry response. No payment was started.",
    }, 503);
  }

  const matches =
    response.status === 200 &&
    binding?.status === "verified" &&
    binding?.tokenAddress === record.buyer_agent_id &&
    binding?.network === NETWORK &&
    binding?.ownerAccount === record.owner_account &&
    binding?.payerAccount === record.payer_account;

  if (matches) return null;

  const now = new Date().toISOString();
  try {
    const result = await env.DB.batch([
      env.DB.prepare(
        "UPDATE pact_access_requests SET state = 'blocked' " +
        "WHERE request_id = ? AND state = 'proof_verified' " +
        "AND payment_reference IS NULL",
      ).bind(record.request_id),
      env.DB.prepare(
        "INSERT INTO pact_access_audit " +
        "(request_id, state, at, reason_code, payment_reference) " +
        "SELECT ?, 'blocked', ?, 'registry_binding_changed', NULL " +
        "WHERE changes() = 1",
      ).bind(record.request_id, now),
    ]);

    if (result[0]?.meta?.changes !== 1) {
      return json({
        code: "REGISTRY_BINDING_STATE_CONFLICT",
        message: "Pact could not safely lock the access request after a registry change.",
      }, 409);
    }
  } catch {
    return json({
      code: "REGISTRY_AUDIT_FAILED",
      message: "Pact could not record the changed registry binding. No payment was started.",
    }, 503);
  }

  return json({
    code: "REGISTRY_BINDING_CHANGED",
    message: "The CIS-8004 owner or agentWallet changed after the challenge. This request is blocked. Start again with the current registry binding.",
  }, 403);
}

async function handleResource(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return json({
      code: "METHOD_NOT_ALLOWED",
      message: "Use GET to request this resource.",
    }, 405);
  }

  const requestId = request.headers.get("X-PACT-ACCESS-REQUEST") || "";

  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    return json({
      code: "OWNER_PROOF_REQUIRED",
      message: "A verified Pact owner proof request id is required.",
    }, 403);
  }

  const record = await findRequest(env, requestId);
  if (!record || record.resource_id !== env.PACT_ACCESS_RESOURCE_URL) {
    return json({
      code: "ACCESS_REQUEST_NOT_FOUND",
      message: "Pact access request was not found.",
    }, 404);
  }

  // The 12-minute access window gates the start of a payment only.
  // Once a payment is pending, paid, or delivered, a late retry must still
  // be allowed to reconcile the same transaction and recover the resource.
  if (record.state === "proof_verified") {
    const requestExpiresAt = Date.parse(record.expires_at);
    if (!Number.isFinite(requestExpiresAt) || requestExpiresAt <= Date.now()) {
      return json({
        code: "ACCESS_REQUEST_EXPIRED",
        message: "The proof-gated access window expired before payment. Request fresh owner authorization.",
      }, 410);
    }
  }

  if (record.state === "delivered") {
    if (!record.payment_reference) {
      return json({
        code: "PAYMENT_REFERENCE_MISSING",
        message: "Pact cannot confirm the payment reference for this request.",
      }, 503);
    }
    return deliverResource(
      request,
      env,
      record,
      record.payment_reference,
      record.payer_account,
    );
  }

  if (record.state === "payment_pending") {
    return reconcilePending(request, env, record);
  }

  if (record.state === "paid") {
    if (!record.payment_reference) {
      return json({
        code: "PAYMENT_REFERENCE_MISSING",
        message: "Pact cannot verify this payment reference.",
      }, 503);
    }
    return deliverResource(
      request,
      env,
      record,
      record.payment_reference,
      record.payer_account,
    );
  }

  if (record.state !== "proof_verified") {
    return json({
      code: "OWNER_PROOF_REQUIRED",
      message: "The owner proof has not been verified for this request.",
    }, 403);
  }

  const registryBeforePayment = await ensureCurrentRegistryBinding(env, record);
  if (registryBeforePayment) return registryBeforePayment;

  const config = getPaymentConfig(env);
  if (!config.enabled) {
    return json({
      code: "PAYMENT_RUNTIME_NOT_CONFIGURED",
      message: "Pact's Concordium x402 sponsor, seller payout account or price is not configured.",
    }, 503);
  }

  const resource = await readResource(env);
  if (!resource) {
    return json({
      code: "PROTECTED_RESOURCE_NOT_LOADED",
      message: "Pact's protected resource has not been uploaded yet.",
    }, 503);
  }

  let payload: any;
  try {
    payload = await readPaymentPayload(request);
  } catch {
    return json({
      code: "INVALID_PAYMENT_SIGNATURE",
      message: "The x402 payment signature header is invalid.",
    }, 400);
  }

  if (!payload) {
    const required = buildPaymentRequired(env, resource.mime_type, config);
    return json(required, 402, {
      "PAYMENT-REQUIRED": base64EncodeUtf8(JSON.stringify(required)),
    });
  }

  const transaction = payload?.payload?.signedTransaction;
  const sender = transaction?.header?.sender;
  if (sender !== record.payer_account) {
    return json({
      code: "PAYER_AGENT_WALLET_MISMATCH",
      message: "The x402 sender does not match the Concordium Agent Registry agentWallet.",
    }, 403);
  }

  const requirements = buildPaymentRequired(env, resource.mime_type, config).accepts[0];
  const accepted = payload.accepted;
  if (
    accepted?.scheme !== requirements.scheme ||
    accepted?.network !== requirements.network ||
    accepted?.asset !== requirements.asset ||
    accepted?.amount !== requirements.amount ||
    accepted?.payTo !== requirements.payTo ||
    accepted?.extra?.feePayer !== requirements.extra.feePayer
  ) {
    return json({
      code: "PAYMENT_REQUIREMENTS_MISMATCH",
      message: "The signed payment requirements do not match Pact's current price and payee.",
    }, 402);
  }

  const registryBeforeSettlement = await ensureCurrentRegistryBinding(env, record);
  if (registryBeforeSettlement) return registryBeforeSettlement;

  let runtime;
  try {
    runtime = createSettlementRuntime(env, requestId);
  } catch {
    return json({
      code: "FACILITATOR_NOT_READY",
      message: "The Concordium sponsor account or signing key is invalid or unavailable.",
    }, 503);
  }

  const reserved = await env.DB.prepare(
    "UPDATE pact_access_requests SET state = 'payment_pending' " +
    "WHERE request_id = ? AND state = 'proof_verified' " +
    "AND payment_reference IS NULL",
  ).bind(requestId).run();

  if (reserved?.meta?.changes !== 1) {
    return json({
      code: "PAYMENT_ALREADY_PROCESSING",
      message: "This owner-approved request already has a payment attempt in progress.",
    }, 409);
  }

  try {
    await insertAudit(
      env,
      requestId,
      "payment_pending",
      "x402_concordium_verification",
      null,
    );
  } catch {
    await resetUnbroadcastPayment(env, requestId, "payment_audit_initialization_failed");
    return json({
      code: "PAYMENT_AUDIT_FAILED",
      message: "Pact could not initialize the payment audit record.",
    }, 503);
  }

  try {
    const settled: any = await runtime.scheme.settle(payload, requirements as any);

    if (!settled.success) {
      if (
        settled.transaction ||
        String(settled.errorReason || "").startsWith("submission_failed")
      ) {
        return json({
          code: "PAYMENT_PENDING",
          message: settled.transaction
            ? "The transaction was submitted. Pact is waiting for finalization. Retry the same request id and do not submit a second payment."
            : "The submission result is uncertain. Pact has locked this request to prevent a duplicate payment. Do not submit another payment. Manual transaction reconciliation is required.",
          ...(settled.transaction ? { transaction: settled.transaction } : {}),
        }, 202, {
          "PAYMENT-RESPONSE": base64EncodeUtf8(JSON.stringify(settled)),
        });
      }

      await resetUnbroadcastPayment(
        env,
        requestId,
        settled.errorReason || "x402_settlement_rejected",
      );
      return json({
        code: "PAYMENT_REJECTED",
        message: settled.errorMessage || "Concordium x402 payment was rejected.",
        reason: settled.errorReason,
      }, 402, {
        "PAYMENT-RESPONSE": base64EncodeUtf8(JSON.stringify(settled)),
      });
    }

    if (settled.payer !== record.payer_account || !settled.transaction) {
      return json({
        code: "PAYMENT_RESULT_MISMATCH",
        message: "The finalized payment does not match the registered agent wallet.",
      }, 503);
    }

    const updated = await markPaid(env, requestId, settled.transaction);
    if (!updated) {
      const latest = await findRequest(env, requestId);
      if (latest?.state !== "paid") {
        return json({
          code: "PAYMENT_RECORDING_FAILED",
          message: "Concordium finalized payment but Pact could not update the access state.",
        }, 503);
      }
    }

    return deliverResource(
      request,
      env,
      { ...record, state: "paid" },
      settled.transaction,
      settled.payer,
    );
  } catch {
    const latest = await findRequest(env, requestId);
    return json({
      code: "PAYMENT_OUTCOME_UNKNOWN",
      message: latest?.payment_reference
        ? "Pact has a transaction reference and is reconciling finality. Retry this same request id. Do not submit a second payment."
        : "Pact could not prove that the transaction was not broadcast. This request remains locked to prevent a duplicate payment. Manual reconciliation is required.",
      ...(latest?.payment_reference ? { transaction: latest.payment_reference } : {}),
    }, 202);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/access/resource") {
      return handleResource(request, env);
    }

    if (url.pathname === "/api/access/resources" && request.method === "PUT") {
      return uploadResource(request, env);
    }

    if (url.pathname === "/api/access/payment-health" && request.method === "GET") {
      const config = getPaymentConfig(env);
      return json({
        runtime: "cloudflare-workers-free",
        database: "d1",
        x402: "2.31.0",
        network: NETWORK,
        scheme: "exact",
        asset: "CCD",
        facilitatorConfigured: config.enabled,
        priceConfigured: !!config.price,
        sellerPayoutConfigured: !!config.payTo,
        sponsorConfigured: !!config.sponsor && !!config.privateKey,
        resourceAdminConfigured: !!env.PACT_RESOURCE_ADMIN_KEY,
        resourceLimitBytes: MAX_RESOURCE_BYTES,
        payments: config.enabled ? "configured" : "disabled_until_testnet_configuration",
      });
    }

    return json({
      code: "NOT_FOUND",
      message: "Pact facilitator route not found.",
    }, 404);
  },
};

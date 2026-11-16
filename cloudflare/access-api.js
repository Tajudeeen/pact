const NETWORK = "ccd:4221332d34e1694168c2a0c0b3fd0f27";
const POLICY_ID = "owner-account-signature-v1";
const POLICY_DESCRIPTION =
  "The active CIS-8004 owner account authorizes this exact agent resource request.";
const MCP_URL = "https://agent-registry-mcp.concordium.com/mcp";
const MCP_REST = "https://agent-registry-mcp.concordium.com";

function json(data, status = 200, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function parseMcp(raw) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Empty registry response.");
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const messages = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (!messages.length) throw new Error("Unsupported registry response.");
  return JSON.parse(messages[messages.length - 1]);
}

async function mcpCall(method, params, sessionId) {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      ...(params === undefined ? {} : { params }),
    }),
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error("Registry service unavailable.");
  const nextSession = response.headers.get("mcp-session-id") || sessionId || null;
  const body = parseMcp(await response.text());
  if (body.error) throw new Error("Registry lookup failed.");
  return { body, sessionId: nextSession };
}

async function resolveAgent(tokenAddress) {
  const initialized = await mcpCall("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "pact-access-worker", version: "0.1.0" },
  });
  await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
      ...(initialized.sessionId
        ? { "Mcp-Session-Id": initialized.sessionId }
        : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
    signal: AbortSignal.timeout(9000),
  });

  const called = await mcpCall(
    "tools/call",
    {
      name: "agent_by_token_address",
      arguments: { token_address: tokenAddress, network: "testnet" },
    },
    initialized.sessionId,
  );
  const result = called.body.result;
  if (!result || result.isError) throw new Error("Agent registry lookup failed.");
  if (result.structuredContent && typeof result.structuredContent === "object")
    return result.structuredContent;
  const text = result.content?.find((part) => part.type === "text")?.text;
  if (!text) throw new Error("Registry returned no agent record.");
  return JSON.parse(text);
}

function base58Bytes(value) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Invalid token address.");
    number = number * 58n + BigInt(digit);
  }
  let hex = number.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const decoded = [];
  for (let i = 0; i < hex.length; i += 2)
    decoded.push(parseInt(hex.slice(i, i + 2), 16));
  let leading = 0;
  while (leading < value.length && value[leading] === "1") leading++;
  return new Uint8Array([
    ...new Array(leading).fill(0),
    ...decoded,
  ]);
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function readUleb(bytes, state) {
  let value = 0n;
  let shift = 0n;
  while (state.offset < bytes.length) {
    const byte = bytes[state.offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value.toString();
    shift += 7n;
    if (shift > 63n) break;
  }
  throw new Error("Malformed token address.");
}

async function tokenContractAddress(tokenAddress) {
  const bytes = base58Bytes(tokenAddress);
  if (bytes.length < 10) throw new Error("Malformed token address.");
  const payload = bytes.slice(0, -4);
  const checksum = bytes.slice(-4);
  const first = await sha256(payload);
  const second = await sha256(first);
  if (checksum.some((byte, index) => byte !== second[index]))
    throw new Error("Invalid token checksum.");

  const state = { offset: 0 };
  if (payload[state.offset++] !== 2)
    throw new Error("Unsupported CIS-2 token address.");
  const index = await readUleb(payload, state);
  const subindex = await readUleb(payload, state);
  if (state.offset >= payload.length)
    throw new Error("Token address has no token identifier.");
  return { index, subindex };
}

async function verifyBadge(tokenAddress, env) {
  const contract = await tokenContractAddress(tokenAddress);
  if (
    !env.CONCORDIUM_AGENT_REGISTRY_INDEX ||
    !env.CONCORDIUM_AGENT_REGISTRY_SUBINDEX
  )
    throw new Error("Trusted testnet registry contract is not configured.");

  if (
    contract.index !== String(env.CONCORDIUM_AGENT_REGISTRY_INDEX) ||
    contract.subindex !== String(env.CONCORDIUM_AGENT_REGISTRY_SUBINDEX)
  )
    throw new Error("Agent badge is outside the configured trusted registry.");

  const [badgeResponse, cardResponse, agent] = await Promise.all([
    fetch(
      `${MCP_REST}/v1/check-badge/${encodeURIComponent(tokenAddress)}?network=testnet`,
      { signal: AbortSignal.timeout(9000) },
    ),
    fetch(
      `${MCP_REST}/v1/verify-agent-card/${encodeURIComponent(tokenAddress)}?network=testnet`,
      { signal: AbortSignal.timeout(9000) },
    ),
    resolveAgent(tokenAddress),
  ]);
  if (!badgeResponse.ok || !cardResponse.ok)
    throw new Error("Concordium badge verification is unavailable.");

  const [badgeCheck, cardCheck] = await Promise.all([
    badgeResponse.json(),
    cardResponse.json(),
  ]);
  const checks = badgeCheck.checks || {};
  const hardErrors = Array.isArray(badgeCheck.issues)
    ? badgeCheck.issues.filter((issue) => issue?.severity === "error")
    : [];
  if (
    badgeCheck.badge_valid !== true ||
    badgeCheck.network !== "testnet" ||
    checks.on_chain_agent_found !== true ||
    checks.status_active !== true ||
    checks.has_agent_uri !== true ||
    checks.card_fetched !== true ||
    checks.hash_matches_on_chain !== true ||
    checks.badge_present !== true ||
    checks.badge_well_formed !== true ||
    checks.token_address_matches !== true ||
    checks.owner_matches !== true ||
    checks.chain_matches !== true ||
    checks.contracts_match !== true ||
    hardErrors.length !== 0 ||
    cardCheck.match !== true ||
    cardCheck.network !== "testnet"
  )
    throw new Error("The Concordium badge, active registry record, or Agent Card hash did not pass verification.");

  const owner =
    typeof agent.owner_account === "string"
      ? agent.owner_account
      : typeof agent.ownerAccount === "string"
        ? agent.ownerAccount
        : "";
  const wallet =
    typeof agent.agent_wallet === "string"
      ? agent.agent_wallet
      : typeof agent.agentWallet === "string"
        ? agent.agentWallet
        : "";
  if (
    agent.token_address !== tokenAddress ||
    agent.network !== "testnet" ||
    agent.status !== "Active" ||
    owner !== badgeCheck.on_chain?.owner_account ||
    !/^[1-9A-HJ-NP-Za-km-z]{45,55}$/.test(owner) ||
    !/^[1-9A-HJ-NP-Za-km-z]{45,55}$/.test(wallet)
  )
    throw new Error("The registered agent is inactive or missing an owner/payment wallet.");

  return { owner, wallet };
}

function accessMessage(context) {
  return JSON.stringify({
    domain: "pact-access",
    version: 1,
    network: context.network,
    requestId: context.requestId,
    sellerId: context.sellerId,
    resourceId: context.resourceId,
    buyerAgentId: context.buyerAgentId,
    ownerAccount: context.ownerAccount,
    payerAccount: context.payerAccount,
    challenge: context.challenge,
    expiresAt: context.expiresAt,
    policyId: POLICY_ID,
  });
}

async function issueChallenge(request, env, origin) {
  if (origin !== env.PACT_ORIGIN)
    return json({
      code: "ORIGIN_REJECTED",
      message: "Request origin is not allowed.",
      diagnostic: {
        receivedOrigin: origin || null,
        receivedReferer: request.headers.get("referer"),
        receivedHost: new URL(request.url).host,
        expectedOrigin: env.PACT_ORIGIN,
      },
    }, 403, origin);

  if (!env.DB || !env.PACT_ACCESS_SELLER_ID || !env.PACT_ACCESS_RESOURCE_URL)
    return json({ code: "BACKEND_NOT_CONFIGURED", message: "Pact Access configuration is incomplete." }, 503, origin);

  const resource = new URL(env.PACT_ACCESS_RESOURCE_URL);
  if (
    resource.protocol !== "https:" ||
    resource.pathname !== "/api/access/resource" ||
    resource.search ||
    resource.hash
  )
    return json({ code: "RESOURCE_CONFIG_INVALID", message: "The protected resource URL is invalid." }, 503, origin);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 2048) throw new Error("Request too large.");
    body = JSON.parse(raw);
  } catch {
    return json({ code: "INVALID_INPUT", message: "A valid JSON request is required." }, 400, origin);
  }

  const buyerAgentId = body?.buyerAgentId;
  if (
    typeof buyerAgentId !== "string" ||
    !/^[1-9A-HJ-NP-Za-km-z]{20,80}$/.test(buyerAgentId)
  )
    return json({ code: "INVALID_AGENT_ID", message: "A valid CIS-8004 buyer agent ID is required." }, 400, origin);

  let agent;
  try {
    agent = await verifyBadge(buyerAgentId, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent verification failed.";
    const status = message.includes("not configured") ? 503 : 403;
    return json(
      {
        code: status === 503 ? "REGISTRY_NOT_CONFIGURED" : "AGENT_NOT_VERIFIED",
        message,
      },
      status,
      origin,
    );
  }

  const requestId = crypto.randomUUID();
  const challengeBytes = new Uint8Array(32);
  crypto.getRandomValues(challengeBytes);
  const challenge = Array.from(challengeBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 90_000).toISOString();
  const context = {
    requestId,
    sellerId: env.PACT_ACCESS_SELLER_ID,
    resourceId: env.PACT_ACCESS_RESOURCE_URL,
    buyerAgentId,
    ownerAccount: agent.owner,
    payerAccount: agent.wallet,
    network: NETWORK,
    challenge,
    expiresAt,
  };
  const message = accessMessage(context);

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO pact_access_requests
          (request_id, seller_id, resource_id, buyer_agent_id, owner_account,
           payer_account, network, challenge, policy_id, message, expires_at,
           state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proof_required', ?)`,
      ).bind(
        context.requestId,
        context.sellerId,
        context.resourceId,
        context.buyerAgentId,
        context.ownerAccount,
        context.payerAccount,
        context.network,
        context.challenge,
        POLICY_ID,
        message,
        context.expiresAt,
        issuedAt.toISOString(),
      ),
      env.DB.prepare(
        `INSERT INTO pact_access_audit
          (request_id, state, at, registry_reference)
         VALUES (?, 'proof_required', ?, ?)`,
      ).bind(context.requestId, issuedAt.toISOString(), buyerAgentId),
    ]);
  } catch {
    return json({ code: "PERSISTENCE_FAILED", message: "Pact could not persist the access challenge." }, 503, origin);
  }

  return json({
    requestId,
    challenge,
    expiresAt,
    policyId: POLICY_ID,
    message,
  }, 201, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      if (origin !== env.PACT_ORIGIN)
        return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        },
      });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        return json({
          status: "ok",
          storage: "ready",
          runtime: "cloudflare-workers-free",
          database: "d1",
          challengeIssuance: "configured",
          ownerSignatureVerification: "not-configured",
          payments: "disabled",
          resourceDelivery: "disabled",
        });
      } catch {
        return json({ status: "error", storage: "unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/access/challenges" && request.method === "POST")
      return issueChallenge(request, env, origin);

    if (url.pathname === "/api/access/resource")
      return json({
        code: "PAYMENT_RUNTIME_NOT_CONFIGURED",
        message: "No resource is released until Concordium proof verification and finalized x402 settlement are enabled.",
      }, 503, origin);

    if (url.pathname.startsWith("/api/"))
      return json({ code: "NOT_FOUND", message: "API route not found." }, 404, origin);
    return new Response("Not found", { status: 404 });
  },
};

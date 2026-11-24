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

export function isAllowedBrowserRequest(
  request,
  expectedOrigin,
  additionalOrigins = "",
) {
  // Preview support is an explicit exact-origin allowlist. Never accept
  // arbitrary *.vercel.app hosts or trust a Referer when Origin is present.
  const allowed = new Set();
  for (const value of [expectedOrigin, ...String(additionalOrigins).split(",")]) {
    if (!value.trim()) continue;
    try {
      const parsed = new URL(value.trim());
      if (parsed.protocol === "https:") allowed.add(parsed.origin);
    } catch {
      // Invalid configured origins are ignored and fail closed.
    }
  }

  const origin = request.headers.get("Origin");
  if (origin) return allowed.has(origin);

  // Vercel rewrites may omit Origin but retain Referer. Accept only an exact
  // production or explicitly configured preview origin.
  const referer = request.headers.get("Referer");
  if (!referer) return false;
  try {
    return allowed.has(new URL(referer).origin);
  } catch {
    return false;
  }
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


function concatBytes(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function decodeAccountAddress(value) {
  const bytes = base58Bytes(value);
  if (bytes.length !== 37 || bytes[0] !== 1)
    throw new Error("Invalid Concordium account address.");
  const payload = bytes.slice(0, 33);
  const checksum = bytes.slice(33);
  return sha256(payload).then(sha256).then((digest) => {
    if (checksum.some((byte, index) => byte !== digest[index]))
      throw new Error("Invalid Concordium account checksum.");
    return payload.slice(1);
  });
}

function readVarint(bytes, cursor) {
  let value = 0n;
  let shift = 0n;
  while (cursor.offset < bytes.length && shift <= 63n) {
    const byte = bytes[cursor.offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7n;
  }
  throw new Error("Malformed Concordium protobuf varint.");
}

function readProtoFields(bytes) {
  const fields = new Map();
  const cursor = { offset: 0 };
  while (cursor.offset < bytes.length) {
    const tag = Number(readVarint(bytes, cursor));
    const fieldNumber = tag >>> 3;
    const wireType = tag & 7;
    if (!fieldNumber) throw new Error("Malformed Concordium protobuf tag.");
    let value;
    if (wireType === 0) {
      value = readVarint(bytes, cursor);
    } else if (wireType === 1) {
      if (cursor.offset + 8 > bytes.length) throw new Error("Truncated protobuf fixed64.");
      value = bytes.slice(cursor.offset, cursor.offset + 8);
      cursor.offset += 8;
    } else if (wireType === 2) {
      const length = Number(readVarint(bytes, cursor));
      if (!Number.isSafeInteger(length) || length < 0 || cursor.offset + length > bytes.length)
        throw new Error("Invalid Concordium protobuf field length.");
      value = bytes.slice(cursor.offset, cursor.offset + length);
      cursor.offset += length;
    } else if (wireType === 5) {
      if (cursor.offset + 4 > bytes.length) throw new Error("Truncated protobuf fixed32.");
      value = bytes.slice(cursor.offset, cursor.offset + 4);
      cursor.offset += 4;
    } else {
      throw new Error("Unsupported Concordium protobuf wire type.");
    }
    const entries = fields.get(fieldNumber) || [];
    entries.push({ wireType, value });
    fields.set(fieldNumber, entries);
  }
  return fields;
}

function firstProtoField(fields, fieldNumber, wireType) {
  return (fields.get(fieldNumber) || []).find((entry) => entry.wireType === wireType)?.value;
}

function allProtoFields(fields, fieldNumber, wireType) {
  return (fields.get(fieldNumber) || [])
    .filter((entry) => entry.wireType === wireType)
    .map((entry) => entry.value);
}

function parsePositiveProtoInteger(message, fieldNumber, label) {
  const field = firstProtoField(readProtoFields(message), fieldNumber, 0);
  if (typeof field !== "bigint" || field < 1n || field > 0xffffffffn)
    throw new Error("Concordium account response is missing " + label + ".");
  return Number(field);
}

function parseAccountInfoForProof(message, expectedAddressBytes) {
  const account = readProtoFields(message);
  const addressMessage = firstProtoField(account, 10, 2);
  if (!addressMessage) throw new Error("Concordium account response has no address.");
  const addressBytes = firstProtoField(readProtoFields(addressMessage), 1, 2);
  if (!addressBytes || addressBytes.length !== 32 ||
      addressBytes.some((byte, index) => byte !== expectedAddressBytes[index]))
    throw new Error("Concordium returned a different account address.");

  const accountThresholdMessage = firstProtoField(account, 5, 2);
  if (!accountThresholdMessage)
    throw new Error("Concordium account response has no account signature threshold.");
  const accountThreshold = parsePositiveProtoInteger(
    accountThresholdMessage,
    1,
    "account threshold",
  );

  const credentials = new Map();
  for (const entryBytes of allProtoFields(account, 4, 2)) {
    const entry = readProtoFields(entryBytes);
    const credentialIndexValue = firstProtoField(entry, 1, 0) ?? 0n;
    if (credentialIndexValue < 0n || credentialIndexValue > 0xffffffffn)
      throw new Error("Invalid Concordium credential index.");
    const credentialIndex = Number(credentialIndexValue);
    const credentialBytes = firstProtoField(entry, 2, 2);
    if (!credentialBytes) throw new Error("Concordium account credential is missing.");
    const credential = readProtoFields(credentialBytes);
    const credentialVariant = (credential.get(1) || []).concat(credential.get(2) || [])
      .find((field) => field.wireType === 2);
    if (!credentialVariant) throw new Error("Unsupported Concordium account credential.");
    const credentialValues = readProtoFields(credentialVariant.value);
    const publicKeysBytes = firstProtoField(credentialValues, 1, 2);
    if (!publicKeysBytes) throw new Error("Credential has no public signing keys.");
    const publicKeys = readProtoFields(publicKeysBytes);
    const keyThresholdMessage = firstProtoField(publicKeys, 2, 2);
    if (!keyThresholdMessage)
      throw new Error("Credential has no key signature threshold.");
    const keyThreshold = parsePositiveProtoInteger(
      keyThresholdMessage,
      1,
      "credential key threshold",
    );
    const keys = new Map();
    for (const keyEntryBytes of allProtoFields(publicKeys, 1, 2)) {
      const keyEntry = readProtoFields(keyEntryBytes);
      const keyIndexValue = firstProtoField(keyEntry, 1, 0) ?? 0n;
      if (keyIndexValue < 0n || keyIndexValue > 0xffffffffn)
        throw new Error("Invalid Concordium credential key index.");
      const keyValueBytes = firstProtoField(keyEntry, 2, 2);
      if (!keyValueBytes) throw new Error("Credential signing key is missing.");
      const keyValue = readProtoFields(keyValueBytes);
      const ed25519Key = firstProtoField(keyValue, 1, 2);
      if (!ed25519Key || ed25519Key.length !== 32)
        throw new Error("Unsupported Concordium credential key type.");
      keys.set(Number(keyIndexValue), ed25519Key);
    }
    if (!keys.size || keyThreshold > keys.size)
      throw new Error("Concordium credential key threshold is inconsistent.");
    credentials.set(credentialIndex, { threshold: keyThreshold, keys });
  }
  if (!credentials.size || accountThreshold > credentials.size)
    throw new Error("Concordium account credential threshold is inconsistent.");
  return { accountAddress: addressBytes, accountThreshold, credentials };
}

function encodeLengthDelimitedField(fieldNumber, value) {
  const prefix = [];
  let length = BigInt(value.length);
  while (length > 127n) {
    prefix.push(Number(length & 0x7fn) | 0x80);
    length >>= 7n;
  }
  prefix.push(Number(length));
  return concatBytes(new Uint8Array([(fieldNumber << 3) | 2]), new Uint8Array(prefix), value);
}

async function fetchConcordiumAccountInfo(account) {
  const addressBytes = await decodeAccountAddress(account);
  // AccountInfoRequest { block_hash: { last_final: {} }, account_identifier: { address: { value: addressBytes } } }
  const lastFinalBlock = new Uint8Array([18, 0]);
  const accountAddressMessage = encodeLengthDelimitedField(1, addressBytes);
  const accountIdentifier = encodeLengthDelimitedField(1, accountAddressMessage);
  const requestMessage = concatBytes(
    encodeLengthDelimitedField(1, lastFinalBlock),
    encodeLengthDelimitedField(2, accountIdentifier),
  );
  const frame = new Uint8Array(5 + requestMessage.length);
  frame[0] = 0;
  new DataView(frame.buffer).setUint32(1, requestMessage.length, false);
  frame.set(requestMessage, 5);

  const response = await fetch(
    "https://grpc.testnet.concordium.com:20000/concordium.v2.Queries/GetAccountInfo",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/grpc-web+proto",
        Accept: "application/grpc-web+proto",
        "X-Grpc-Web": "1",
        "X-User-Agent": "grpc-web-javascript/0.1",
      },
      body: frame,
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error("Concordium account service is unavailable.");
  const raw = new Uint8Array(await response.arrayBuffer());
  const messages = [];
  let trailerStatus = null;
  let offset = 0;
  while (offset + 5 <= raw.length) {
    const flag = raw[offset];
    const length = new DataView(raw.buffer, raw.byteOffset + offset + 1, 4)
      .getUint32(0, false);
    if (offset + 5 + length > raw.length)
      throw new Error("Concordium returned a truncated account response.");
    const payload = raw.slice(offset + 5, offset + 5 + length);
    if (flag === 0) messages.push(payload);
    else if ((flag & 0x80) === 0x80) {
      const trailers = new TextDecoder().decode(payload);
      const match = trailers.match(/(?:^|\r?\n)grpc-status:\s*(\d+)/i);
      if (match) trailerStatus = match[1];
    } else {
      throw new Error("Concordium returned an unsupported gRPC-Web frame.");
    }
    offset += 5 + length;
  }
  const grpcStatus = response.headers.get("grpc-status") || trailerStatus;
  if (grpcStatus !== "0" || messages.length !== 1)
    throw new Error("Concordium account lookup failed with gRPC status " + (grpcStatus || "missing") + ".");
  return parseAccountInfoForProof(messages[0], addressBytes);
}

function decodeOwnerProof(value) {
  if (typeof value !== "string" || !value || value.length > 16_384 ||
      !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("A valid owner proof is required.");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      typeof parsed.account !== "string" || !parsed.signature ||
      typeof parsed.signature !== "object" || Array.isArray(parsed.signature))
    throw new Error("The owner proof format is invalid.");
  return { account: parsed.account, signature: parsed.signature };
}

function hexBytes(value, expectedLength) {
  if (typeof value !== "string" || value.length !== expectedLength * 2 ||
      !/^[0-9a-f]+$/i.test(value))
    throw new Error("Concordium signature encoding is invalid.");
  const bytes = new Uint8Array(expectedLength);
  for (let index = 0; index < expectedLength; index++)
    bytes[index] = parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

async function verifyConcordiumMessageSignature(message, account, signature, accountInfo) {
  const credentialSignatures = Object.entries(signature);
  if (credentialSignatures.length < accountInfo.accountThreshold)
    return false;

  const addressBytes = await decodeAccountAddress(account);
  const messageDigest = await sha256(concatBytes(
    addressBytes,
    new Uint8Array(8),
    new TextEncoder().encode(message),
  ));

  for (const [credentialIndexText, keySignatures] of credentialSignatures) {
    if (!/^(0|[1-9]\d*)$/.test(credentialIndexText) ||
        !keySignatures || typeof keySignatures !== "object" || Array.isArray(keySignatures))
      return false;
    const credentialIndex = Number(credentialIndexText);
    const credential = accountInfo.credentials.get(credentialIndex);
    if (!credential) return false;
    const signedKeys = Object.entries(keySignatures);
    if (signedKeys.length < credential.threshold) return false;

    for (const [keyIndexText, signatureHex] of signedKeys) {
      if (!/^(0|[1-9]\d*)$/.test(keyIndexText)) return false;
      const publicKeyBytes = credential.keys.get(Number(keyIndexText));
      if (!publicKeyBytes) return false;
      const signatureBytes = hexBytes(signatureHex, 64);
      const publicKey = await crypto.subtle.importKey(
        "raw",
        publicKeyBytes,
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      if (!await crypto.subtle.verify(
        { name: "Ed25519" },
        publicKey,
        signatureBytes,
        messageDigest,
      )) return false;
    }
  }
  return true;
}

async function rejectOwnerProof(env, requestId, reason, origin, status = 401) {
  const at = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE pact_access_requests
         SET state = 'blocked', challenge_consumed_at = ?
         WHERE request_id = ? AND state = 'proof_required'
           AND challenge_consumed_at IS NULL`,
      ).bind(at, requestId),
      env.DB.prepare(
        `INSERT INTO pact_access_audit (request_id, state, at, reason_code)
         SELECT ?, 'blocked', ?, ? WHERE changes() = 1`,
      ).bind(requestId, at, reason),
    ]);
  } catch {
    return json({ code: "PROOF_STATE_UPDATE_FAILED", message: "Pact could not record the denied proof." }, 503, origin);
  }
  return json({ code: "OWNER_PROOF_REJECTED", message: "The Concordium owner signature was rejected. Request a fresh challenge." }, status, origin);
}

async function verifyOwnerProof(request, env, origin) {
  if (!isAllowedBrowserRequest(request, env.PACT_ORIGIN, env.PACT_PREVIEW_ORIGINS))
    return json({ code: "ORIGIN_REJECTED", message: "Request origin is not allowed." }, 403, origin);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 20_000) throw new Error("Request too large.");
    body = JSON.parse(raw);
  } catch {
    return json({ code: "INVALID_INPUT", message: "A valid owner proof request is required." }, 400, origin);
  }
  if (typeof body?.requestId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.requestId) ||
      typeof body?.proof !== "string")
    return json({ code: "INVALID_INPUT", message: "A request ID and owner proof are required." }, 400, origin);

  const row = await env.DB.prepare(
    "SELECT request_id, buyer_agent_id, owner_account, payer_account, message, expires_at, state, challenge_consumed_at FROM pact_access_requests WHERE request_id = ? LIMIT 1",
  ).bind(body.requestId).first();
  if (!row)
    return json({ code: "ACCESS_REQUEST_NOT_FOUND", message: "Pact access request was not found." }, 404, origin);
  if (row.state !== "proof_required" || row.challenge_consumed_at)
    return json({ code: "CHALLENGE_ALREADY_USED", message: "This challenge is no longer available. Request a fresh challenge." }, 409, origin);
  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
    return rejectOwnerProof(env, body.requestId, "challenge_expired", origin, 410);

  let presentation;
  try {
    presentation = decodeOwnerProof(body.proof);
    if (presentation.account !== row.owner_account)
      return rejectOwnerProof(env, body.requestId, "wrong_account", origin, 403);
  } catch {
    return rejectOwnerProof(env, body.requestId, "invalid_presentation", origin, 400);
  }

  let currentBinding;
  try {
    currentBinding = await verifyBadge(row.buyer_agent_id, env);
  } catch (error) {
    if (isRegistryServiceUnavailable(error)) {
      return json({
        code: "REGISTRY_UNAVAILABLE",
        message: "Pact could not refresh the CIS-8004 owner and agentWallet binding. The challenge remains available until it expires.",
      }, 503, origin);
    }
    return rejectOwnerProof(env, body.requestId, "registry_binding_invalid", origin, 403);
  }
  if (
    currentBinding.owner !== row.owner_account ||
    currentBinding.wallet !== row.payer_account
  ) {
    return rejectOwnerProof(env, body.requestId, "registry_binding_changed", origin, 403);
  }

  let accountInfo;
  try {
    accountInfo = await fetchConcordiumAccountInfo(row.owner_account);
  } catch {
    return json({ code: "CONCORDIUM_UNAVAILABLE", message: "Pact could not retrieve fresh Concordium account credentials. The challenge remains available until it expires." }, 503, origin);
  }

  let valid = false;
  try {
    valid = await verifyConcordiumMessageSignature(
      row.message,
      row.owner_account,
      presentation.signature,
      accountInfo,
    );
  } catch {
    return json({ code: "SIGNATURE_VERIFIER_UNAVAILABLE", message: "Pact could not complete Concordium signature verification." }, 503, origin);
  }
  if (!valid)
    return rejectOwnerProof(env, body.requestId, "invalid_signature", origin, 401);

  const verifiedAt = new Date().toISOString();
  const accessExpiresAt = new Date(Date.now() + 12 * 60_000).toISOString();
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE pact_access_requests
         SET state = 'proof_verified', challenge_consumed_at = ?, expires_at = ?
         WHERE request_id = ? AND state = 'proof_required'
           AND challenge_consumed_at IS NULL AND expires_at > ?`,
      ).bind(verifiedAt, accessExpiresAt, body.requestId, verifiedAt),
      env.DB.prepare(
        `INSERT INTO pact_access_audit (request_id, state, at, reason_code)
         SELECT ?, 'proof_verified', ?, 'concordium_account_signature'
         WHERE changes() = 1`,
      ).bind(body.requestId, verifiedAt),
    ]);
  } catch {
    return json({ code: "PROOF_PERSISTENCE_FAILED", message: "Pact verified the signature but could not persist the result. Resource access remains locked." }, 503, origin);
  }
  if (results[0]?.meta?.changes !== 1)
    return json({ code: "CHALLENGE_ALREADY_USED", message: "This challenge was consumed by another request or expired. Request a fresh challenge." }, 409, origin);

  return json({
    requestId: body.requestId,
    status: "verified",
    verifiedAccount: row.owner_account,
    verifiedAt,
    expiresAt: accessExpiresAt,
    policyId: POLICY_ID,
  }, 200, origin);
}

function isRegistryServiceUnavailable(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return [
    "not configured",
    "service unavailable",
    "verification is unavailable",
    "lookup failed",
    "empty registry response",
    "unsupported registry response",
    "timed out",
    "timeout",
    "fetch failed",
  ].some((part) => message.includes(part));
}

async function registryBindingResponse(tokenAddress, env) {
  if (
    typeof tokenAddress !== "string" ||
    !/^[1-9A-HJ-NP-Za-km-z]{20,80}$/.test(tokenAddress)
  ) {
    return json({ code: "INVALID_AGENT_ID", message: "A valid CIS-8004 agent token address is required." }, 400);
  }

  try {
    const agent = await verifyBadge(tokenAddress, env);
    return json({
      status: "verified",
      tokenAddress,
      network: NETWORK,
      ownerAccount: agent.owner,
      payerAccount: agent.wallet,
      registryContract: "12802,0",
    });
  } catch (error) {
    const unavailable = isRegistryServiceUnavailable(error);
    return json(
      {
        code: unavailable ? "REGISTRY_UNAVAILABLE" : "AGENT_NOT_VERIFIED",
        message: unavailable
          ? "Concordium Agent Registry is unavailable. Retry without using the previous result."
          : "The current CIS-8004 agent binding did not pass verification.",
      },
      unavailable ? 503 : 403,
    );
  }
}

async function issueChallenge(request, env, origin) {
  if (!isAllowedBrowserRequest(request, env.PACT_ORIGIN, env.PACT_PREVIEW_ORIGINS))
    return json({ code: "ORIGIN_REJECTED", message: "Request origin is not allowed." }, 403, origin);

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
    const status = isRegistryServiceUnavailable(error) ? 503 : 403;
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
      if (!isAllowedBrowserRequest(request, env.PACT_ORIGIN, env.PACT_PREVIEW_ORIGINS))
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
          ownerSignatureVerification: "configured",
          accountInfoRpc: "concordium-testnet-grpc-web",
          payments: "disabled",
          resourceDelivery: "disabled",
        });
      } catch {
        return json({ status: "error", storage: "unavailable" }, 503);
      }
    }

    const registryRoute = url.pathname.match(/^\/api\/access\/registry\/([1-9A-HJ-NP-Za-km-z]{20,80})$/);
    if (registryRoute && request.method === "GET")
      return registryBindingResponse(registryRoute[1], env);

    if (url.pathname === "/api/access/challenges" && request.method === "POST")
      return issueChallenge(request, env, origin);

    if (url.pathname === "/api/access/proofs" && request.method === "POST")
      return verifyOwnerProof(request, env, origin);

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

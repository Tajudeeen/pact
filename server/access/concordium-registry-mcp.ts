import type { AccessContext } from "./contracts";
import type {
  Cis8004AgentResolver,
  ResolvedCis8004Agent,
} from "./agent-registry-binding";

interface McpResponse {
  result?: {
    isError?: boolean;
    structuredContent?: unknown;
    content?: Array<{ type?: string; text?: string }>;
  };
  error?: { message?: string };
}

interface McpCallResult {
  body: McpResponse;
  sessionId: string | null;
}

type FetchLike = typeof fetch;

function parseMcpResponse(raw: string): McpResponse {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Concordium registry MCP returned an empty response.");
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as McpResponse;

  // Streamable HTTP may return a server-sent event containing one JSON-RPC message.
  const messages = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (!messages.length) throw new Error("Concordium registry MCP returned an unsupported response.");
  return JSON.parse(messages[messages.length - 1]) as McpResponse;
}

function parseAgentRecord(
  value: unknown,
  tokenAddress: string,
  registryId: string,
): ResolvedCis8004Agent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.token_address !== tokenAddress ||
    typeof record.owner_account !== "string" ||
    (record.status !== "Active" && record.status !== "Revoked")
  ) return null;

  const wallet =
    typeof record.agent_wallet === "string" && record.agent_wallet.length > 0
      ? record.agent_wallet
      : typeof record.agentWallet === "string" && record.agentWallet.length > 0
        ? record.agentWallet
        : null;

  return {
    tokenAddress,
    registryId,
    ownerAccount: record.owner_account,
    agentWallet: wallet,
    status: record.status,
  };
}

/**
 * Resolves the current CIS-8004 record through Concordium's official Agent
 * Registry MCP service. The MCP lookup reads the chain directly and does not
 * require the discovery Indexer.
 *
 * Pin registryId from the trusted contract configuration for this network.
 * Never derive it from client input or the MCP response.
 */
export class ConcordiumMcpAgentResolver implements Cis8004AgentResolver {
  private sessionPromise: Promise<string | null> | null = null;
  private nextId = 1;

  constructor(
    private readonly options: {
      registryId: string;
      endpoint?: string;
      fetcher?: FetchLike;
      timeoutMs?: number;
    },
  ) {
    if (!options.registryId.trim())
      throw new Error("A trusted CIS-8004 registry identifier is required.");
    const endpoint = options.endpoint ?? "https://agent-registry-mcp.concordium.com/mcp";
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost")
      throw new Error("The Concordium registry MCP endpoint must use HTTPS.");
  }

  async resolve(input: {
    tokenAddress: string;
    network: AccessContext["network"];
  }): Promise<ResolvedCis8004Agent | null> {
    if (!/^[1-9A-HJ-NP-Za-km-z]{20,80}$/.test(input.tokenAddress))
      return null;

    const network =
      input.network === "ccd:4221332d34e1694168c2a0c0b3fd0f27"
        ? "testnet"
        : input.network === "ccd:9dd9ca4d19e9393877d2c44b70f89acb"
          ? "mainnet"
          : null;
    if (!network) return null;

    const sessionId = await this.initialize();
    const response = await this.callTool(
      "agent_by_token_address",
      { token_address: input.tokenAddress, network },
      sessionId,
    );
    if (response.body.result?.isError)
      throw new Error("Concordium registry could not resolve this agent.");

    const structured = response.body.result?.structuredContent;
    if (structured) return parseAgentRecord(structured, input.tokenAddress, this.options.registryId);

    const text = response.body.result?.content?.find((part) => part.type === "text")?.text;
    if (!text) throw new Error("Concordium registry returned no agent record.");
    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch {
      throw new Error("Concordium registry returned malformed agent data.");
    }
    return parseAgentRecord(decoded, input.tokenAddress, this.options.registryId);
  }

  private async initialize(): Promise<string | null> {
    if (!this.sessionPromise) {
      this.sessionPromise = this.call("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "pact-access", version: "0.1.0" },
      }).then((result) => result.sessionId).catch((error) => {
        this.sessionPromise = null;
        throw error;
      });
    }
    const sessionId = await this.sessionPromise;
    await this.call("notifications/initialized", undefined, sessionId, false);
    return sessionId;
  }

  private async callTool(
    name: string,
    args: Record<string, string>,
    sessionId: string | null,
  ): Promise<McpCallResult> {
    return this.call("tools/call", { name, arguments: args }, sessionId);
  }

  private async call(
    method: string,
    params?: unknown,
    sessionId?: string | null,
    expectResponse = true,
  ): Promise<McpCallResult> {
    const fetcher = this.options.fetcher ?? fetch;
    const id = this.nextId++;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const response = await fetcher(
      this.options.endpoint ?? "https://agent-registry-mcp.concordium.com/mcp",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          ...(expectResponse ? { id } : {}),
          method,
          ...(params === undefined ? {} : { params }),
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      },
    );
    const nextSession = response.headers.get("mcp-session-id") ?? sessionId ?? null;
    if (!response.ok) throw new Error(`Concordium registry MCP request failed (${response.status}).`);
    if (!expectResponse) return { body: {}, sessionId: nextSession };

    const body = parseMcpResponse(await response.text());
    if (body.error) throw new Error(body.error.message ?? "Concordium registry MCP error.");
    return { body, sessionId: nextSession };
  }
}

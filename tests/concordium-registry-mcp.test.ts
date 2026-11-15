import { describe, expect, it, vi } from "vitest";
import { ConcordiumMcpAgentResolver } from "../server/access/concordium-registry-mcp";

const tokenAddress = "3FCRLpYrYdBNkbaBkrK2kmcnrdNqa4wSDYWGAWGZvG6Xi9eWtp";
const registryId = "ccd:4221332d34e1694168c2a0c0b3fd0f27/contract:12802";

function mcpFetch(record: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (calls.length === 1)
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "registry" } },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Mcp-Session-Id": "session-1" },
      });
    if (calls.length === 2) return new Response(null, { status: 202 });
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      result: {
        content: [{ type: "text", text: JSON.stringify(record) }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return { fetcher, calls };
}

describe("Concordium MCP agent resolver", () => {
  it("resolves the live agent owner and registered payment wallet", async () => {
    const h = mcpFetch({
      network: "testnet",
      token_address: tokenAddress,
      token_id: "853",
      owner_account: "4".repeat(50),
      agent_wallet: "5".repeat(50),
      status: "Active",
    });
    const resolver = new ConcordiumMcpAgentResolver({
      registryId,
      fetcher: h.fetcher as typeof fetch,
    });
    const result = await resolver.resolve({
      tokenAddress,
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
    });

    expect(result).toEqual({
      tokenAddress,
      registryId,
      ownerAccount: "4".repeat(50),
      agentWallet: "5".repeat(50),
      status: "Active",
    });
    expect(h.calls).toHaveLength(3);
    expect(h.calls[2].url).toBe("https://agent-registry-mcp.concordium.com/mcp");
    expect(JSON.parse(String(h.calls[2].init?.body))).toMatchObject({
      method: "tools/call",
      params: {
        name: "agent_by_token_address",
        arguments: { token_address: tokenAddress, network: "testnet" },
      },
    });
    expect((h.calls[2].init?.headers as Record<string, string>)["Mcp-Session-Id"]).toBe("session-1");
  });

  it("preserves revoked status for the owner-binding verifier to reject", async () => {
    const h = mcpFetch({
      token_address: tokenAddress,
      owner_account: "4".repeat(50),
      agent_wallet: "5".repeat(50),
      status: "Revoked",
    });
    const resolver = new ConcordiumMcpAgentResolver({
      registryId,
      fetcher: h.fetcher as typeof fetch,
    });
    const result = await resolver.resolve({
      tokenAddress,
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
    });
    expect(result?.status).toBe("Revoked");
  });

  it("rejects records for a different token address", async () => {
    const h = mcpFetch({
      token_address: "different-token",
      owner_account: "4".repeat(50),
      agent_wallet: "5".repeat(50),
      status: "Active",
    });
    const resolver = new ConcordiumMcpAgentResolver({
      registryId,
      fetcher: h.fetcher as typeof fetch,
    });
    const result = await resolver.resolve({
      tokenAddress,
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
    });
    expect(result).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  createPactBuyerFetch,
  pactBuyerHeaders,
  type PactBuyerPaymentModuleLoader,
} from "../server/access/buyer-agent";

const address = "4".repeat(50);
const privateKey = "ab".repeat(32);
const network = "ccd:4221332d34e1694168c2a0c0b3fd0f27" as const;

function modulesHarness() {
  const account = { address };
  const signer = { sign: "server-only" };
  const scheme = { name: "concordium-exact" };
  const fromBase58 = vi.fn(() => account);
  const buildBasicAccountSigner = vi.fn(() => signer);
  const schemeConstructor = vi.fn(function () { return scheme; });
  const register = vi.fn(function (this: object) { return this; });
  const clientConstructor = vi.fn(function () { return { register }; });
  const fetcher = vi.fn(async () => new Response("ok"));
  const wrapFetchWithPayment = vi.fn(() => fetcher);
  const loadModules: PactBuyerPaymentModuleLoader = async () => ({
    sdk: { AccountAddress: { fromBase58 }, buildBasicAccountSigner },
    scheme: { ExactConcordiumScheme: schemeConstructor as never },
    fetch: {
      x402Client: clientConstructor as never,
      wrapFetchWithPayment,
    },
  });
  return {
    account,
    signer,
    scheme,
    fromBase58,
    buildBasicAccountSigner,
    schemeConstructor,
    register,
    clientConstructor,
    fetcher,
    wrapFetchWithPayment,
    loadModules,
  };
}

describe("Pact buyer agent payment client", () => {
  it("builds the official Exact Concordium x402 client with the registered wallet", async () => {
    const h = modulesHarness();
    const transport = vi.fn(async () => new Response("ok"));
    const fetchWithPayment = await createPactBuyerFetch({
      agentWalletAddress: address,
      agentWalletPrivateKey: privateKey,
      network,
      fetcher: transport as typeof fetch,
    }, h.loadModules);

    expect(fetchWithPayment).toBe(h.fetcher);
    expect(h.fromBase58).toHaveBeenCalledWith(address);
    expect(h.buildBasicAccountSigner).toHaveBeenCalledWith(privateKey);
    expect(h.schemeConstructor).toHaveBeenCalledWith({
      accountAddress: h.account,
      signer: h.signer,
    });
    expect(h.register).toHaveBeenCalledWith(network, h.scheme);
    expect(h.wrapFetchWithPayment).toHaveBeenCalledWith(transport, expect.any(Object));
  });

  it("rejects malformed wallet inputs before loading dependencies", async () => {
    const h = modulesHarness();
    await expect(createPactBuyerFetch({
      agentWalletAddress: "not-an-account",
      agentWalletPrivateKey: privateKey,
      network,
    }, h.loadModules)).rejects.toThrow("agentWallet address");
    expect(h.clientConstructor).not.toHaveBeenCalled();
  });

  it("builds the request-bound Pact headers for the buyer agent", () => {
    expect(pactBuyerHeaders({ requestId: "request-1" })).toEqual({
      "x-pact-access-request": "request-1",
    });
    expect(() => pactBuyerHeaders({ requestId: "bad request" })).toThrow("request id");
  });
});

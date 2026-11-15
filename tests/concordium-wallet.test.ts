import { describe, expect, it, vi } from "vitest";
import {
  createConcordiumOwnerProof,
  type ConcordiumBrowserWalletLoader,
} from "../src/access/concordium-wallet";

describe("Concordium owner wallet proof", () => {
  it("signs the exact server message and builds the Pact proof header", async () => {
    const signature = { "0": { "0": "deadbeef" } };
    const connect = vi.fn(async () => "4".repeat(50));
    const signMessage = vi.fn(async () => signature);
    const loadWallet: ConcordiumBrowserWalletLoader = async () => ({
      detectConcordiumProvider: async () => ({ connect, signMessage }),
    });

    const proof = await createConcordiumOwnerProof(
      '{"domain":"pact-access","requestId":"request-1"}',
      loadWallet,
    );

    expect(connect).toHaveBeenCalledTimes(1);
    expect(signMessage).toHaveBeenCalledWith(
      "4".repeat(50),
      '{"domain":"pact-access","requestId":"request-1"}',
    );
    expect(JSON.parse(Buffer.from(proof.headerValue, "base64url").toString("utf8"))).toEqual({
      account: "4".repeat(50),
      signature,
    });
  });

  it("does not sign an empty challenge", async () => {
    const loadWallet = vi.fn();
    await expect(createConcordiumOwnerProof("", loadWallet as never))
      .rejects.toThrow("challenge message");
    expect(loadWallet).not.toHaveBeenCalled();
  });

  it("propagates wallet rejection without inventing a proof", async () => {
    const loadWallet: ConcordiumBrowserWalletLoader = async () => ({
      detectConcordiumProvider: async () => ({
        connect: async () => "4".repeat(50),
        signMessage: async () => { throw new Error("user rejected"); },
      }),
    });
    await expect(createConcordiumOwnerProof("challenge", loadWallet))
      .rejects.toThrow("user rejected");
  });
});

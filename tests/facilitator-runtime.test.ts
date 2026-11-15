import { describe, expect, it, vi } from "vitest";
import {
  createPactConcordiumFacilitator,
  CONCORDIUM_TESTNET,
  type PactFacilitatorModuleLoader,
} from "../server/facilitator/runtime";

const sponsorAddress = "4".repeat(50);
const privateKey = "ab".repeat(32);
const resourceUrl = "https://pact.test/api/access/resource";
const payTo = "6".repeat(50);
const amount = "1000000";

function harness() {
  const signer = { sponsor: sponsorAddress };
  const scheme = { name: "exact-concordium" };
  const facilitator = {
    register: vi.fn(function (this: object) { return this; }),
    onBeforeVerify: vi.fn(function (this: object, _context: unknown) { return this; }),
    onBeforeSettle: vi.fn(function (this: object, _context: unknown) { return this; }),
    getSupported: vi.fn(() => ({ kinds: [{ scheme: "exact", network: CONCORDIUM_TESTNET }] })),
    verify: vi.fn(async () => ({ isValid: true, payer: "5".repeat(50) })),
    settle: vi.fn(async () => ({ success: true, transaction: "ab".repeat(32) })),
  };
  const grpcUrl = vi.fn(() => "grpc.testnet.concordium.com:20000");
  const parseGrpcUrl = vi.fn(() => ["grpc.testnet.concordium.com", 20000] as [string, number]);
  const toConcordiumFacilitatorSigner = vi.fn(() => signer);
  const schemeConstructor = vi.fn(function (this: object, _config: unknown) {
    Object.assign(this, scheme);
  });
  const facilitatorConstructor = vi.fn(function () { return facilitator; });
  const loadModules: PactFacilitatorModuleLoader = async () => ({
    core: { x402Facilitator: facilitatorConstructor as never },
    concordium: {
      ExactConcordiumScheme: schemeConstructor as never,
      toConcordiumFacilitatorSigner,
      getConcordiumGrpcUrl: grpcUrl,
      parseGrpcUrl,
    },
  });
  return {
    signer,
    scheme,
    facilitator,
    grpcUrl,
    parseGrpcUrl,
    toConcordiumFacilitatorSigner,
    schemeConstructor,
    facilitatorConstructor,
    loadModules,
  };
}

describe("Pact Concordium facilitator runtime", () => {
  it("registers a finalization-required Exact Concordium facilitator", async () => {
    const h = harness();
    const runtime = await createPactConcordiumFacilitator({
      sponsorAddress,
      sponsorPrivateKey: privateKey,
      resourceUrl,
      payTo,
      amount,
      asset: "CCD",
    }, h.loadModules);

    expect(h.grpcUrl).toHaveBeenCalledWith(CONCORDIUM_TESTNET);
    expect(h.toConcordiumFacilitatorSigner).toHaveBeenCalledWith(
      sponsorAddress,
      privateKey,
      {
        host: "grpc.testnet.concordium.com",
        port: 20000,
        useTls: true,
        network: CONCORDIUM_TESTNET,
      },
    );
    expect(h.schemeConstructor).toHaveBeenCalledWith({
      signer: h.signer,
      requireFinalization: true,
      finalizationTimeoutMs: 60_000,
    });
    expect(h.facilitator.register).toHaveBeenCalledWith(
      CONCORDIUM_TESTNET,
      expect.objectContaining(h.scheme),
    );
    expect(h.facilitator.onBeforeVerify).toHaveBeenCalledTimes(1);
    expect(h.facilitator.onBeforeSettle).toHaveBeenCalledTimes(1);

    const verifyPolicy = h.facilitator.onBeforeVerify.mock.calls[0][0] as (input: unknown) => unknown;
    const validPayment = {
      requirements: {
        scheme: "exact",
        network: CONCORDIUM_TESTNET,
        payTo,
        amount,
        asset: "CCD",
      },
      paymentPayload: { resource: { url: resourceUrl } },
    };
    expect(verifyPolicy(validPayment)).toBeUndefined();
    expect(verifyPolicy({
      ...validPayment,
      requirements: { ...validPayment.requirements, amount: "1" },
    })).toMatchObject({ abort: true, reason: "pact_facilitator_policy_mismatch" });
    const settlePolicy = h.facilitator.onBeforeSettle.mock.calls[0]?.[0] as (input: unknown) => unknown;
    expect(settlePolicy(validPayment)).toBeUndefined();
    expect(settlePolicy({
      ...validPayment,
      paymentPayload: { resource: { url: "https://attacker.test/resource" } },
    })).toMatchObject({ abort: true, reason: "pact_facilitator_policy_mismatch" });
    expect(runtime.supported()).toEqual({
      kinds: [{ scheme: "exact", network: CONCORDIUM_TESTNET }],
    });
    await runtime.verify({ payload: "x" }, { amount: "1" });
    await runtime.settle({ payload: "x" }, { amount: "1" });
    expect(h.facilitator.verify).toHaveBeenCalledTimes(1);
    expect(h.facilitator.settle).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed sponsor keys before loading facilitator packages", async () => {
    const h = harness();
    await expect(createPactConcordiumFacilitator({
      sponsorAddress,
      sponsorPrivateKey: "bad",
      resourceUrl,
      payTo,
      amount,
      asset: "CCD",
    }, h.loadModules)).rejects.toThrow("32-byte hex");
    expect(h.facilitatorConstructor).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  ConcordiumGrpcAccountInfoReader,
  ConcordiumSdkMessageSignatureChecker,
  ConcordiumGrpcSettlementReconciler,
  type ConcordiumSdkModuleLoader,
} from "../server/access/concordium-node";

const network = "ccd:4221332d34e1694168c2a0c0b3fd0f27" as const;

function sdkHarness() {
  const address = { parsed: "account-address" };
  const accountInfo = { credentials: { fresh: true } };
  const getAccountInfo = vi.fn(async () => accountInfo);
  const getBlockItemStatus = vi.fn(async (_hash: unknown): Promise<unknown> => undefined);
  const shutdown = vi.fn(async () => {});
  const fromHexString = vi.fn((value: string) => ({ hash: value }));
  const clientConstructor = vi.fn(function (
    this: object,
    _host: string,
    _port: number,
    _credentials: unknown,
    _options: unknown,
  ) {
    Object.assign(this, { getAccountInfo, getBlockItemStatus, shutdown });
  });
  const fromBase58 = vi.fn(() => address);
  const createSsl = vi.fn(() => ({ tls: true }));
  const verifyMessageSignature = vi.fn(() => true);
  const load: ConcordiumSdkModuleLoader = async () => ({
    web: {
      AccountAddress: { fromBase58 },
      verifyMessageSignature,
      TransactionHash: { fromHexString },
    },
    node: {
      ConcordiumGRPCNodeClient: clientConstructor as never,
    },
    grpc: { credentials: { createSsl } },
  });
  return {
    load,
    address,
    accountInfo,
    getAccountInfo,
    getBlockItemStatus,
    shutdown,
    fromHexString,
    clientConstructor,
    fromBase58,
    createSsl,
    verifyMessageSignature,
  };
}

describe("Concordium SDK adapters", () => {
  it("reads fresh account info from the testnet node over TLS and reuses its client", async () => {
    const h = sdkHarness();
    const reader = new ConcordiumGrpcAccountInfoReader(h.load);

    const first = await reader.getAccountInfo("4".repeat(50), network);
    const second = await reader.getAccountInfo("5".repeat(50), network);

    expect(first).toBe(h.accountInfo);
    expect(second).toBe(h.accountInfo);
    expect(h.fromBase58).toHaveBeenCalledTimes(2);
    expect(h.getAccountInfo).toHaveBeenCalledWith(h.address);
    expect(h.clientConstructor).toHaveBeenCalledTimes(1);
    expect(h.clientConstructor).toHaveBeenCalledWith(
      "grpc.testnet.concordium.com",
      20000,
      { tls: true },
      { timeout: 15_000 },
    );
    expect(h.createSsl).toHaveBeenCalledTimes(1);
  });

  it("reconciles a finalized successful transaction as paid", async () => {
    const h = sdkHarness();
    h.getBlockItemStatus.mockResolvedValue({
      status: "finalized",
      outcome: {
        summary: {
          type: "accountTransaction",
          transactionType: "transfer",
          transfer: { amount: "1000000", to: "seller" },
        },
      },
    });
    const reader = new ConcordiumGrpcAccountInfoReader(h.load);
    const reconciler = new ConcordiumGrpcSettlementReconciler(reader);
    const result = await reconciler.reconcile({
      transactionReference: "ab".repeat(32),
      network,
      payerAccount: "5".repeat(50),
    });
    expect(result).toEqual({
      status: "confirmed",
      transactionReference: "ab".repeat(32),
      network,
      payerAccount: "5".repeat(50),
    });
    expect(h.fromHexString).toHaveBeenCalledWith("ab".repeat(32));
  });

  it("keeps committed transactions pending", async () => {
    const h = sdkHarness();
    h.getBlockItemStatus.mockResolvedValue({ status: "committed", outcomes: {} });
    const reconciler = new ConcordiumGrpcSettlementReconciler(
      new ConcordiumGrpcAccountInfoReader(h.load),
    );
    expect(await reconciler.reconcile({
      transactionReference: "ab".repeat(32),
      network,
      payerAccount: "5".repeat(50),
    })).toMatchObject({ status: "pending" });
  });

  it("marks finalized rejected transactions as failed", async () => {
    const h = sdkHarness();
    h.getBlockItemStatus.mockResolvedValue({
      status: "finalized",
      outcome: {
        summary: {
          type: "accountTransaction",
          transactionType: "failed",
          rejectReason: { tag: "InsufficientFunds" },
        },
      },
    });
    const reconciler = new ConcordiumGrpcSettlementReconciler(
      new ConcordiumGrpcAccountInfoReader(h.load),
    );
    expect(await reconciler.reconcile({
      transactionReference: "ab".repeat(32),
      network,
      payerAccount: "5".repeat(50),
    })).toMatchObject({ status: "failed", reason: "concordium_finalized_insufficientfunds" });
  });

  it("closes cached gRPC clients on shutdown", async () => {
    const h = sdkHarness();
    const reader = new ConcordiumGrpcAccountInfoReader(h.load);
    await reader.getAccountInfo("4".repeat(50), network);
    await reader.shutdown();
    expect(h.shutdown).toHaveBeenCalledTimes(1);
  });

  it("delegates message verification to the official SDK", async () => {
    const h = sdkHarness();
    const checker = new ConcordiumSdkMessageSignatureChecker(h.load);
    const result = await checker.verifyMessageSignature(
      "pact challenge",
      { credential: "signature" },
      h.accountInfo,
    );

    expect(result).toBe(true);
    expect(h.verifyMessageSignature).toHaveBeenCalledWith(
      "pact challenge",
      { credential: "signature" },
      h.accountInfo,
    );
  });
});

import type { AccessContext } from "./contracts";
import type {
  ConcordiumAccountInfoReader,
  ConcordiumMessageSignatureChecker,
} from "./account-signature-verifier";

interface ConcordiumWebSdk {
  AccountAddress: {
    fromBase58(value: string): unknown;
  };
  verifyMessageSignature(
    message: string,
    signature: unknown,
    accountInfo: unknown,
  ): boolean;
  TransactionHash: {
    fromHexString(value: string): unknown;
  };
}

interface ConcordiumNodeSdk {
  ConcordiumGRPCNodeClient: new (
    host: string,
    port: number,
    credentials: unknown,
    options?: { timeout?: number },
  ) => {
    getAccountInfo(address: unknown): Promise<unknown>;
    getBlockItemStatus(transactionHash: unknown): Promise<unknown>;
    shutdown(): Promise<void>;
  };
}

interface GrpcJsModule {
  credentials: {
    createSsl(): unknown;
  };
}

export interface ConcordiumSdkModules {
  web: ConcordiumWebSdk;
  node: ConcordiumNodeSdk;
  grpc: GrpcJsModule;
}

export type ConcordiumSdkModuleLoader = () => Promise<ConcordiumSdkModules>;

const ENDPOINTS: Record<AccessContext["network"], { host: string; port: number }> = {
  "ccd:4221332d34e1694168c2a0c0b3fd0f27": {
    host: "grpc.testnet.concordium.com",
    port: 20000,
  },
  "ccd:9dd9ca4d19e9393877d2c44b70f89acb": {
    host: "grpc.mainnet.concordium.software",
    port: 20000,
  },
};

const loadConcordiumModules: ConcordiumSdkModuleLoader = async () => {
  // Dynamic imports keep the core test suite runnable before the optional
  // chain packages are installed on the developer machine.
  const webPackage = "@concordium/web-sdk";
  const nodePackage = "@concordium/web-sdk/nodejs";
  const grpcPackage = "@grpc/grpc-js";
  const [web, node, grpc] = await Promise.all([
    import(webPackage),
    import(nodePackage),
    import(grpcPackage),
  ]);
  return {
    web: web as unknown as ConcordiumWebSdk,
    node: node as unknown as ConcordiumNodeSdk,
    grpc: grpc as unknown as GrpcJsModule,
  };
};

/** Reads fresh account credentials from the matching Concordium node over TLS. */
export class ConcordiumGrpcAccountInfoReader implements ConcordiumAccountInfoReader {
  private readonly clients = new Map<
    AccessContext["network"],
    Promise<{ client: InstanceType<ConcordiumNodeSdk["ConcordiumGRPCNodeClient"]>; modules: ConcordiumSdkModules }>
  >();

  constructor(private readonly loadModules: ConcordiumSdkModuleLoader = loadConcordiumModules) {}

  async getAccountInfo(
    accountAddress: string,
    network: AccessContext["network"],
  ): Promise<unknown> {
    const modules = await this.getClient(network);
    const address = modules.modules.web.AccountAddress.fromBase58(accountAddress);
    return modules.client.getAccountInfo(address);
  }

  async getBlockItemStatus(
    transactionHash: string,
    network: AccessContext["network"],
  ): Promise<unknown> {
    if (!/^[a-f0-9]{64}$/i.test(transactionHash))
      throw new Error("Concordium transaction hash must be 32-byte hexadecimal.");
    const modules = await this.getClient(network);
    const hash = modules.modules.web.TransactionHash.fromHexString(transactionHash);
    return modules.client.getBlockItemStatus(hash);
  }

  async shutdown(): Promise<void> {
    const clients = [...this.clients.values()];
    this.clients.clear();
    await Promise.allSettled(
      clients.map(async (pending) => {
        const { client } = await pending;
        await client.shutdown();
      }),
    );
  }

  private getClient(network: AccessContext["network"]) {
    let pending = this.clients.get(network);
    if (!pending) {
      pending = this.loadModules().then((modules) => {
        const endpoint = ENDPOINTS[network];
        const client = new modules.node.ConcordiumGRPCNodeClient(
          endpoint.host,
          endpoint.port,
          modules.grpc.credentials.createSsl(),
          { timeout: 15_000 },
        );
        return { client, modules };
      });
      this.clients.set(network, pending);
      pending.catch(() => {
        if (this.clients.get(network) === pending) this.clients.delete(network);
      });
    }
    return pending;
  }
}

/** Uses the official Concordium SDK verifier against the freshly fetched account info. */
export class ConcordiumSdkMessageSignatureChecker implements ConcordiumMessageSignatureChecker {
  constructor(private readonly loadModules: ConcordiumSdkModuleLoader = loadConcordiumModules) {}

  async verifyMessageSignature(
    message: string,
    signature: unknown,
    accountInfo: unknown,
  ): Promise<boolean> {
    const modules = await this.loadModules();
    return modules.web.verifyMessageSignature(message, signature, accountInfo);
  }
}

/** Reads the final chain outcome for a transaction whose facilitator response timed out. */
export class ConcordiumGrpcSettlementReconciler {
  constructor(private readonly reader: ConcordiumGrpcAccountInfoReader) {}

  async reconcile(input: {
    transactionReference: string;
    network: AccessContext["network"];
    payerAccount: string;
  }) {
    const raw = await this.reader.getBlockItemStatus(
      input.transactionReference,
      input.network,
    );
    if (!raw || typeof raw !== "object")
      return { status: "pending" as const, transactionReference: input.transactionReference };

    const status = (raw as Record<string, unknown>).status;
    if (status !== "finalized")
      return { status: "pending" as const, transactionReference: input.transactionReference };

    const outcome = (raw as Record<string, unknown>).outcome;
    const outcomeRecord = outcome && typeof outcome === "object"
      ? outcome as Record<string, unknown>
      : undefined;
    const summary = outcomeRecord?.summary && typeof outcomeRecord.summary === "object"
      ? outcomeRecord.summary as Record<string, unknown>
      : undefined;

    // Concordium's finalized BlockItemStatus has one outcome.summary.
    // A failed account transaction is represented by transactionType="failed".
    if (
      summary?.type === "accountTransaction" &&
      typeof summary.transactionType === "string" &&
      summary.transactionType !== "failed"
    ) {
      return {
        status: "confirmed" as const,
        transactionReference: input.transactionReference,
        network: input.network,
        payerAccount: input.payerAccount,
      };
    }

    const rejectReason = summary?.rejectReason;
    const rejectTag = rejectReason && typeof rejectReason === "object"
      ? (rejectReason as Record<string, unknown>).tag
      : undefined;
    return {
      status: "failed" as const,
      reason: "concordium_finalized_" +
        String(summary?.transactionType === "failed"
          ? rejectTag ?? "rejected"
          : "unexpected_outcome")
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "_"),
    };
  }
}

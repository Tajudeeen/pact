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
}

interface ConcordiumNodeSdk {
  ConcordiumGRPCNodeClient: new (
    host: string,
    port: number,
    credentials: unknown,
    options?: { timeout?: number },
  ) => {
    getAccountInfo(address: unknown): Promise<unknown>;
  };
  credentials: {
    createSsl(): unknown;
  };
}

export interface ConcordiumSdkModules {
  web: ConcordiumWebSdk;
  node: ConcordiumNodeSdk;
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
  const [web, node] = await Promise.all([
    import(webPackage),
    import(nodePackage),
  ]);
  return {
    web: web as unknown as ConcordiumWebSdk,
    node: node as unknown as ConcordiumNodeSdk,
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

  private getClient(network: AccessContext["network"]) {
    let pending = this.clients.get(network);
    if (!pending) {
      pending = this.loadModules().then((modules) => {
        const endpoint = ENDPOINTS[network];
        const client = new modules.node.ConcordiumGRPCNodeClient(
          endpoint.host,
          endpoint.port,
          modules.node.credentials.createSsl(),
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
  constructor(private readonly loadModules: ModuleLoader = loadConcordiumModules) {}

  async verifyMessageSignature(
    message: string,
    signature: unknown,
    accountInfo: unknown,
  ): Promise<boolean> {
    const modules = await this.loadModules();
    return modules.web.verifyMessageSignature(message, signature, accountInfo);
  }
}

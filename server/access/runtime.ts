import type { RecordStore } from "../records";
import type {
  AccessContext,
  ConcordiumX402Settlement,
  ProtectedResource,
  PaymentRequirement,
  SettlementResult,
} from "./contracts";
import { AccessChallengeIssuer } from "./challenge";
import { ConcordiumAccountSignatureVerifier } from "./account-signature-verifier";
import {
  ConcordiumGrpcAccountInfoReader,
  ConcordiumGrpcSettlementReconciler,
  ConcordiumSdkMessageSignatureChecker,
} from "./concordium-node";
import { ConcordiumMcpAgentResolver } from "./concordium-registry-mcp";
import { Cis8004OwnerBindingVerifier } from "./agent-registry-binding";
import { AccessPipeline } from "./pipeline";
import { SqlAccessAuditWriter } from "./sql-audit";
import { SqlAccessRepository } from "./sql-repository";
import { createPactX402Runtime, type PactX402RouteConfig } from "./x402-runtime";

export interface PactAccessRuntimeConfig {
  sellerId: string;
  resourceUrl: string;
  routePath: string;
  network: "ccd:4221332d34e1694168c2a0c0b3fd0f27";
  registryId: string;
  registryMcpUrl?: string;
  facilitatorUrl: string;
  facilitatorAuthToken: string;
  payTo: string;
  amount: string;
  asset: string;
  description: string;
  mimeType: string;
  resource: ProtectedResource<Uint8Array>;
}

const OWNER_POLICY = {
  policyId: "owner-account-signature-v1",
  description: "The active CIS-8004 owner account authorizes this exact agent resource request.",
} as const;

/**
 * Wires the concrete SQLite, Concordium SDK, registry MCP, proof, and x402
 * adapters for the first testnet seller resource.
 *
 * The caller supplies the actual protected resource callback. The x402
 * middleware settles before the handler, then the handler calls
 * deliverPaidResource(requestId) to release bytes.
 */
export async function createPactAccessRuntime(
  store: RecordStore,
  config: PactAccessRuntimeConfig,
) {
  if (config.network !== "ccd:4221332d34e1694168c2a0c0b3fd0f27")
    throw new Error("The first Pact Access runtime is testnet-only.");

  const repository = new SqlAccessRepository(store);
  const audit = new SqlAccessAuditWriter(store);
  const registry = new ConcordiumMcpAgentResolver({
    registryId: config.registryId,
    endpoint: config.registryMcpUrl,
  });
  const nodeReader = new ConcordiumGrpcAccountInfoReader();
  const settlementReconciler = new ConcordiumGrpcSettlementReconciler(nodeReader);
  const proof = new ConcordiumAccountSignatureVerifier(
    nodeReader,
    new ConcordiumSdkMessageSignatureChecker(),
  );
  const ownerBinding = new Cis8004OwnerBindingVerifier(registry, config.registryId);

  const payments: ConcordiumX402Settlement = {
    async requirements(context): Promise<PaymentRequirement> {
      if (
        context.sellerId !== config.sellerId ||
        context.resourceId !== config.resourceUrl ||
        context.network !== config.network
      ) throw new Error("Access context does not match the configured seller resource.");
      return {
        scheme: "exact",
        network: config.network,
        amount: config.amount,
        asset: config.asset,
        payTo: config.payTo,
        resourceId: config.resourceUrl,
      };
    },
    async settle(): Promise<SettlementResult> {
      throw new Error("Settlement is owned by the official x402 Hono middleware.");
    },
    async reconcile(input): Promise<SettlementResult> {
      return settlementReconciler.reconcile({
        transactionReference: input.transactionReference,
        network: input.context.network,
        payerAccount: input.context.payerAccount,
      });
    },
  };

  const pipeline = new AccessPipeline<Uint8Array>({
    requests: repository,
    context: (requestId) => repository.context(requestId),
    policy: () => Promise.resolve(OWNER_POLICY),
    challenges: repository,
    proof,
    ownerBinding,
    payments,
    resource: config.resource,
    audit,
  });
  const challenges = new AccessChallengeIssuer(repository);

  const route: PactX402RouteConfig = {
    network: config.network,
    facilitatorUrl: config.facilitatorUrl,
    facilitatorAuthToken: config.facilitatorAuthToken,
    routePath: config.routePath,
    resourceUrl: config.resourceUrl,
    description: config.description,
    mimeType: config.mimeType,
    payTo: config.payTo,
    amount: config.amount,
    asset: config.asset,
    maxTimeoutSeconds: 90,
  };
  const x402 = await createPactX402Runtime(pipeline, route);

  return {
    pipeline,
    repository,
    registry,
    challenges,
    middleware: x402.middleware,
    issueChallengeForAgent: (buyerAgentId: string) =>
      challenges.issueForAgent(
        {
          sellerId: config.sellerId,
          resourceId: config.resourceUrl,
          buyerAgentId,
          network: config.network,
          policy: OWNER_POLICY,
        },
        registry,
        config.registryId,
      ),
    deliverPaidResource: (requestId: string) =>
      pipeline.deliverPaidResource(requestId),
    reconcileAndDeliver: (requestId: string) =>
      pipeline.reconcileAndDeliver(requestId),
    shutdown: () => nodeReader.shutdown(),
  };
}

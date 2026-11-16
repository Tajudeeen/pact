import { AccountAddress, buildBasicAccountSigner } from "@concordium/web-sdk";
import { ExactConcordiumScheme } from "@x402/concordium/exact/client";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";

const NETWORK = "ccd:4221332d34e1694168c2a0c0b3fd0f27";
const DEFAULT_RESOURCE_URL = "https://pact-access.vercel.app/api/access/resource";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function decodePaymentResponse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return { encoded: value };
  }
}

async function main(): Promise<void> {
  const requestId = required("PACT_ACCESS_REQUEST_ID");
  const agentWalletAddress = required("PACT_BUYER_AGENT_WALLET_ADDRESS");
  const agentWalletPrivateKey = required("PACT_BUYER_AGENT_WALLET_PRIVATE_KEY");
  const resourceUrl = process.env.PACT_ACCESS_RESOURCE_URL?.trim() || DEFAULT_RESOURCE_URL;

  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    throw new Error("PACT_ACCESS_REQUEST_ID must be the verified Pact request UUID.");
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{45,55}$/.test(agentWalletAddress)) {
    throw new Error("PACT_BUYER_AGENT_WALLET_ADDRESS must be a Concordium account address.");
  }
  const parsedUrl = new URL(resourceUrl);
  if (parsedUrl.protocol !== "https:" || parsedUrl.pathname !== "/api/access/resource" || parsedUrl.search || parsedUrl.hash) {
    throw new Error("PACT_ACCESS_RESOURCE_URL must be the Pact HTTPS resource endpoint.");
  }

  const signer = {
    accountAddress: AccountAddress.fromBase58(agentWalletAddress),
    signer: buildBasicAccountSigner(agentWalletPrivateKey),
  };
  const client = new x402Client().register(
    NETWORK,
    new ExactConcordiumScheme(signer),
  );
  const paidFetch = wrapFetchWithPayment(fetch, client);

  const response = await paidFetch(resourceUrl, {
    method: "GET",
    headers: {
      "x-pact-access-request": requestId,
    },
    redirect: "error",
  });

  if (response.status === 202) {
    const body = await response.text();
    process.stdout.write(body + "\n");
    process.stdout.write("payment may already be broadcast. retry only this same request id. do not send another payment.\n");
    process.exitCode = 2;
    return;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pact resource request failed with HTTP ${response.status}: ${body}`);
  }

  const paymentReceipt = decodePaymentResponse(response.headers.get("PAYMENT-RESPONSE"));
  const content = await response.text();
  process.stdout.write(JSON.stringify({
    status: response.status,
    contentType: response.headers.get("Content-Type"),
    contentSha256: response.headers.get("X-Content-SHA256"),
    paymentReceipt,
    content,
  }, null, 2) + "\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Buyer agent failed.";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});

import {
  SomniaMarkets,
  SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  decodePlaceOrder,
  contractErrorsAbi,
  type PerpMarket,
} from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  parseAbi,
  encodeFunctionData,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import Decimal from "decimal.js";
import { rpcSocketConstructor } from "./socket";
import type { Account, Intent, MarketSnapshot, Plan } from "../src/core/types";
import type {
  Observation,
  PositionObservation,
  PreparedAction,
  Venue,
} from "./venue";
import {
  WATCH_MARKETS,
  emptyQuote,
  type QuoteObservation,
} from "../src/core/markets";
export const CHAIN_ID = 50383;
export const RPC = "https://api.hideki2.infra.testnet.somnia.network";
export const WS = "wss://api.hideki2.infra.testnet.somnia.network/ws";
export const INDEXER = "https://hideki-dev.smk.somnia.host/v1/graphql";
const abi = [
  ...parseAbi([
    "function placeOrderFor(address owner,bool isBid,uint64 userData,uint256 price,uint256 quantity,uint64 expireTimestampNs,uint8 orderType,uint8 selfMatchingOption,address builder,uint96 builderFeeBpsTimes1k) payable returns (bool success,uint128 orderId)",
    "function isOperatorAuthorized(address owner,address operator,bytes4 selector) view returns (bool)",
  ]),
  ...contractErrorsAbi,
];
export class DreamDex implements Venue {
  readonly sdk: SomniaMarkets;
  readonly publicClient;
  readonly key;
  readonly wallet;
  constructor(privateKey?: Hex, socketConstructor = rpcSocketConstructor()) {
    this.sdk = new SomniaMarkets({
      chain: hidekiTestnet,
      wsRpcUrl: process.env.PACT_WS_URL ?? WS,
      indexerUrl: process.env.PACT_INDEXER_URL ?? INDEXER,
      addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
      rpcWebSocketConstructor: socketConstructor,
    });
    this.publicClient = createPublicClient({
      chain: hidekiTestnet,
      transport: http(process.env.PACT_RPC_URL ?? RPC, {
        timeout: 10000,
        retryCount: 0,
      }),
    });
    this.key = privateKey ? privateKeyToAccount(privateKey) : undefined;
    this.wallet = this.key
      ? createWalletClient({
          account: this.key,
          chain: hidekiTestnet,
          transport: http(process.env.PACT_RPC_URL ?? RPC, {
            timeout: 10000,
            retryCount: 0,
          }),
        })
      : undefined;
  }
  async market(symbol: string): Promise<PerpMarket> {
    const rows = await this.sdk.client.listPerpMarkets();
    const m = rows.find((m) => `${m.baseSymbol}-PERP` === symbol);
    if (!m) throw new Error("Requested perp market was not discovered.");
    return m;
  }
  async network() {
    const [chainId, markets] = await Promise.all([
      this.publicClient.getChainId(),
      this.sdk.client.listPerpMarkets(),
    ]);
    if (chainId !== CHAIN_ID || !markets.length)
      throw new Error("Testnet network or market discovery unavailable.");
    const state = await this.sdk.client.getPerpState(markets[0].poolAddress);
    return {
      chainId,
      marketCount: markets.length,
      markValid: state.markPriceOk,
      checkedAt: new Date().toISOString(),
    };
  }
  async quotes(): Promise<QuoteObservation[]> {
    if ((await this.publicClient.getChainId()) !== CHAIN_ID)
      throw new Error("Wrong quote network.");
    const markets = await this.sdk.client.listPerpMarkets();
    return Promise.all(
      WATCH_MARKETS.map(async (market) => {
        const m = markets.find((m) => `${m.baseSymbol}-PERP` === market);
        if (!m)
          return emptyQuote(
            market,
            "This market was not discovered on dreamDEX testnet.",
          );
        const observedAt = Date.now();
        try {
          const [state, book] = await Promise.all([
            this.sdk.client.getPerpState(m.poolAddress),
            this.sdk.client
              .getSpotOrderBook(m.poolAddress, { depth: 1 })
              .catch(() => null),
          ]);
          const valid = state.markPriceOk && state.markPrice > 0n;
          const value = (raw: bigint | undefined) =>
            raw !== undefined && raw > 0n
              ? formatUnits(raw, m.quoteDecimals)
              : null;
          return {
            market,
            pool: m.poolAddress,
            mark: valid ? value(state.markPrice) : null,
            markValid: valid,
            bid: value(book?.bids[0]?.price),
            ask: value(book?.asks[0]?.price),
            index: value(state.indexPrice),
            oracleUpdatedAt:
              state.indexUpdatedAt > 0n
                ? Number(state.indexUpdatedAt) * 1000
                : null,
            observedAt,
            error: valid ? null : "The protocol reports an invalid mark feed.",
          };
        } catch {
          return emptyQuote(market, "This market's on-chain read failed.");
        }
      }),
    );
  }
  async snapshot(plan: Plan, account: Account): Promise<MarketSnapshot> {
    const m = await this.market(plan.market),
      owner = account.owner as Address,
      start = Date.now();
    if (this.key?.address.toLowerCase() === owner.toLowerCase())
      throw new Error("Use a dedicated operator key, never the owner key.");
    if ((await this.publicClient.getChainId()) !== CHAIN_ID)
      throw new Error("RPC chain is not Somnia Tokyo testnet.");
    const [state, margin, position, book, orders] = await Promise.all([
      this.sdk.client.getPerpState(m.poolAddress),
      this.sdk.client.getMarginAccount(m.marginBank, owner),
      this.sdk.client.getPerpPosition({
        marginBank: m.marginBank,
        account: owner,
        pool: m.poolAddress,
      }),
      this.sdk.client.getSpotOrderBook(m.poolAddress, { depth: 20 }),
      this.sdk.client.getOpenOrdersOnchain([m.poolAddress], owner),
    ]);
    const levels = plan.direction === "long" ? book.asks : book.bids;
    if (!book.asks[0] || !book.bids[0])
      throw new Error("The market has no two-sided book.");
    const touch =
      plan.direction === "long" ? book.asks[0].price : book.bids[0].price;
    const max = await this.sdk.client.getMaxPerpOrderSize({
      pool: m.poolAddress,
      marginBank: m.marginBank,
      account: owner,
      isBid: plan.direction === "long",
      price: touch,
      autoPull: false,
    });
    const permissions = this.key
      ? await Promise.all(
          ["0x80054449", "0xe37b444b", "0x364c2587"].map((s) =>
            this.publicClient.readContract({
              address: m.poolAddress,
              abi,
              functionName: "isOperatorAuthorized",
              args: [owner, this.key!.address, s as Hex],
            }),
          ),
        )
      : [false];
    const other = margin.activePerpPools.some(
      (p) => p.toLowerCase() !== m.poolAddress.toLowerCase(),
    );
    const permitted =
      state.markPriceOk &&
      max.priceable &&
      max.placeable &&
      permissions.every(Boolean) &&
      !other &&
      orders.orders.length === 0 &&
      margin.marginStatus === "Healthy";
    const bound =
      plan.direction === "long"
        ? parseUnits(plan.entryMax, m.quoteDecimals)
        : parseUnits(plan.entryMin, m.quoteDecimals);
    const depth = levels
      .filter((l) =>
        plan.direction === "long" ? l.price <= bound : l.price >= bound,
      )
      .reduce((sum, l) => sum + l.quantity, 0n);
    return {
      market: plan.market,
      bid: formatUnits(book.bids[0].price, m.quoteDecimals),
      ask: formatUnits(book.asks[0].price, m.quoteDecimals),
      mark: formatUnits(state.markPrice, m.quoteDecimals),
      markValid: state.markPriceOk && state.markPrice > 0n,
      tick: formatUnits(BigInt(m.tickSize), m.quoteDecimals),
      lot: formatUnits(BigInt(m.lotSize), m.baseDecimals),
      minQty: formatUnits(BigInt(m.minQuantity), m.baseDecimals),
      maxQty: formatUnits(max.priceable ? max.maxQuantity : 0n, m.baseDecimals),
      depth: formatUnits(depth, m.baseDecimals),
      fundingHourly: new Decimal(formatUnits(state.fundingRate, 18))
        .mul(3600)
        .div(state.fundingWindowSec || 28800)
        .toFixed(),
      observedAt: start,
      marginAvailable: formatUnits(margin.withdrawable, m.quoteDecimals),
      initialMarginRate: new Decimal(m.initialMarginBps).div(10000).toFixed(),
      position: formatUnits(position.size, m.baseDecimals),
      permitted,
      reason: !this.key
        ? "Configure the dedicated operator before testnet execution."
        : !permissions.every(Boolean)
          ? "Link the Pact operator to this wallet in dreamDEX."
          : other
            ? "Use a dedicated account without positions in other markets."
            : orders.orders.length
              ? "Cancel unrelated resting orders first."
              : !state.markPriceOk
                ? "The mark feed is stale."
                : `Protocol restriction: ${(max.priceable ? max.limitedBy : undefined) ?? margin.marginStatus}`,
      pool: m.poolAddress,
    };
  }
  async position(plan: Plan, account: Account): Promise<PositionObservation> {
    const start = Date.now();
    if ((await this.publicClient.getChainId()) !== CHAIN_ID)
      throw new Error("RPC chain is not Somnia Tokyo testnet.");
    const m = await this.market(plan.market);
    const [state, position] = await Promise.all([
      this.sdk.client.getPerpState(m.poolAddress),
      this.sdk.client.getPerpPosition({
        marginBank: m.marginBank,
        account: account.owner as Address,
        pool: m.poolAddress,
      }),
    ]);
    return {
      position: formatUnits(position.size, m.baseDecimals),
      mark: formatUnits(state.markPrice, m.quoteDecimals),
      markValid: state.markPriceOk && state.markPrice > 0n,
      observedAt: start,
    };
  }
  async prepare(
    intent: Intent,
    role: "entry" | "close",
  ): Promise<PreparedAction> {
    if (!this.key || !this.wallet) throw new Error("No operator configured.");
    if ((await this.publicClient.getChainId()) !== CHAIN_ID)
      throw new Error("Wrong RPC chain.");
    const m = await this.market(intent.plan.market),
      owner = intent.owner as Address;
    const execution = intent.execution ?? intent.decision;
    let isBid = intent.plan.direction === "long",
      quantity = parseUnits(execution.quantity, m.baseDecimals),
      price = parseUnits(execution.limit, m.quoteDecimals);
    if (role === "close") {
      const [p, book] = await Promise.all([
        this.sdk.client.getPerpPosition({
          marginBank: m.marginBank,
          account: owner,
          pool: m.poolAddress,
        }),
        this.sdk.client.getSpotOrderBook(m.poolAddress, { depth: 1 }),
      ]);
      const signed = isBid ? p.size : -p.size;
      if (signed !== quantity)
        throw new Error(
          "Position differs from the approved fill. Manual review is required.",
        );
      isBid = !isBid;
      const level = isBid ? book.asks[0] : book.bids[0];
      if (!level) throw new Error("No counterparty available for closing.");
      const slip = BigInt(intent.policy.slippageBps),
        tick = BigInt(m.tickSize);
      const raw = isBid
        ? (level.price * (10000n + slip)) / 10000n
        : (level.price * (10000n - slip)) / 10000n;
      price = isBid ? ((raw + tick - 1n) / tick) * tick : (raw / tick) * tick;
    }
    const args = [
      owner,
      isBid,
      BigInt("0x" + intent.planDigest.slice(0, 16)),
      price,
      quantity,
      BigInt(
        Math.floor(
          (role === "entry"
            ? Math.min(Date.now() + 60000, intent.plan.expiresAt)
            : Date.now() + 60000) / 1000,
        ),
      ) * 1000000000n,
      1,
      0,
      zeroAddress,
      0n,
    ] as const;
    await this.publicClient.simulateContract({
      address: m.poolAddress,
      abi,
      functionName: "placeOrderFor",
      args,
      account: this.key,
      gas: 10000000n,
    });
    const nonce = await this.publicClient.getTransactionCount({
      address: this.key.address,
      blockTag: "pending",
    });
    const request = await this.wallet.prepareTransactionRequest({
      account: this.key,
      to: m.poolAddress,
      data: encodeFunctionData({ abi, functionName: "placeOrderFor", args }),
      gas: 10000000n,
      nonce,
      chain: hidekiTestnet,
    });
    const raw = await this.wallet.signTransaction(request);
    return {
      hash: keccak256(raw),
      raw,
      pool: m.poolAddress,
      baseDecimals: m.baseDecimals,
      quoteDecimals: m.quoteDecimals,
      nonce,
      role,
    };
  }
  async broadcast(a: PreparedAction) {
    await this.publicClient.sendRawTransaction({
      serializedTransaction: a.raw as Hex,
    });
  }
  async observe(a: PreparedAction): Promise<Observation> {
    let r;
    try {
      r = await this.publicClient.getTransactionReceipt({
        hash: a.hash as Hex,
      });
    } catch (error) {
      if ((error as Error).name === "TransactionReceiptNotFoundError")
        return {
          state: "pending",
          fills: [],
          detail: "Waiting for a mined receipt. No replacement order is sent.",
        };
      throw error;
    }
    if (r.status === "reverted")
      return {
        state: "reverted",
        fills: [],
        detail: "The transaction reverted on chain.",
      };
    const decoded = decodePlaceOrder(r, a.pool as Address);
    const block = await this.publicClient.getBlock({
      blockNumber: r.blockNumber,
    });
    const fills = decoded.fills.map((f) => ({
      role: a.role,
      quantity: formatUnits(f.quantityFilled, a.baseDecimals),
      price: formatUnits(f.fillPrice, a.quoteDecimals),
      fee: "0",
      at: Number(block.timestamp) * 1000,
      txHash: a.hash,
    }));
    return {
      state: fills.length ? "filled" : "attention",
      fills,
      detail: fills.length
        ? "Fill events decoded from the confirmed transaction."
        : "Successful receipt without decoded fills. Review required.",
    };
  }
  async shutdown() {
    await this.sdk.close();
  }
}

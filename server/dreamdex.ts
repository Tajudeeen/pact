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
  parseTransaction,
  recoverTransactionAddress,
  type Address,
  type Hex,
  type TransactionSerialized,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ReadinessCheck, TradingReadiness } from "../src/core/readiness";
import Decimal from "decimal.js";
import { rpcSocketConstructor } from "./socket";
import type {
  Account,
  Intent,
  MarketSnapshot,
  Plan,
  Decision,
  EntrySafety,
} from "../src/core/types";
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
import { confirmedOrder, EXECUTION_CHAIN_ID } from "./chain-proof";
import { assertExecutionNetwork } from "./release";
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
  constructor(
    privateKey?: Hex,
    socketConstructor = rpcSocketConstructor(),
    network = process.env.PACT_NETWORK ?? "tokyo-testnet",
  ) {
    assertExecutionNetwork(network);
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
  async readiness(
    ownerAddress: string,
    symbol: string,
  ): Promise<TradingReadiness> {
    const checkedAt = Date.now();
    if ((await this.publicClient.getChainId()) !== CHAIN_ID)
      throw new Error("RPC chain is not Somnia Tokyo testnet.");
    const m = await this.market(symbol),
      owner = ownerAddress as Address;
    const operator = this.key?.address ?? null;
    const [state, margin, position, orders, book, permissions, gas] =
      await Promise.all([
        this.sdk.client.getPerpState(m.poolAddress),
        this.sdk.client.getMarginAccount(m.marginBank, owner),
        this.sdk.client.getPerpPosition({
          marginBank: m.marginBank,
          account: owner,
          pool: m.poolAddress,
        }),
        this.sdk.client.getOpenOrdersOnchain([m.poolAddress], owner),
        this.sdk.client.getSpotOrderBook(m.poolAddress, { depth: 1 }),
        operator
          ? this.operatorPermissions(owner, m.poolAddress)
          : Promise.resolve([false, false, false]),
        operator
          ? Promise.all([
              this.publicClient.getBalance({ address: operator }),
              this.publicClient.getGasPrice(),
            ])
          : Promise.resolve([0n, 0n]),
      ]);
    const checks: ReadinessCheck[] = [];
    const check = (id: string, label: string, pass: boolean, detail: string) =>
      checks.push({ id, label, status: pass ? "pass" : "blocked", detail });
    check(
      "operator",
      "Separate operator",
      !!operator && operator.toLowerCase() !== owner.toLowerCase(),
      operator
        ? `Owner ${owner}. Operator ${operator}.`
        : "Configure a separate Pact operator.",
    );
    ["Place orders", "Cancel orders", "Reduce positions"].forEach((label, n) =>
      check(
        `permission-${n}`,
        label,
        permissions[n] === true,
        permissions[n]
          ? "Operator permission observed for this market."
          : "Link the operator with this permission in dreamDEX for this market.",
      ),
    );
    const gasReserve = gas[1] * 20000000n;
    check(
      "gas",
      "Operator testnet gas",
      gasReserve > 0n && gas[0] >= gasReserve,
      `${formatUnits(gas[0], 18)} STT available. Current two-transaction reserve: ${formatUnits(gasReserve, 18)} STT, using two 10,000,000 gas limits. Fees can change.`,
    );
    check(
      "margin",
      "Perps margin",
      margin.marginStatus === "Healthy" && margin.withdrawable > 0n,
      `${formatUnits(margin.withdrawable, m.quoteDecimals)} USDso withdrawable. Margin status: ${margin.marginStatus}. Order sizing is checked separately.`,
    );
    check(
      "position",
      "Dedicated account is flat",
      position.size === 0n &&
        !margin.activePerpPools.some(
          (p) => p.toLowerCase() !== m.poolAddress.toLowerCase(),
        ),
      "Close outside positions and keep other bots out of this account before a new Pact entry.",
    );
    check(
      "orders",
      "No resting orders in this market",
      orders.orders.length === 0,
      `${orders.orders.length} resting orders observed in the selected market.`,
    );
    check(
      "mark",
      "Valid mark",
      state.markPriceOk && state.markPrice > 0n,
      state.markPriceOk && state.markPrice > 0n
        ? "The protocol reports a valid positive mark."
        : "Wait for a valid positive protocol mark.",
    );
    check(
      "book",
      "Two-sided order book",
      !!book.asks[0] &&
        !!book.bids[0] &&
        book.asks[0].price > 0n &&
        book.bids[0].price > 0n,
      "A two-sided book is needed. Your actual order must also pass size and fill-or-kill simulation.",
    );
    return {
      readOnly: true,
      chainId: 50383,
      owner,
      operator,
      market: symbol,
      pool: m.poolAddress,
      checkedAt,
      validForMs: Math.max(0, 30000 - (Date.now() - checkedAt)),
      ready: checks.every((c) => c.status === "pass"),
      checks,
    };
  }
  private operatorPermissions(owner: Address, pool: Address) {
    return Promise.all(
      ["0x80054449", "0xe37b444b", "0x364c2587"].map((s) =>
        this.publicClient.readContract({
          address: pool,
          abi,
          functionName: "isOperatorAuthorized",
          args: [owner, this.key!.address, s as Hex],
        }),
      ),
    );
  }
  async entrySafety(
    plan: Plan,
    account: Account,
    decision: Decision,
  ): Promise<EntrySafety> {
    const observedAt = Date.now();
    if ((await this.publicClient.getChainId()) !== CHAIN_ID)
      throw new Error("Wrong entry projection network.");
    const m = await this.market(plan.market);
    const quantity = parseUnits(decision.quantity, m.baseDecimals);
    const projected = await this.sdk.client.previewPerpLiquidationPrice({
      pool: m.poolAddress,
      marginBank: m.marginBank,
      account: account.owner as Address,
      isBid: plan.direction === "long",
      quantity,
      price: parseUnits(decision.limit, m.quoteDecimals),
    });
    const base = {
      minimumGapBps: 100,
      asOfBlock: projected.asOfBlock.toString(),
      observedAt,
    };
    if (!projected.priceable)
      return {
        ...base,
        allowed: false,
        reason: "A valid liquidation projection is unavailable.",
        projectedLiquidationPrice: null,
      };
    const liquidation = projected.projectedLiquidationPrice;
    const price =
      liquidation === null ? null : formatUnits(liquidation, m.quoteDecimals);
    const expected = plan.direction === "long" ? quantity : -quantity;
    const stop = new Decimal(plan.stop);
    const gap = stop.mul("0.01");
    const allowed =
      projected.currentSize === 0n &&
      projected.projectedSize === expected &&
      projected.projectedEquity > 0n &&
      liquidation !== null &&
      liquidation >= 0n &&
      (plan.direction === "long"
        ? new Decimal(price!).lte(stop.minus(gap))
        : new Decimal(price!).gte(stop.plus(gap)));
    return {
      ...base,
      allowed,
      projectedLiquidationPrice: price,
      reason: allowed
        ? "Projected liquidation is beyond the stop with at least a 1% stop-price buffer."
        : "The projected account is not flat before entry, or liquidation is too close to the stop. Add margin or change the setup and preview again.",
    };
  }
  async snapshot(plan: Plan, account: Account): Promise<MarketSnapshot> {
    const m = await this.market(plan.market),
      owner = account.owner as Address,
      start = Date.now();
    if (this.key?.address.toLowerCase() === owner.toLowerCase())
      throw new Error("Use a dedicated operator key, never the owner key.");
    if ((await this.publicClient.getChainId()) !== CHAIN_ID)
      throw new Error("RPC chain is not Somnia Tokyo testnet.");
    const [state, margin, position, book, orders, health, risk] =
      await Promise.all([
        this.sdk.client.getPerpState(m.poolAddress),
        this.sdk.client.getMarginAccount(m.marginBank, owner),
        this.sdk.client.getPerpPosition({
          marginBank: m.marginBank,
          account: owner,
          pool: m.poolAddress,
        }),
        this.sdk.client.getSpotOrderBook(m.poolAddress, { depth: 20 }),
        this.sdk.client.getOpenOrdersOnchain([m.poolAddress], owner),
        this.sdk.client.getPerpHealthSnapshot(m.poolAddress),
        this.sdk.client.getPerpRiskParams(m.poolAddress),
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
      ? await this.operatorPermissions(owner, m.poolAddress)
      : [false];
    const other = margin.activePerpPools.some(
      (p) => p.toLowerCase() !== m.poolAddress.toLowerCase(),
    );
    const permitted =
      state.markPriceOk &&
      health.priceable &&
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
      markValid: state.markPriceOk && state.markPrice > 0n && health.priceable,
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
      initialMarginRate: new Decimal(
        health.priceable
          ? health.effectiveImfBps.toString()
          : m.initialMarginBps,
      )
        .div(10000)
        .toFixed(),
      takerFeeRate: new Decimal(risk.takerFeeBpsTimes1k.toString())
        .div(10000000)
        .toFixed(),
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
    const simulation = await this.publicClient.simulateContract({
      address: m.poolAddress,
      abi,
      functionName: "placeOrderFor",
      args,
      account: this.key,
      gas: 10000000n,
    });
    if (simulation.result[0] !== true)
      throw new Error(
        "The protocol simulation refused this fill-or-kill order. Nothing signed or broadcast.",
      );
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
    const fee = request.maxFeePerGas ?? request.gasPrice;
    const balance = await this.publicClient.getBalance({
      address: this.key.address,
    });
    if (fee === undefined || fee <= 0n || balance < 10000000n * fee)
      throw new Error(
        "Operator STT balance cannot cover this transaction's gas ceiling. Fund the separate operator before retrying.",
      );
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
    await this.signedAction(a);
    if ((await this.publicClient.getChainId()) !== EXECUTION_CHAIN_ID)
      throw new Error("Wrong broadcast network. Nothing sent.");
    await this.publicClient.sendRawTransaction({
      serializedTransaction: a.raw as Hex,
    });
  }
  private async signedAction(a: PreparedAction) {
    const raw = a.raw as TransactionSerialized;
    const tx = parseTransaction(raw);
    const operator = await recoverTransactionAddress({
      serializedTransaction: raw,
    });
    if (
      keccak256(raw) !== a.hash ||
      tx.chainId !== CHAIN_ID ||
      tx.to?.toLowerCase() !== a.pool.toLowerCase() ||
      tx.nonce !== a.nonce ||
      (tx.value ?? 0n) !== 0n ||
      !tx.data ||
      !this.key ||
      operator.toLowerCase() !== this.key.address.toLowerCase()
    )
      throw new Error(
        "Persisted signed order identity or execution network is invalid. Nothing sent.",
      );
    return {
      hash: a.hash as Hex,
      pool: a.pool as Address,
      operator,
      input: tx.data,
      nonce: a.nonce,
      role: a.role,
    };
  }
  async observe(a: PreparedAction): Promise<Observation> {
    let result;
    try {
      result = await confirmedOrder(
        this.publicClient,
        await this.signedAction(a),
      );
    } catch (error) {
      if ((error as Error).name === "TransactionReceiptNotFoundError")
        return {
          state: "pending",
          fills: [],
          detail: "Waiting for a mined receipt. No replacement order is sent.",
        };
      throw error;
    }
    if (result.state === "pending")
      return {
        state: "pending",
        fills: [],
        detail:
          "Waiting for two canonical block confirmations. No replacement order is sent.",
      };
    if (result.state === "reverted")
      return {
        state: "reverted",
        fills: [],
        detail: "The transaction reverted on chain.",
        proof: result.proof,
      };
    const decoded = decodePlaceOrder(result.receipt, a.pool as Address);
    const order = result.order!;
    if (
      !decoded.fills.length ||
      decoded.fills.some((f) =>
        order[1] ? f.fillPrice > order[3] : f.fillPrice < order[3],
      ) ||
      decoded.fills.reduce((sum, f) => sum + f.quantityFilled, 0n) !== order[4]
    )
      return {
        state: "attention",
        fills: [],
        proof: result.proof,
        detail:
          "Confirmed fills do not match the signed FOK quantity and price bound.",
      };
    const fills = decoded.fills.map((f) => ({
      role: a.role,
      quantity: formatUnits(f.quantityFilled, a.baseDecimals),
      price: formatUnits(f.fillPrice, a.quoteDecimals),
      fee: null,
      at: result.at,
      txHash: a.hash,
    }));
    return {
      state: fills.length ? "filled" : "attention",
      fills,
      detail: fills.length
        ? "Fill events decoded from the confirmed transaction."
        : "Successful receipt without decoded fills. Review required.",
      proof: result.proof,
    };
  }
  async shutdown() {
    await this.sdk.close();
  }
}

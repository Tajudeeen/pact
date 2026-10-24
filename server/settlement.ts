import { marginBankEventsAbi } from "@somnia-chain/markets-sdk";
import {
  decodeEventLog,
  formatUnits,
  type Address,
  type Hex,
  type Log,
  type TransactionReceipt,
} from "viem";
import type {
  ChainProof,
  Settlement,
  SettlementEvent,
} from "../src/core/types";
export interface SettlementReader {
  getChainId(): Promise<number>;
  getTransactionReceipt(args: { hash: Hex }): Promise<TransactionReceipt>;
  getBlock(args: { blockNumber: bigint }): Promise<{ hash: Hex | null }>;
  getLogs(args: {
    address: Address;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<Log[]>;
}
export interface SettlementContext {
  owner: Address;
  pool: Address;
  marginBank: Address;
  quoteDecimals: number;
  entry: ChainProof;
  close: ChainProof;
  expectedPosition: bigint;
}
const same = (a: string | null, b: string) =>
  a?.toLowerCase() === b.toLowerCase();
export async function scanSettlement(
  reader: SettlementReader,
  ctx: SettlementContext,
  previous?: Settlement,
): Promise<Settlement> {
  if ((await reader.getChainId()) !== 50383)
    throw new Error("Wrong settlement network.");
  const [entry, close] = await Promise.all([
    reader.getTransactionReceipt({ hash: ctx.entry.hash as Hex }),
    reader.getTransactionReceipt({ hash: ctx.close.hash as Hex }),
  ]);
  const [entryBlock, closeBlock] = await Promise.all([
    reader.getBlock({ blockNumber: entry.blockNumber }),
    reader.getBlock({ blockNumber: close.blockNumber }),
  ]);
  if (
    entry.status !== "success" ||
    close.status !== "success" ||
    !same(entry.transactionHash, ctx.entry.hash) ||
    !same(close.transactionHash, ctx.close.hash) ||
    !same(entryBlock.hash, ctx.entry.blockHash) ||
    !same(closeBlock.hash, ctx.close.blockHash) ||
    !same(entry.blockHash, entryBlock.hash!) ||
    !same(close.blockHash, closeBlock.hash!) ||
    entry.blockNumber !== BigInt(ctx.entry.blockNumber) ||
    close.blockNumber !== BigInt(ctx.close.blockNumber) ||
    entry.blockNumber > close.blockNumber ||
    (entry.blockNumber === close.blockNumber &&
      entry.transactionIndex >= close.transactionIndex)
  )
    throw new Error(
      "Settlement anchors are reverted, changed, or out of order. Accounting remains unverified.",
    );
  let state: Settlement = {
    status: "pending",
    owner: ctx.owner,
    pool: ctx.pool,
    marginBank: ctx.marginBank,
    quoteDecimals: ctx.quoteDecimals,
    fromBlock: entry.blockNumber.toString(),
    toBlock: close.blockNumber.toString(),
    coveredThrough: null,
    coveredHash: null,
    pageSize: 2000,
    events: [],
    fees: "0",
    rebates: "0",
    fundingPaid: "0",
    realizedPnl: "0",
    checkedAt: Date.now(),
  };
  if (
    previous &&
    same(previous.owner, ctx.owner) &&
    same(previous.pool, ctx.pool) &&
    same(previous.marginBank, ctx.marginBank) &&
    previous.quoteDecimals === ctx.quoteDecimals &&
    previous.fromBlock === state.fromBlock &&
    previous.toBlock === state.toBlock &&
    Number.isInteger(previous.pageSize) &&
    previous.pageSize >= 1 &&
    previous.pageSize <= 2000
  ) {
    const prefixValid =
      previous.coveredThrough && previous.coveredHash
        ? BigInt(previous.coveredThrough) >= entry.blockNumber &&
          BigInt(previous.coveredThrough) <= close.blockNumber &&
          same(
            (
              await reader.getBlock({
                blockNumber: BigInt(previous.coveredThrough),
              })
            ).hash,
            previous.coveredHash,
          )
        : previous.coveredThrough === null &&
          previous.coveredHash === null &&
          previous.events.length === 0;
    if (prefixValid)
      state = {
        ...previous,
        status: "pending",
        error: undefined,
        checkedAt: Date.now(),
      };
  }
  const from =
    state.coveredThrough === null
      ? entry.blockNumber
      : BigInt(state.coveredThrough) + 1n;
  const to =
    from + BigInt(state.pageSize) - 1n < close.blockNumber
      ? from + BigInt(state.pageSize) - 1n
      : close.blockNumber;
  if (from <= to) {
    let logs: Log[];
    try {
      logs = await reader.getLogs({
        address: ctx.marginBank,
        fromBlock: from,
        toBlock: to,
      });
      if (logs.length >= 5000)
        throw new Error("Dense log range. Retrying a smaller page.");
    } catch {
      return {
        ...state,
        pageSize: Math.max(1, Math.floor(state.pageSize / 2)),
        error:
          "Bank log read failed or exceeded the page limit. Accounting will retry without skipping blocks.",
      };
    }
    const endpoint = await reader.getBlock({ blockNumber: to });
    const expectedEndpoint =
      to === close.blockNumber ? ctx.close.blockHash : endpoint.hash;
    if (!endpoint.hash || !same(endpoint.hash, expectedEndpoint!))
      throw new Error("Settlement page changed branch.");
    const found: SettlementEvent[] = [];
    for (const log of logs) {
      if (
        !same(log.address, ctx.marginBank) ||
        log.blockNumber === null ||
        log.blockNumber < from ||
        log.blockNumber > to ||
        log.logIndex === null ||
        log.transactionIndex === null ||
        !log.blockHash ||
        !log.transactionHash ||
        log.removed
      )
        throw new Error(
          "Incomplete or out-of-range bank log. No accounting page accepted.",
        );
      if (
        (log.blockNumber === entry.blockNumber &&
          log.transactionIndex < entry.transactionIndex) ||
        (log.blockNumber === close.blockNumber &&
          log.transactionIndex > close.transactionIndex)
      )
        continue;
      let event;
      try {
        event = decodeEventLog({
          abi: marginBankEventsAbi,
          data: log.data,
          topics: log.topics,
          strict: true,
        });
      } catch {
        if (
          log.topics[1]?.toLowerCase() ===
          "0x" + ctx.owner.slice(2).toLowerCase().padStart(64, "0")
        )
          throw new Error(
            "Unsupported bank event for this owner. No complete accounting is claimed.",
          );
        continue;
      }
      const a = event.args;
      if (
        event.eventName === "PositionUpdated" ||
        event.eventName === "FeeCharged" ||
        event.eventName === "RebatePaid" ||
        event.eventName === "FundingSettled"
      ) {
        const args = event.args;
        if (!same(args.account, ctx.owner)) continue;
        if (!same(args.perpPool, ctx.pool))
          throw new Error(
            "Another market changed this dedicated account during the trade. Accounting needs review.",
          );
        const kind =
          event.eventName === "PositionUpdated"
            ? "position"
            : event.eventName === "FundingSettled"
              ? "funding"
              : event.eventName === "FeeCharged"
                ? "fee"
                : "rebate";
        if (
          kind !== "funding" &&
          !same(log.transactionHash, ctx.entry.hash) &&
          !same(log.transactionHash, ctx.close.hash)
        )
          throw new Error(
            "Outside position or fee activity prevents attribution to this Pact trade.",
          );
        found.push({
          kind,
          block: log.blockNumber.toString(),
          blockHash: log.blockHash,
          transactionHash: log.transactionHash,
          transactionIndex: log.transactionIndex,
          logIndex: log.logIndex,
          amount:
            event.eventName === "PositionUpdated"
              ? event.args.realizedPnl.toString()
              : event.eventName === "FundingSettled"
                ? event.args.payment.toString()
                : event.args.amount.toString(),
          ...(event.eventName === "PositionUpdated"
            ? { position: event.args.newSize.toString() }
            : {}),
        });
      } else if (
        event.eventName === "BuilderFeeCharged" &&
        same(event.args.payer, ctx.owner) &&
        event.args.amount !== 0n
      )
        throw new Error("Unexpected builder fee. Accounting needs review.");
      else if (
        "account" in a &&
        typeof a.account === "string" &&
        same(a.account, ctx.owner) &&
        ![
          "Deposited",
          "DepositedFor",
          "Withdrawn",
          "CollateralLocked",
          "CollateralUnlocked",
        ].includes(event.eventName)
      )
        throw new Error(
          "Unsupported account settlement activity needs manual review.",
        );
    }
    const blocks = [...new Set(found.map((e) => e.block))];
    const hashes: (readonly [string, Hex | null])[] = [];
    for (let n = 0; n < blocks.length; n += 8)
      hashes.push(
        ...(await Promise.all(
          blocks
            .slice(n, n + 8)
            .map(
              async (b) =>
                [
                  b,
                  (await reader.getBlock({ blockNumber: BigInt(b) })).hash,
                ] as const,
            ),
        )),
      );
    if (!same((await reader.getBlock({ blockNumber: to })).hash, endpoint.hash))
      throw new Error("Settlement page changed branch during scanning.");
    if (
      found.some(
        (e) => !same(hashes.find(([b]) => b === e.block)![1], e.blockHash),
      )
    )
      throw new Error("A settlement event is no longer canonical.");
    const merged = [...state.events, ...found].sort((a, b) =>
      BigInt(a.block) < BigInt(b.block)
        ? -1
        : BigInt(a.block) > BigInt(b.block)
          ? 1
          : a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex,
    );
    const ids = new Set<string>();
    for (const e of merged) {
      const id = e.transactionHash.toLowerCase() + ":" + e.logIndex;
      if (ids.has(id))
        throw new Error("Duplicate bank event. No totals accepted.");
      ids.add(id);
    }
    if (merged.length > 20000)
      throw new Error("Trade accounting exceeds the supported event limit.");
    state = {
      ...state,
      events: merged,
      coveredThrough: to.toString(),
      coveredHash: endpoint.hash,
    };
  }
  const sum = (kind: SettlementEvent["kind"]) =>
    state.events
      .filter((e) => e.kind === kind)
      .reduce((n, e) => n + BigInt(e.amount), 0n);
  state = {
    ...state,
    fees: formatUnits(sum("fee"), ctx.quoteDecimals),
    rebates: formatUnits(sum("rebate"), ctx.quoteDecimals),
    fundingPaid: formatUnits(sum("funding"), ctx.quoteDecimals),
    realizedPnl: formatUnits(sum("position"), ctx.quoteDecimals),
  };
  if (state.coveredThrough === close.blockNumber.toString()) {
    const entryPositions = state.events.filter(
      (e) => e.kind === "position" && same(e.transactionHash, ctx.entry.hash),
    );
    const closePositions = state.events.filter(
      (e) => e.kind === "position" && same(e.transactionHash, ctx.close.hash),
    );
    if (
      !entryPositions.length ||
      !closePositions.length ||
      BigInt(entryPositions.at(-1)!.position!) !== ctx.expectedPosition ||
      BigInt(closePositions.at(-1)!.position!) !== 0n
    )
      throw new Error(
        "Bank position events do not prove the expected entry and full close.",
      );
    state.status = "complete";
  }
  return state;
}

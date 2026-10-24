import type {
  Account,
  Intent,
  MarketSnapshot,
  Plan,
  TradeFill,
  Decision,
  EntrySafety,
  ChainProof,
  Settlement,
} from "../src/core/types";
import type { TradingReadiness } from "../src/core/readiness";
export interface PreparedAction {
  hash: string;
  raw: string;
  pool: string;
  baseDecimals: number;
  quoteDecimals: number;
  nonce: number;
  role: "entry" | "close";
  recordedAt?: number;
}
export interface PositionObservation {
  position: string;
  mark: string;
  markValid: boolean;
  observedAt: number;
}
export type Observation = {
  state: "pending" | "reverted" | "filled" | "attention";
  fills: TradeFill[];
  detail: string;
  proof?: ChainProof;
};
export interface Venue {
  settlement?(intent: Intent): Promise<Settlement>;
  entrySafety?(
    plan: Plan,
    account: Account,
    decision: Decision,
  ): Promise<EntrySafety>;
  readiness?(owner: string, market: string): Promise<TradingReadiness>;
  network?(): Promise<{
    chainId: number;
    marketCount: number;
    markValid: boolean;
    checkedAt: string;
  }>;
  snapshot(plan: Plan, account: Account): Promise<MarketSnapshot>;
  position(plan: Plan, account: Account): Promise<PositionObservation>;
  prepare(intent: Intent, role: "entry" | "close"): Promise<PreparedAction>;
  broadcast(action: PreparedAction): Promise<void>;
  observe(action: PreparedAction): Promise<Observation>;
  shutdown(): Promise<void>;
}

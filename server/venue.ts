import type {
  Account,
  Intent,
  MarketSnapshot,
  Plan,
  TradeFill,
} from "../src/core/types";
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
};
export interface Venue {
  snapshot(plan: Plan, account: Account): Promise<MarketSnapshot>;
  position(plan: Plan, account: Account): Promise<PositionObservation>;
  prepare(intent: Intent, role: "entry" | "close"): Promise<PreparedAction>;
  broadcast(action: PreparedAction): Promise<void>;
  observe(action: PreparedAction): Promise<Observation>;
  shutdown(): Promise<void>;
}

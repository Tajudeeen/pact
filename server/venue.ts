import type {
  Account,
  Decision,
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
}
export type Observation = {
  state: "pending" | "reverted" | "filled" | "attention";
  fills: TradeFill[];
  detail: string;
};
export interface Venue {
  snapshot(plan: Plan, account: Account): Promise<MarketSnapshot>;
  prepare(intent: Intent, role: "entry" | "close"): Promise<PreparedAction>;
  broadcast(action: PreparedAction): Promise<void>;
  observe(action: PreparedAction): Promise<Observation>;
  shutdown(): Promise<void>;
}

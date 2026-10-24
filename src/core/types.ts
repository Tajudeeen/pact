export type Mode = "replay" | "testnet";
export type Direction = "long" | "short";
export type Scenario = "clean" | "late" | "stale" | "thin" | "lost-response";
export interface Plan {
  id: string;
  version: number;
  digest: string;
  author: string;
  title: string;
  market: string;
  direction: Direction;
  entryMin: string;
  entryMax: string;
  stop: string;
  target: string;
  expiresAt: number;
  rationale: string;
  mode: Mode;
  createdAt: number;
  revoked: boolean;
}
export interface Policy {
  risk: string;
  totalRisk: string;
  dailyLoss: string;
  slippageBps: number;
  fundingHours: number;
  minRewardRisk: string;
  maxNotional: string;
}
export interface MarketSnapshot {
  market: string;
  bid: string;
  ask: string;
  mark: string;
  tick: string;
  lot: string;
  minQty: string;
  maxQty: string;
  depth: string;
  fundingHourly: string;
  observedAt: number;
  marginAvailable: string;
  initialMarginRate: string;
  position: string;
  permitted: boolean;
  reason?: string;
  pool?: string;
}
export interface Decision {
  outcome: "ready" | "resized" | "blocked";
  reason: string;
  message: string;
  quantity: string;
  limit: string;
  notional: string;
  plannedLoss: string;
  stopLoss: string;
  slippageReserve: string;
  fundingReserve: string;
  rewardRisk: string;
  budget: string;
  limitedBy: string;
  snapshot: MarketSnapshot;
  evaluatedAt: number;
}
export interface Account {
  id: string;
  owner: string;
  label: string;
  mode: Mode;
  scenario: Scenario;
  balance: string;
}
export type IntentState =
  | "reserved"
  | "submitted"
  | "unknown"
  | "open"
  | "blocked"
  | "rejected"
  | "closing"
  | "closed"
  | "attention";
export interface TradeFill {
  role: "entry" | "close";
  quantity: string;
  price: string;
  fee: string;
  at: number;
  txHash?: string;
  logIndex?: number;
}
export interface Intent {
  id: string;
  owner: string;
  accountId: string;
  planId: string;
  planVersion: number;
  planDigest: string;
  mode: Mode;
  state: IntentState;
  decision: Decision;
  plan: Plan;
  policy: Policy;
  createdAt: number;
  updatedAt: number;
  protection: "not_armed" | "monitored" | "native_verified" | "degraded";
  lastMonitorAt?: number;
  error?: string;
  txHash?: string;
  closeHash?: string;
  fills: TradeFill[];
  events: TradeEvent[];
}
export interface TradeEvent {
  at: number;
  type: string;
  detail: string;
}
export interface Receipt {
  id: string;
  mode: Mode;
  chainId: number | null;
  state: IntentState;
  planDigest: string;
  planVersion: number;
  account: string;
  market: string;
  direction: Direction;
  approvedQuantity: string;
  approvedLimit: string;
  fills: TradeFill[];
  grossPnl: string | null;
  tradingFees: string;
  fundingPaid: string | null;
  netPnl: string | null;
  incomplete: string[];
  transactions: string[];
  protection: string;
  note: string;
}
export const DEFAULT_POLICY: Policy = {
  risk: "10",
  totalRisk: "30",
  dailyLoss: "50",
  slippageBps: 20,
  fundingHours: 8,
  minRewardRisk: "1.5",
  maxNotional: "500",
};

export interface ReadinessCheck {
  id: string;
  label: string;
  status: "pass" | "blocked";
  detail: string;
}
export interface TradingReadiness {
  readOnly: true;
  chainId: 50383;
  owner: string;
  operator: string | null;
  market: string;
  pool: string;
  checkedAt: number;
  validForMs: number;
  ready: boolean;
  checks: ReadinessCheck[];
}

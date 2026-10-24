import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Download,
  ShieldCheck,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import { formatUnits } from "viem";
import type { Intent, Receipt } from "../core/types";
import { api, usd, price, short } from "../api";
import { useApp, useLoad } from "../state";
import { Badge, ErrorBox, Loading, StartGate } from "../components/ui";
export function OrderPage() {
  const { id = "" } = useParams(),
    { session } = useApp();
  const data = useLoad(
    "order:" + id + session?.owner,
    (s) => api<Intent>("/intents/" + id, { signal: s }),
    1500,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const i = data.value;
  const close = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/intents/" + id + "/close", { method: "POST", body: {} });
      data.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const recover = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/intents/" + id + "/recover", { method: "POST", body: {} });
      data.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    try {
      const receipt = await api<Receipt>("/intents/" + id + "/receipt");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(receipt, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "pact-receipt-" + id + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <StartGate>
      <Link className="back" to="/app/positions">
        <ArrowLeft size={15} /> My orders
      </Link>
      <ErrorBox message={data.error ?? error} />
      {!i ? (
        <Loading />
      ) : (
        <>
          <div className="plan-heading">
            <div>
              <div className="eyebrow">APPROVAL → OBSERVATION → EVIDENCE</div>
              <h1>Your decision, recorded.</h1>
              <p>
                {i.plan.title} · {i.plan.market}
              </p>
            </div>
            <Badge tone={i.mode === "replay" ? "neutral" : "amber"}>
              {i.mode === "replay"
                ? "Practice · no chain transaction"
                : "Tokyo testnet"}
            </Badge>
          </div>
          <div className="order-status panel" data-state={i.state}>
            <div className="status-icon">
              {i.state === "closed" ? (
                <CheckCircle2 size={28} />
              ) : (
                <Clock size={28} />
              )}
            </div>
            <div>
              <span className="eyebrow">CURRENT OBSERVED STATE</span>
              <h2>
                {
                  {
                    reserved: "Approval recorded",
                    submitted: "Submitted, waiting for evidence",
                    unknown: "Response uncertain, checking evidence",
                    open: "Fill observed, position open",
                    closed: "Close reconciled",
                    blocked: "Conditions changed, nothing sent",
                    rejected: "Transaction rejected",
                    closing: "Close submitted",
                    attention: "Needs attention, checking recovery",
                  }[i.state]
                }
              </h2>
              <p>
                {i.state === "unknown"
                  ? "The existing action stays reserved. Pact won’t send a second order to guess what happened."
                  : i.state === "open"
                    ? "The fill is recorded. Monitored exits are separate from native stop orders."
                    : i.events.at(-1)?.detail}
              </p>
            </div>
          </div>
          <div className="order-layout">
            <section className="panel">
              <div className="section-top">
                <h2>The execution trail</h2>
                <Badge tone="neutral">{i.events.length} events</Badge>
              </div>
              <ol className="timeline">
                {i.events.map((e, n) => (
                  <li key={n}>
                    <span className="timeline-dot" />
                    <div>
                      <small>{new Date(e.at).toLocaleTimeString()}</small>
                      <strong>{e.type.replaceAll("_", " ")}</strong>
                      <p>{e.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {i.error && <ErrorBox message={i.error} />}
            </section>
            <section className="panel">
              <h2>What you approved</h2>
              <dl className="cost-breakdown">
                <div>
                  <dt>Quantity</dt>
                  <dd>{i.decision.quantity}</dd>
                </div>
                <div>
                  <dt>Price limit</dt>
                  <dd>{price(i.decision.limit)}</dd>
                </div>
                <div>
                  <dt>Notional</dt>
                  <dd>{usd(i.decision.notional)}</dd>
                </div>
                <div>
                  <dt>Planned risk</dt>
                  <dd>{usd(i.decision.plannedLoss)}</dd>
                </div>
                <div>
                  <dt>Setup version</dt>
                  <dd>v{i.planVersion}</dd>
                </div>
                <div>
                  <dt>Protection</dt>
                  <dd>
                    {i.mode === "testnet" &&
                    i.state === "open" &&
                    Date.now() - (i.lastMonitorAt ?? 0) > 10000
                      ? "monitoring stale"
                      : i.protection.replaceAll("_", " ")}
                  </dd>
                </div>
              </dl>
              <p className="tiny muted">
                {i.mode === "replay"
                  ? "Replay simulates fills and closes at the entry price. No profit or blockchain activity is invented."
                  : "Monitored exits only act while Pact is running. Linked-key closes use position-sized opposing orders, with a dedicated-account requirement."}
              </p>
              <div className="receipt-actions">
                {i.state === "attention" && (
                  <>
                    <p className="tiny muted" role="status">
                      {i.error ??
                        "Pact needs a fresh transaction and position check."}{" "}
                      Pact keeps checking automatically. Recovery checks the
                      saved transaction and position without sending another
                      order.
                    </p>
                    <button
                      className="button primary full"
                      disabled={busy}
                      onClick={() => void recover()}
                    >
                      {busy ? "Checking…" : "Check recovery"}
                    </button>
                    <a
                      className="button outline full"
                      href="https://app.testnet.dreamdex.io"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Inspect position in dreamDEX <ArrowUpRight size={16} />
                    </a>
                  </>
                )}
                <button
                  className="button outline full"
                  onClick={() => void download()}
                >
                  <Download size={16} /> Download receipt
                </button>
                {i.state === "open" && (
                  <button
                    className="button primary full"
                    disabled={busy}
                    onClick={() => void close()}
                  >
                    {busy
                      ? "Closing…"
                      : i.mode === "replay"
                        ? "Close practice position"
                        : "Close testnet position"}
                    <ArrowUpRight size={16} />
                  </button>
                )}
              </div>
              <div className="digest-label">
                PLAN DIGEST <code>{short(i.planDigest)}</code>
              </div>
              {[i.txHash, i.closeHash].filter(Boolean).map((h) => (
                <a
                  key={h}
                  href={"https://explorer.testnet.somnia.network/tokyo/tx/" + h}
                  target="_blank"
                  rel="noreferrer"
                  className="tx-link"
                >
                  {short(h!)} <ArrowUpRight size={15} />
                </a>
              ))}
            </section>
          </div>
          <section className="panel fills-panel">
            <h2>Chain verification</h2>
            {i.chainProofs?.length ? (
              <>
                <p className="tiny muted">
                  Each record matched the saved transaction's sender, pool,
                  nonce and calldata, with two or more canonical block
                  confirmations. Download the receipt to check the execution
                  independently.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Leg</th>
                        <th>Block</th>
                        <th>Confirmations at check</th>
                        <th>Actual gas cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {i.chainProofs.map((p) => (
                        <tr key={p.hash}>
                          <td>{p.role}</td>
                          <td>{p.blockNumber}</td>
                          <td>{p.confirmations}</td>
                          <td>
                            {formatUnits(BigInt(p.gasCostNativeWei), 18)} STT
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="muted">
                {i.mode === "replay"
                  ? "Practice has no blockchain proof."
                  : "No canonical transaction proof has been recorded yet. A transaction hash alone does not establish a fill."}
              </p>
            )}
            <p className="tiny muted">
              Live trading fees and funding remain unattributed. Native gas is
              shown separately and isn't converted into USDso PnL.
            </p>
          </section>
          <section className="panel fills-panel">
            <h2>Observed fills</h2>
            {!i.fills.length ? (
              <p className="muted">
                No fill is claimed until execution evidence is observed.
              </p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Leg</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>Trading fee</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {i.fills.map((f, n) => (
                      <tr key={n}>
                        <td>{f.role}</td>
                        <td>{f.quantity}</td>
                        <td>{price(f.price)}</td>
                        <td>
                          {f.fee === null ? "Not attributed" : usd(f.fee)}
                        </td>
                        <td>{f.txHash ? "Confirmed tx fill" : "Simulation"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </StartGate>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  ShieldCheck,
  TriangleAlert,
  Copy,
} from "lucide-react";
import { api, price, usd, short } from "../api";
import { useApp, useLoad } from "../state";
import type { Account, Plan, Decision, Intent } from "../core/types";
import { Badge, ErrorBox, Loading, StartGate } from "../components/ui";
interface Preview {
  id: string;
  accountId: string;
  expiresAt: number;
  decision: Decision;
  plan: Plan;
}
export function PlanPage() {
  const { id = "" } = useParams();
  const { session } = useApp();
  const { value: plan, error } = useLoad("plan:" + id, (s) =>
    api<Plan>("/plans/" + encodeURIComponent(id), { signal: s }),
  );
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Link to="/app" className="back">
        <ArrowLeft size={15} /> All setups
      </Link>
      <ErrorBox message={error} />
      {!plan ? (
        <Loading />
      ) : (
        <>
          <div className="plan-heading">
            <div>
              <div className="eyebrow">
                SHARED SETUP · VERSION {plan.version}
              </div>
              <h1>{plan.title}</h1>
              <p>
                {plan.market} <span>·</span> {plan.direction} <span>·</span>{" "}
                {plan.author === "Pact practice"
                  ? "Pact practice"
                  : short(plan.author)}
              </p>
            </div>
            <button
              className="button outline small"
              onClick={() =>
                void navigator.clipboard.writeText(location.href).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
              }
            >
              <Copy size={15} />
              {copied ? "Copied" : "Copy setup link"}
            </button>
          </div>
          <div className="plan-layout">
            <section className="panel setup-details">
              <div className="section-top">
                <h2>The setup</h2>
                <Badge tone={plan.mode === "replay" ? "neutral" : "amber"}>
                  {plan.mode === "replay"
                    ? "Practice · simulated"
                    : "Tokyo testnet"}
                </Badge>
              </div>
              <div className="big-range">
                <span>ENTRY RANGE</span>
                <strong>
                  {price(plan.entryMin)} <small>to</small>
                  <br />
                  {price(plan.entryMax)}
                </strong>
              </div>
              <div className="setup-levels">
                <div>
                  <small>STOP LOSS</small>
                  <strong>{price(plan.stop)}</strong>
                </div>
                <div>
                  <small>TAKE PROFIT</small>
                  <strong>{price(plan.target)}</strong>
                </div>
              </div>
              <div className="entry-clock">
                <Clock size={17} />
                <div>
                  <strong>Entry window closes</strong>
                  <span>{new Date(plan.expiresAt).toLocaleString()}</span>
                </div>
              </div>
              <h3>The idea behind it</h3>
              <p className="rationale">
                {plan.rationale || "No additional rationale supplied."}
              </p>
              <div className="digest-label">
                SETUP DIGEST{" "}
                <code title={plan.digest}>{short(plan.digest)}</code>
              </div>
              <p className="tiny muted">
                A version digest identifies these terms. It doesn’t
                independently prove a trade or timestamp.
              </p>
            </section>
            <section className="panel decision-panel">
              <StartGate>
                <PersonalCheck key={plan.id + session?.owner} plan={plan} />
              </StartGate>
            </section>
          </div>
        </>
      )}
    </>
  );
}
function PersonalCheck({ plan }: { plan: Plan }) {
  const { session } = useApp(),
    navigate = useNavigate();
  const accounts = useLoad("accounts:" + session?.owner, (s) =>
    api<Account[]>("/accounts", { signal: s }),
  );
  const [accountId, setAccountId] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const select = (id: string) => {
    generation.current++;
    setAccountId(id);
    setPreview(null);
    setConsent(false);
    setError(null);
    setBusy(false);
  };
  const check = async () => {
    const request = ++generation.current;
    setBusy(true);
    setError(null);
    setPreview(null);
    setConsent(false);
    try {
      const p = await api<Preview>("/previews", {
        method: "POST",
        body: { planId: plan.id, accountId },
      });
      if (request === generation.current) setPreview(p);
    } catch (e) {
      if (request === generation.current) setError((e as Error).message);
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const approve = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const i = await api<Intent>("/intents", {
        method: "POST",
        body: { previewId: preview.id, consent },
      });
      navigate("/orders/" + i.id);
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
      setConsent(false);
    } finally {
      setBusy(false);
    }
  };
  const d = preview?.decision,
    matching = accounts.value?.filter((a) => a.mode === plan.mode) ?? [],
    account = matching.find((a) => a.id === accountId),
    expired = !!preview && now >= preview.expiresAt;
  return (
    <>
      <div className="eyebrow">YOUR ACCOUNT. YOUR TERMS.</div>
      <h2>Does this trade fit you?</h2>
      <p className="muted">
        Check current conditions against your personal risk rules.
      </p>
      <label className="field">
        <span>Choose an account</span>
        <select value={accountId} onChange={(e) => select(e.target.value)}>
          <option value="">Select your account</option>
          {matching.map((a) => (
            <option value={a.id} key={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      {accounts.error && <ErrorBox message={accounts.error} />}{" "}
      {!matching.length && accounts.value && (
        <p className="callout">
          No matching account. <Link to="/app/account">Connect an account</Link>{" "}
          or start a practice session.
        </p>
      )}
      <button
        className="button primary full"
        onClick={() => void check()}
        disabled={!accountId || busy}
      >
        {busy ? "Checking…" : preview ? "Refresh my decision" : "Check my size"}
        <ArrowRight size={16} />
      </button>
      <ErrorBox message={error} />
      {d && (
        <div className="decision-result" aria-live="polite">
          <div
            className={
              "decision-verdict " + (d.outcome === "blocked" ? "blocked" : "")
            }
          >
            <span>
              {d.outcome === "blocked" ? (
                <TriangleAlert size={23} />
              ) : (
                <ShieldCheck size={23} />
              )}
            </span>
            <div>
              <strong>
                {d.outcome === "ready"
                  ? "Within your terms"
                  : d.outcome === "resized"
                    ? "A smaller size fits"
                    : "This setup doesn’t fit"}
              </strong>
              <p>{d.message}</p>
            </div>
          </div>
          {d.outcome !== "blocked" ? (
            <>
              <div className="decision-size">
                <span>YOUR POSITION SIZE</span>
                <strong>
                  {d.quantity} <small>{plan.market.split("-")[0]}</small>
                </strong>
                <p>
                  {usd(d.notional)} notional · limit {price(d.limit)}
                </p>
              </div>
              <dl className="cost-breakdown">
                <div>
                  <dt>Entry-to-stop loss</dt>
                  <dd>{usd(d.stopLoss)}</dd>
                </div>
                <div>
                  <dt>Slippage reserve</dt>
                  <dd>{usd(d.slippageReserve)}</dd>
                </div>
                <div>
                  <dt>Funding reserve</dt>
                  <dd>{usd(d.fundingReserve)}</dd>
                </div>
                <div className="cost-total">
                  <dt>Planned risk</dt>
                  <dd>{usd(d.plannedLoss)}</dd>
                </div>
                <div>
                  <dt>Reward / risk after reserve</dt>
                  <dd>{d.rewardRisk}×</dd>
                </div>
                <div>
                  <dt>Size limited by</dt>
                  <dd>{d.limitedBy}</dd>
                </div>
              </dl>
              <div className="protection-note">
                <ShieldCheck size={18} />
                <div>
                  <strong>
                    {plan.mode === "replay"
                      ? "Simulated monitored exits"
                      : "Bot-monitored exits"}
                  </strong>
                  <p>
                    No exchange-native stop or target is armed by this approval.
                    Testnet monitoring requires the executor to stay online.
                  </p>
                </div>
              </div>
              <div className="approval-account">
                <span>EXECUTION ACCOUNT</span>
                <strong>{account?.label}</strong>
                <code>{short(accountId)}</code>
              </div>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  I approve this setup version for this account at no more than{" "}
                  {d.quantity}, with limit {price(d.limit)}. I understand the
                  protection mode and that planned risk isn’t a maximum loss.
                </span>
              </label>
              <button
                className="button primary full"
                disabled={
                  !consent || busy || expired || preview.accountId !== accountId
                }
                onClick={() => void approve()}
              >
                {busy
                  ? "Recording approval…"
                  : plan.mode === "replay"
                    ? "Approve practice order"
                    : "Approve testnet order"}
                <Check size={16} />
              </button>
              <p className={"preview-timer " + (expired ? "expired" : "")}>
                {expired
                  ? "Preview expired. Check your size again."
                  : `Preview expires in ${Math.max(0, Math.ceil((preview.expiresAt - now) / 1000))}s`}
              </p>
            </>
          ) : (
            <>
              <code className="reason-code">{d.reason}</code>
              <p className="tiny muted">
                A refusal protects the terms you chose. No order was prepared or
                sent.
              </p>
            </>
          )}
        </div>
      )}
      <p className="fineprint">
        Position sizing is deterministic. No model approves or sends an order.
      </p>
    </>
  );
}

import { useEffect, useState } from "react";
import { Activity, ArrowRight, Bot, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { accessApi } from "../../access/api";

type ProbeState = "checking" | "ready" | "limited" | "unavailable";
type Probe = { state: ProbeState; detail: string; checkedAt: string | null };
type Interpretation = { state: "ready" | "limited"; detail: string };
type Interpret = (result: Record<string, unknown>) => Interpretation;

// Interpretations are module-level so they stay referentially stable in effects.
// An endpoint can respond successfully while the capability it reports is disabled.
// The workspace must show that distinction rather than a generic green "Responding".
const interpretHealth: Interpret = (result) =>
  result.storage === "ready"
    ? { state: "ready", detail: "D1 storage ready" }
    : {
        state: "limited",
        detail: "The access API responded, but D1 storage is not ready",
      };

const interpretPayments: Interpret = (result) => {
  const configured =
    result.facilitatorConfigured === true && result.payments === "configured";
  return configured
    ? {
        state: "ready",
        detail: "x402 configured — readiness only, no payment submitted",
      }
    : {
        state: "limited",
        detail: "Payments disabled — facilitator awaits testnet configuration",
      };
};

function useProbe(path: string, interpret: Interpret) {
  const [probe, setProbe] = useState<Probe>({
    state: "checking",
    detail: "Checking service…",
    checkedAt: null,
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setProbe({ state: "checking", detail: "Checking service…", checkedAt: null });
    accessApi<Record<string, unknown>>(path, { signal: controller.signal })
      .then((result) =>
        setProbe({ ...interpret(result), checkedAt: new Date().toISOString() }),
      )
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setProbe({
            state: "unavailable",
            detail: error.message || "Service check failed",
            checkedAt: new Date().toISOString(),
          });
      });
    return () => controller.abort();
  }, [path, revision, interpret]);
  return { ...probe, retry: () => setRevision((value) => value + 1) };
}

const stateLabels: Record<ProbeState, string> = {
  checking: "Checking",
  ready: "Ready",
  limited: "Not configured",
  unavailable: "Unavailable",
};
const stateDots: Record<ProbeState, string> = {
  checking: "is-pending",
  ready: "is-good",
  limited: "is-pending",
  unavailable: "is-bad",
};

function StatusCard({ title, probe }: { title: string; probe: ReturnType<typeof useProbe> }) {
  return (
    <article className="workspace-status-card">
      <div className="workspace-status-card-top">
        <span>{title}</span>
        <i className={stateDots[probe.state]} />
      </div>
      <strong>{stateLabels[probe.state]}</strong>
      <p>{probe.detail}</p>
      <small>
        {probe.checkedAt
          ? `Checked ${new Date(probe.checkedAt).toLocaleTimeString()}`
          : "Live endpoint check"}
      </small>
      {probe.state === "unavailable" && (
        <button className="workspace-inline-action" onClick={probe.retry}>
          <RefreshCw size={13} /> Retry check
        </button>
      )}
    </article>
  );
}

export function Overview() {
  const access = useProbe("/health", interpretHealth);
  const payments = useProbe("/access/payment-health", interpretPayments);
  return (
    <div className="workspace-page">
      <div className="workspace-page-heading">
        <div>
          <div className="workspace-eyebrow">SYSTEM OVERVIEW</div>
          <h1>Workspace</h1>
          <p>Live service readiness for the Pact Access testnet integration.</p>
        </div>
        <span className="workspace-readonly-pill">READ-ONLY STATUS</span>
      </div>
      <section className="workspace-section">
        <div className="workspace-section-heading">
          <div>
            <h2>Service health</h2>
            <p>
              These checks report endpoint availability and capability readiness,
              not proof or payment success.
            </p>
          </div>
        </div>
        <div className="workspace-status-grid">
          <StatusCard title="Access API · Worker + D1" probe={access} />
          <StatusCard title="x402 facilitator" probe={payments} />
        </div>
      </section>
      <section className="workspace-section">
        <div className="workspace-section-heading">
          <div>
            <h2>Core operations</h2>
            <p>Open a workflow to inspect a real registry record or verify an owner signature.</p>
          </div>
        </div>
        <div className="workspace-action-grid">
          <Link to="/app/agents" className="workspace-action-card"><span><Bot size={18} /></span><div><strong>Agent registry</strong><p>Look up a CIS-8004 badge against the trusted registry.</p></div><ArrowRight size={16} /></Link>
          <Link to="/app/verification" className="workspace-action-card"><span><ShieldCheck size={18} /></span><div><strong>Owner verification</strong><p>Issue a one-time challenge and verify the owner's wallet signature.</p></div><ArrowRight size={16} /></Link>
          <Link to="/app/payments" className="workspace-action-card"><span><CreditCard size={18} /></span><div><strong>Payment readiness</strong><p>Inspect facilitator configuration and x402 availability.</p></div><ArrowRight size={16} /></Link>
          <Link to="/app/activity" className="workspace-action-card"><span><Activity size={18} /></span><div><strong>Audit activity</strong><p>Review the current audit API integration status.</p></div><ArrowRight size={16} /></Link>
        </div>
      </section>
      <div className="workspace-notice"><ShieldCheck size={17} /><p><strong>Fail-closed by design.</strong> A healthy API response does not authorize an agent, confirm a payment, or release a protected resource.</p></div>
    </div>
  );
}

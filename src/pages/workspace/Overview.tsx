import { useEffect, useState } from "react";
import { Activity, ArrowRight, Bot, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { accessApi } from "../../access/api";

type ProbeState = "checking" | "ready" | "limited" | "unavailable";
type Probe = {
  state: ProbeState;
  detail: string;
  evidence: string[];
  checkedAt: string | null;
};
type Interpretation = {
  state: "ready" | "limited";
  detail: string;
  evidence: string[];
};
type Interpret = (result: Record<string, unknown>) => Interpretation;

const text = (value: unknown, fallback: string) =>
  typeof value === "string" && value.length > 0 ? value : fallback;
const yes = (value: unknown) => value === true || value === "ready" || value === "configured";

// Module-level interpreters stay referentially stable in effects.
// Endpoint availability and capability readiness are different facts: a Worker
// can answer 200 while a capability it reports is still disabled/undeployed.
const interpretHealth: Interpret = (result) => {
  const storageReady = result.storage === "ready";
  const challenge = yes(result.challengeIssuance);
  const ownerSignature = yes(result.ownerSignatureVerification);
  const rpc = text(result.accountInfoRpc, "unconfigured");
  const payments = text(result.payments, "unknown");
  const delivery = text(result.resourceDelivery, "unknown");
  const enabled = challenge && ownerSignature && rpc !== "unconfigured";
  return {
    state: enabled ? "ready" : "limited",
    detail: enabled
      ? "Challenge, owner signature and account RPC configured"
      : "Access Worker responded but a proof dependency is unconfigured",
    evidence: [
      `storage: ${storageReady ? "ready" : text(String(result.storage), "unknown")}`,
      `challengeIssuance: ${challenge ? "configured" : "not configured"}`,
      `ownerSignatureVerification: ${ownerSignature ? "configured" : "not configured"}`,
      `accountInfoRpc: ${rpc}`,
      `payments: ${payments}`,
      `resourceDelivery: ${delivery}`,
    ],
  };
};

const interpretPayments: Interpret = (result) => {
  // Two real shapes exist: deployed placeholder (paymentsEnabled/x402/
  // resourceDelivery) and the configured facilitator source (payments/
  // facilitatorConfigured). Recognize both; fail closed on neither.
  const deployed = Object.prototype.hasOwnProperty.call(result, "paymentsEnabled");
  const configured =
    result.facilitatorConfigured === true &&
    (result.payments === "configured" || result.paymentsEnabled === true) &&
    result.x402 !== "not-deployed";
  const state = configured ? "ready" : "limited";
  const detail = configured
    ? "x402 configured — readiness only, no payment submitted"
    : deployed
      ? "Payments not deployed — facilitator is fail-closed"
      : "Payments disabled — facilitator awaits testnet configuration";
  const evidence = [
    `x402: ${text(String(result.x402), "unknown")}`,
    `facilitatorConfigured: ${String(result.facilitatorConfigured ?? false)}`,
    deployed
      ? `paymentsEnabled: ${String(result.paymentsEnabled)}`
      : `payments: ${text(String(result.payments), "unknown")}`,
    `resourceDelivery: ${text(String(result.resourceDelivery), "unknown")}`,
  ];
  if (typeof result.resourceCount === "number")
    evidence.push(`resourceCount: ${result.resourceCount}`);
  if (typeof result.reason === "string")
    evidence.push(`reason: ${result.reason}`);
  return { state, detail, evidence };
};

function useProbe(path: string, interpret: Interpret) {
  const [probe, setProbe] = useState<Probe>({
    state: "checking",
    detail: "Checking service…",
    evidence: [],
    checkedAt: null,
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setProbe({ state: "checking", detail: "Checking service…", evidence: [], checkedAt: null });
    accessApi<Record<string, unknown>>(path, { signal: controller.signal })
      .then((result) =>
        setProbe({ ...interpret(result), checkedAt: new Date().toISOString() }),
      )
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setProbe({
            state: "unavailable",
            detail: error.message || "Service check failed",
            evidence: [],
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
      {probe.evidence.length > 0 && (
        <ul className="workspace-evidence-list" aria-label={`${title} response fields`}>
          {probe.evidence.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
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
              Live response fields are shown verbatim. Endpoint availability is
              not proof, payment success, or resource delivery.
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

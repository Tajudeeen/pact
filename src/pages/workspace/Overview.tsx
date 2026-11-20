import { useEffect, useState } from "react";
import { Activity, ArrowRight, Bot, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { api } from "../../api";

type Probe = { loading: boolean; ok: boolean | null; detail: string; checkedAt: string | null };

function useProbe(path: string) {
  const [probe, setProbe] = useState<Probe>({ loading: true, ok: null, detail: "Checking service…", checkedAt: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setProbe((current) => ({ ...current, loading: true, detail: "Checking service…" }));
    api<Record<string, unknown>>(path, { signal: controller.signal })
      .then((result) => setProbe({ loading: false, ok: true, detail: typeof result.status === "string" ? result.status : "Endpoint responded successfully", checkedAt: new Date().toISOString() }))
      .catch((error: Error) => {
        if (!controller.signal.aborted) setProbe({ loading: false, ok: false, detail: error.message || "Service check failed", checkedAt: new Date().toISOString() });
      });
    return () => controller.abort();
  }, [path, revision]);
  return { ...probe, retry: () => setRevision((value) => value + 1) };
}

function StatusCard({ title, probe }: { title: string; probe: ReturnType<typeof useProbe> }) {
  return (
    <article className="workspace-status-card">
      <div className="workspace-status-card-top"><span>{title}</span><i className={probe.loading ? "is-pending" : probe.ok ? "is-good" : "is-bad"}/></div>
      <strong>{probe.loading ? "Checking" : probe.ok ? "Responding" : "Unavailable"}</strong>
      <p>{probe.detail}</p>
      <small>{probe.checkedAt ? `Checked ${new Date(probe.checkedAt).toLocaleTimeString()}` : "Live endpoint check"}</small>
      {!probe.loading && !probe.ok && <button className="workspace-inline-action" onClick={probe.retry}><RefreshCw size={13}/> Retry check</button>}
    </article>
  );
}

export function Overview() {
  const access = useProbe("/health");
  const payments = useProbe("/access/payment-health");
  return (
    <div className="workspace-page">
      <div className="workspace-page-heading">
        <div><div className="workspace-eyebrow">SYSTEM OVERVIEW</div><h1>Workspace</h1><p>Live service readiness for the Pact Access testnet integration.</p></div>
        <span className="workspace-readonly-pill">READ-ONLY STATUS</span>
      </div>
      <section className="workspace-section">
        <div className="workspace-section-heading"><div><h2>Service health</h2><p>These checks report endpoint availability, not proof or payment success.</p></div></div>
        <div className="workspace-status-grid"><StatusCard title="Access API · Worker + D1" probe={access}/><StatusCard title="x402 facilitator" probe={payments}/></div>
      </section>
      <section className="workspace-section">
        <div className="workspace-section-heading"><div><h2>Core operations</h2><p>Open a workflow to inspect a real registry record or verify an owner signature.</p></div></div>
        <div className="workspace-action-grid">
          <Link to="/app/agents" className="workspace-action-card"><span><Bot size={18}/></span><div><strong>Agent registry</strong><p>Look up a CIS-8004 badge against the trusted registry.</p></div><ArrowRight size={16}/></Link>
          <Link to="/app/verification" className="workspace-action-card"><span><ShieldCheck size={18}/></span><div><strong>Owner verification</strong><p>Issue a one-time challenge and verify the owner's wallet signature.</p></div><ArrowRight size={16}/></Link>
          <Link to="/app/payments" className="workspace-action-card"><span><CreditCard size={18}/></span><div><strong>Payment readiness</strong><p>Inspect facilitator configuration and x402 availability.</p></div><ArrowRight size={16}/></Link>
          <Link to="/app/activity" className="workspace-action-card"><span><Activity size={18}/></span><div><strong>Audit activity</strong><p>Review the current audit API integration status.</p></div><ArrowRight size={16}/></Link>
        </div>
      </section>
      <div className="workspace-notice"><ShieldCheck size={17}/><p><strong>Fail-closed by design.</strong> A healthy API response does not authorize an agent, confirm a payment, or release a protected resource.</p></div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { CreditCard, RefreshCw, ShieldAlert } from "lucide-react";
import { accessApi } from "../../access/api";

type PaymentHealth = Record<string, unknown>;

export function Payments() {
  const [health, setHealth] = useState<PaymentHealth | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    accessApi<PaymentHealth>("/access/payment-health", { signal: controller.signal })
      .then(setHealth)
      .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message || "Payment health check failed."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  const configured =
    health?.facilitatorConfigured === true &&
    (health?.payments === "configured" || health?.paymentsEnabled === true) &&
    health?.x402 !== "not-deployed";
  return (
    <div className="workspace-page">
      <div className="workspace-page-heading"><div><div className="workspace-eyebrow">X402 · CCD SETTLEMENT</div><h1>Payments</h1><p>Inspect facilitator readiness. This page never submits or simulates a payment.</p></div><span className="workspace-readonly-pill">READ-ONLY STATUS</span></div>
      <section className="workspace-panel">
        <div className="workspace-panel-heading"><span className="workspace-panel-icon"><CreditCard size={19}/></span><div><h2>Facilitator status</h2><p>Live response from Pact's payment-health endpoint.</p></div></div>
        {loading && <p className="workspace-muted">Checking facilitator configuration…</p>}
        {error && <div className="workspace-inline-error" role="alert">{error}<button onClick={() => setRevision((value) => value + 1)}><RefreshCw size={13}/> Retry</button></div>}
        {!loading && !error && health && <>
          <div className={configured ? "workspace-payment-state is-enabled" : "workspace-payment-state is-disabled"}><i/>{configured ? "Facilitator configured" : "Payments disabled"}</div>
          <pre className="workspace-health-json">{JSON.stringify(health, null, 2)}</pre>
          {!configured && <div className="workspace-notice"><ShieldAlert size={17}/><p><strong>Settlement remains locked.</strong> The facilitator must be deployed and fully configured. A real finalized testnet transaction and protected-resource delivery still need independent verification.</p></div>}
        </>}
      </section>
    </div>
  );
}

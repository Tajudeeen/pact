import { Activity, LockKeyhole } from "lucide-react";

export function ActivityPage() {
  return (
    <div className="workspace-page">
      <div className="workspace-page-heading"><div><div className="workspace-eyebrow">SANITIZED AUDIT TRAIL</div><h1>Activity</h1><p>Request, proof, settlement, and delivery events belong in one traceable timeline.</p></div><span className="workspace-readonly-pill">NOT CONNECTED</span></div>
      <section className="workspace-empty-state"><span><LockKeyhole size={22}/></span><div className="workspace-eyebrow">AUDIT API REQUIRED</div><h2>Audit history isn't exposed yet.</h2><p>The backend records request state and sanitized audit events in D1, but it doesn't currently expose a read-only, paginated activity endpoint. This screen stays empty until that API exists.</p><div className="workspace-contract"><code>GET /api/access/audit?limit=50&amp;cursor=…</code><small>Required contract: paginated events with redacted proof and payment metadata.</small></div></section>
    </div>
  );
}

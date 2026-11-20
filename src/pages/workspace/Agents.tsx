import { useState, type FormEvent } from "react";
import { ArrowUpRight, Bot, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { api } from "../../api";

const tokenPattern = /^[1-9A-HJ-NP-Za-km-z]{20,80}$/;

export function Agents() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tokenPattern.test(token.trim())) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await api<unknown>(`/access/registry/${encodeURIComponent(token.trim())}`));
    } catch (cause) {
      setError((cause as Error).message || "Registry lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="workspace-page">
      <div className="workspace-page-heading"><div><div className="workspace-eyebrow">CIS-8004 REGISTRY</div><h1>Agents</h1><p>Resolve an agent badge against Pact's configured Concordium Agent Registry.</p></div><span className="workspace-readonly-pill">READ-ONLY LOOKUP</span></div>
      <section className="workspace-panel workspace-lookup-panel">
        <div className="workspace-panel-heading"><span className="workspace-panel-icon"><Bot size={19}/></span><div><h2>Agent lookup</h2><p>Use the badge token address. Owner and payment wallet values are resolved by the server.</p></div></div>
        <form className="workspace-lookup-form" onSubmit={lookup}>
          <label htmlFor="agent-token">CIS-8004 token address</label>
          <div className="workspace-input-row"><input id="agent-token" value={token} onChange={(event) => { setToken(event.target.value.trim()); setResult(null); setError(""); }} placeholder="Paste the agent token address" autoComplete="off" spellCheck={false}/><button type="submit" disabled={!tokenPattern.test(token.trim()) || loading}>{loading ? <LoaderCircle className="workspace-spin" size={16}/> : <Search size={16}/>} <span>Verify badge</span></button></div>
          <small>The lookup validates the configured registry record and Agent Card. A successful lookup does not prove owner authorization for a new request.</small>
        </form>
        {error && <div className="workspace-inline-error" role="alert">{error}</div>}
        {result !== null && <div className="workspace-result"><div className="workspace-result-heading"><ShieldCheck size={16}/><strong>Registry response</strong><span>LIVE RESPONSE</span></div><pre>{JSON.stringify(result, null, 2)}</pre></div>}
      </section>
      <div className="workspace-notice"><ShieldCheck size={17}/><p><strong>Trust boundary.</strong> Pact re-checks the active owner and registered agentWallet during challenge issuance, proof acceptance, and payment settlement. This page is an inspection tool, not an authorization shortcut.</p></div>
    </div>
  );
}

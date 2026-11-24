import { ArrowUpRight, Check, Copy, ExternalLink, FileWarning, Terminal } from "lucide-react";
import { useState } from "react";

type Command = { label: string; command: string; proves: string };

const commands: Command[] = [
  {
    label: "Access Worker health",
    command: "curl -s https://pact-access.vercel.app/api/health",
    proves: "Worker + D1 ready, challenge and owner-signature verification configured, account RPC bound.",
  },
  {
    label: "Facilitator readiness",
    command: "curl -s https://pact-access.vercel.app/api/access/payment-health",
    proves: "x402 not deployed, payments disabled, resource delivery disabled — intentionally fail-closed.",
  },
  {
    label: "Registry verification",
    command: "curl -s https://pact-access.vercel.app/api/access/registry/<CIS-8004-TOKEN-ADDRESS>",
    proves: "Live CIS-8004 registry re-check; an invalid badge returns HTTP 403.",
  },
  {
    label: "Reproduce the build",
    command: "pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build",
    proves: "Type check, full test suite, and production build from a fresh clone.",
  },
];

const verified: Array<[string, string]> = [
  ["Access Worker + D1", "Live on Cloudflare Workers Free; /api/health reports status ok and storage ready."],
  ["Owner challenge", "90-second request-bound challenge; production negative-signature test returned HTTP 401."],
  ["Signature verification", "Server-side Ed25519 against fresh Concordium testnet account credentials."],
  ["Registry re-check", "CIS-8004 active owner + agentWallet re-read at challenge and proof acceptance."],
  ["Source and CI", "Public repository; typecheck, tests and production build pass in GitHub Actions."],
];

const gaps: Array<[string, string]> = [
  ["Verified by Concordium identity badge", "Not implemented. Pact's gate proves control of the current CIS-8004 owner account, not a human identity attribute. No claim of ZK human-identity proof is made."],
  ["x402 settlement", "Full facilitator bundle not deployed: missing CLOUDFLARE_API_TOKEN Actions secret, sponsor key, payout account and price."],
  ["CCDExplorer transaction", "No real payment transaction exists. None is presented; no transaction hash or link is claimed."],
  ["Protected resource delivery", "Disabled. Resource count is 0 and the resource route is fail-closed."],
  ["Audit trail", "Activity is empty: no sanitized, authorized audit API exists yet."],
];

export function Evidence() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="workspace-page">
      <div className="workspace-page-heading">
        <div>
          <div className="workspace-eyebrow">JUDGE VERIFICATION</div>
          <h1>Evidence</h1>
          <p>Every claim below is re-checkable against a live endpoint or the public repository. Nothing here is a simulated success.</p>
        </div>
        <span className="workspace-readonly-pill">READ-ONLY</span>
      </div>

      <section className="workspace-section">
        <div className="workspace-section-heading"><div><h2>Verify from your own terminal</h2><p>Run these commands to reproduce the live claims without trusting this UI.</p></div></div>
        <div className="workspace-command-grid">
          {commands.map(({ label, command, proves }) => (
            <article key={label} className="workspace-panel workspace-command-card">
              <div className="workspace-command-head"><span><Terminal size={16} /></span><strong>{label}</strong><button type="button" aria-label={`Copy command: ${label}`} onClick={() => copy(command, label)}>{copied === label ? <Check size={15} /> : <Copy size={15} />}</button></div>
              <code>{command}</code>
              <p>{proves}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="workspace-section">
        <div className="workspace-section-heading"><div><h2>What is actually verified</h2><p>Claims with a live endpoint or recorded production response behind them.</p></div></div>
        <div className="workspace-panel">
          <div className="workspace-evidence-table">
            {verified.map(([title, detail]) => (
              <div key={title}><span><Check size={14} /> {title}</span><p>{detail}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace-section">
        <div className="workspace-section-heading"><div><h2>Honest gaps</h2><p>Known limits of this release, stated plainly. No mock covers these gaps.</p></div></div>
        <div className="workspace-panel">
          <div className="workspace-evidence-table is-gaps">
            {gaps.map(([title, detail]) => (
              <div key={title}><span><FileWarning size={14} /> {title}</span><p>{detail}</p></div>
            ))}
          </div>
        </div>
      </section>

      <div className="workspace-notice">
        <ExternalLink size={17} />
        <p>
          <strong>Submission requirements.</strong> A public repository, a demo video of up to
          three minutes, a CCDExplorer link and a short go-live plan are required. The
          CCDExplorer link is intentionally absent: there is no real transaction to link.
          See <a href="https://github.com/Tajudeeen/pact" target="_blank" rel="noreferrer">the repository <ArrowUpRight size={12} /></a>{" "}
          and <code>docs/SUBMISSION.md</code>.
        </p>
      </div>
    </div>
  );
}

import { Network, ShieldCheck } from "lucide-react";

const config = [
  ["Network", "Concordium Testnet"],
  ["Network identifier", "ccd:4221332d34e1694168c2a0c0b3fd0f27"],
  ["CIS-8004 registry", "12802,0"],
  ["CIS-8 registry", "12801,0"],
  ["Frontend", "Vercel"],
  ["Access API and state", "Cloudflare Workers + D1"],
];

export function Settings() {
  return (
    <div className="workspace-page">
      <div className="workspace-page-heading"><div><div className="workspace-eyebrow">ENVIRONMENT CONFIGURATION</div><h1>Settings</h1><p>Read-only deployment and network details for this testnet workspace.</p></div><span className="workspace-readonly-pill">READ-ONLY</span></div>
      <section className="workspace-panel">
        <div className="workspace-panel-heading"><span className="workspace-panel-icon"><Network size={19}/></span><div><h2>Network configuration</h2><p>Values documented by the current Pact Access integration.</p></div></div>
        <div className="workspace-config-list">{config.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      </section>
      <div className="workspace-notice"><ShieldCheck size={17}/><p><strong>Configuration is intentionally read-only.</strong> Secret values, private keys, and privileged deployment controls never belong in the browser workspace.</p></div>
    </div>
  );
}

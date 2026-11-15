import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, LockKeyhole, ShieldCheck, Wallet, Zap } from "lucide-react";
import { Link } from "react-router";
import { OwnerProofConsole } from "../components/OwnerProofConsole";
import { BrandSplash } from "../components/BrandSplash";


const flow = [
  { n: "01", title: "Request", text: "An agent asks for a paid API, dataset, or tool. The seller keeps the resource behind Pact." },
  { n: "02", title: "Verify", text: "The registered owner signs a short-lived message. The agent pays from its on-chain `agentWallet`." },
  { n: "03", title: "Pay", text: "Pact verifies the requirement, then coordinates x402 payment. No valid owner signature, no settlement." },
  { n: "04", title: "Unlock", text: "The seller delivers only after payment from the registered agent wallet is independently confirmed." },
];

export function Landing() {
  return (
    <div className="access-landing" id="top">
      <BrandSplash />
      <header className="access-nav">
        <Link to="/" aria-label="Pact home" className="access-brand"><span className="access-brand-symbol">P</span><span>PACT<span className="access-brand-dot">.</span></span></Link>
        <nav><a href="#flow">How it works</a><a href="#security">Security</a><a href="#scope">Scope</a></nav>
        <a className="access-nav-cta" href="#flow">Explore the flow <ArrowUpRight size={15}/></a>
      </header>
      <main>
        <section className="access-hero">
          <div className="access-hero-copy">
            <div className="access-kicker"><span/> CONCORDIUM · x402 · AGENT ACCESS</div>
            <h1>agents can pay.<br/><em>access still needs<br/>a verified owner.</em></h1>
            <p className="access-lede">Pact verifies the active Concordium agent owner, then checks that the agent's registered payment wallet is the account paying for access. No identity documents or personal attributes are collected.</p>
            <div className="access-hero-actions"><a className="access-button" href="#flow">See the access flow <ArrowRight size={17}/></a><a className="access-text-link" href="#security">Read the security boundary <ArrowDownRight size={16}/></a></div>
            <div className="access-caption"><ShieldCheck size={15}/> owner first <span/> payment second <span/> resource last</div>
          </div>
          <div className="access-visual" aria-label="Pact proof-gated access flow illustration">
            <div className="access-visual-top"><span>PACT / ACCESS GATE</span><span className="access-live-label">POLICY ENFORCED</span></div>
            <div className="access-visual-agent"><div className="access-orb"><Zap size={22}/></div><div><small>BUYER AGENT</small><strong>Request resource</strong><span>dataset · api · mcp tool</span></div><ArrowRight size={17}/></div>
            <div className="access-gate"><div className="access-gate-line"/><div className="access-gate-icon"><LockKeyhole size={21}/></div><div><small>PACT VERIFIER</small><strong>Owner signature required</strong></div><span className="access-gate-status">GATED</span></div>
            <div className="access-proof"><div className="access-proof-icon"><Wallet size={18}/></div><div><small>CONCORDIUM WALLET</small><strong>Signature verified</strong><span>identity stays private</span></div><Check size={18}/></div>
            <div className="access-settlement"><div><small>x402 SETTLEMENT</small><strong>Payment confirmed</strong></div><span>01 / 01</span></div>
            <div className="access-delivery"><span className="access-delivery-dot"/><div><small>SELLER RESOURCE</small><strong>Access released</strong></div><span className="access-unlocked">UNLOCKED</span></div>
            <div className="access-visual-foot"><span>PROOF → SETTLEMENT → DELIVERY</span><span>Illustrative flow</span></div>
          </div>
        </section>
        <section className="access-strip"><span>FOR SELLERS OF</span><strong>APIs</strong><i/><strong>DATASETS</strong><i/><strong>AGENT TOOLS</strong><i/><strong>MCP SERVICES</strong></section>
        <section id="flow" className="access-flow-section">
          <div className="access-section-heading"><div className="access-kicker">ONE REQUEST. FOUR CHECKS.</div><h2>access has a sequence.<br/><em>pact enforces it.</em></h2></div>
          <div className="access-flow-grid">{flow.map((item)=><article className="access-flow-card" key={item.n}><span>{item.n}</span><h3>{item.title}</h3><p>{item.text}</p><div className="access-flow-card-line"/></article>)}</div>
        </section>
        <OwnerProofConsole />
        <section id="security" className="access-security-section"><div><div className="access-kicker">THE TRUST BOUNDARY</div><h2>verify the owner.<br/><em>keep identity private.</em></h2><p>Pact verifies the owner signature against fresh chain credentials, then checks the active Agent Registry owner and registered `agentWallet` match. It does not collect identity documents or personal attributes.</p></div><div className="access-security-list"><div><Check size={16}/><span>No identity documents or attributes are requested</span></div><div><Check size={16}/><span>Account signature is verified server-side</span></div><div><Check size={16}/><span>Payment must be independently confirmed</span></div><div><Check size={16}/><span>Protected bytes never leave before clearance</span></div><div><Check size={16}/><span>Missing proof or unavailable verifier fails closed</span></div></div></section>
        <section id="scope" className="access-scope-section"><div className="access-kicker">SMALL FIRST. REUSABLE NEXT.</div><h2>one seller. one resource.<br/><em>one proof gate.</em></h2><p>The first build targets one Concordium account-signature requirement and one x402 testnet payment path. The gateway boundary is designed to be reused across protected resources.</p><div className="access-scope-tags"><span>CONCORDIUM SIGNATURE</span><span>AGENT BINDING</span><span>x402</span><span>FAIL-CLOSED GATE</span><span>SANITIZED AUDIT</span></div><div className="access-status-note"><span className="access-status-dot"/><div><strong>Integration work in progress</strong><p>Wallet signing, registry resolution, x402 facilitator, and testnet settlement are not represented as live integrations yet.</p></div></div></section>
        <section className="access-final"><div className="access-kicker">PACT ACCESS</div><h2>paid access should<br/><em>have a verified owner behind it.</em></h2><a className="access-button" href="#flow">Follow the request <ArrowRight size={17}/></a><p>Proof-gated access for autonomous agents.</p></section>
      </main>
      <footer className="access-footer">
        <div className="access-footer-top">
          <div className="access-footer-brand">
            <Link to="/" aria-label="Pact home" className="access-brand"><span className="access-brand-symbol">P</span><span>PACT<span className="access-brand-dot">.</span></span></Link>
            <p>proof-gated access for autonomous agents.</p>
          </div>
          <nav className="access-footer-nav" aria-label="Footer navigation">
            <a href="#flow">How it works</a>
            <a href="#security">Security</a>
            <a href="#scope">Scope</a>
          </nav>
          <a className="access-footer-source" href="https://github.com/Tajudeeen/pact" target="_blank" rel="noreferrer">view source <ArrowUpRight size={14}/></a>
        </div>
        <div className="access-footer-bottom">
          <small>© {new Date().getFullYear()} Pact · independent builder project</small>
          <span>Concordium · x402 · agent access</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </div>
  );
}

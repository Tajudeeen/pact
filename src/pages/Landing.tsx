import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Fingerprint, LockKeyhole, Menu, ShieldCheck, Wallet, X, Zap } from "lucide-react";
import { Link } from "react-router";
import { OwnerProofConsole } from "../components/OwnerProofConsole";
import { BrandSplash } from "../components/BrandSplash";

const flow = [
  { n: "01", title: "Request", text: "An autonomous agent requests a paid API, dataset, or tool from a seller." },
  { n: "02", title: "Authorize", text: "The registered owner signs a short-lived challenge tied to this exact request." },
  { n: "03", title: "Settle", text: "Pact checks the registered agent wallet and waits for finalized x402 payment." },
  { n: "04", title: "Deliver", text: "The seller releases the protected resource only after the payment clears." },
];

const faqs = [
  ["What does the owner signature prove?", "It proves control of the Concordium account that is currently registered as the agent owner. It does not prove an age, nationality, uniqueness, or any other identity attribute."],
  ["Can the agent pay from a different wallet?", "Yes. The registered owner account and the agent's payment wallet are separate. Pact checks the current CIS-8004 owner and the registered agentWallet against the request."],
  ["When is the resource released?", "Only after the payment is independently confirmed as finalized on the configured Concordium network. A submitted transaction or a browser success message is not enough."],
  ["Does Pact collect identity documents?", "No. The current design uses a request-bound account signature. It does not ask for identity documents or personal identity attributes."],
];

const bars = Array.from({ length: 44 }, (_, i) => i);

export function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -45px 0px" });
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="access-landing" id="top">
      <BrandSplash />
      <header className="access-nav">
        <Link to="/" aria-label="Pact home" className="access-brand"><img className="access-brand-image" src="/pact-mark.svg" alt="" /><span>pact<span className="access-brand-dot">.</span></span></Link>
        <nav className={mobileMenuOpen ? "access-nav-links is-open" : "access-nav-links"} aria-label="Main navigation"><a href="#flow" onClick={() => setMobileMenuOpen(false)}>How it works</a><a href="#verification" onClick={() => setMobileMenuOpen(false)}>Verification</a><a href="#developers" onClick={() => setMobileMenuOpen(false)}>Developers</a><a href="#faq" onClick={() => setMobileMenuOpen(false)}>FAQ</a></nav>
        <button className="access-mobile-menu" type="button" aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={18}/> : <Menu size={18}/>}</button>
        <a className="access-nav-cta" href="#owner-proof">Try owner verification <ArrowUpRight size={15}/></a>
      </header>

      <main>
        <section className="access-hero">
          <div className="access-hero-copy" data-reveal>
            <div className="access-kicker"><span/> CONCORDIUM · x402 · AGENT ACCESS</div>
            <h1>access for agents.<br/><em>authorization stays<br/>with the owner.</em></h1>
            <p className="access-lede">Pact checks who controls an agent, which wallet it is registered to pay from, and whether payment has finalized. Only then does the seller release the resource.</p>
            <div className="access-hero-actions"><a className="access-button" href="#flow">Explore the access flow <ArrowRight size={17}/></a><a className="access-text-link" href="#verification">Understand the trust boundary <ArrowUpRight size={15}/></a></div>
            <div className="access-caption"><ShieldCheck size={15}/> owner authorization <i/> registered payer <i/> finalized payment</div>
          </div>

          <div className="access-visual" aria-label="Illustration of an agent request moving through owner authorization, payment, and resource delivery">
            <div className="access-visual-grid"/>
            <div className="access-visual-top"><span>PACT / ACCESS NETWORK</span><span className="access-live-label"><i/> POLICY SEQUENCE</span></div>
            <div className="access-network">
              <svg className="access-network-lines" viewBox="0 0 640 390" role="img" aria-label="Dotted network paths connecting agent, owner, payment, and resource nodes">
                <path className="network-path network-path-main" d="M75 205 C150 205 150 100 245 100 S360 205 430 205 S520 90 580 90"/>
                <path className="network-path network-path-secondary" d="M75 205 C155 205 170 310 245 310 S355 205 430 205 S515 310 580 310"/>
                <path className="network-orbit" d="M38 195 C120 20 520 20 602 195 S120 370 38 195"/>
              </svg>
              <div className="network-node node-agent"><span className="network-node-icon"><Zap size={17}/></span><small>01 / AGENT</small><strong>Request</strong><em>resource access</em></div>
              <div className="network-node node-owner"><span className="network-node-icon"><Fingerprint size={17}/></span><small>02 / OWNER</small><strong>Authorize</strong><em>account signature</em></div>
              <div className="network-node node-payment"><span className="network-node-icon"><Wallet size={17}/></span><small>03 / PAYMENT</small><strong>Settle</strong><em>registered wallet</em></div>
              <div className="network-node node-resource"><span className="network-node-icon"><LockKeyhole size={17}/></span><small>04 / RESOURCE</small><strong>Release</strong><em>after finality</em></div>
              <div className="network-bars" aria-hidden="true">{bars.map((bar) => <span key={bar} style={{ animationDelay: `${bar * 23}ms`, height: `${16 + ((bar * 37) % 74)}%` }}/>)}</div>
              <div className="network-transaction-card"><div className="transaction-status"><i/> ACCESS SEQUENCE <span>ILLUSTRATIVE</span></div><strong>Owner authorization</strong><div className="transaction-route"><span>Agent</span><b>→</b><span>Concordium</span><b>→</b><span>Seller</span></div><div className="transaction-footer"><span>Payment required</span><strong>BEFORE DELIVERY</strong></div></div>
            </div>
            <div className="access-visual-foot"><span>PROOF → PAYMENT → RESOURCE</span><span>Illustrative sequence</span></div>
          </div>
        </section>

        <section className="access-strip" aria-label="Supported resource categories"><span>BUILT FOR</span><strong>PAID APIS</strong><i/><strong>DATASETS</strong><i/><strong>AGENT TOOLS</strong><i/><strong>MCP SERVICES</strong></section>

        <section id="flow" className="access-flow-section">
          <div className="access-section-heading" data-reveal><div className="access-kicker">ONE REQUEST. FOUR STEPS.</div><h2>the order matters.<br/><em>pact enforces it.</em></h2><p>Every step depends on the one before it. The resource stays locked until the chain confirms payment.</p></div>
          <div className="access-flow-grid">{flow.map((item, index)=><article className="access-flow-card" key={item.n} data-reveal style={{ transitionDelay: `${index * 80}ms` }}><div className="flow-card-top"><span>{item.n}</span><ArrowUpRight size={16}/></div><h3>{item.title}</h3><p>{item.text}</p><div className="access-flow-card-line"/></article>)}</div>
        </section>

        <OwnerProofConsole />

        <section id="verification" className="access-security-section">
          <div data-reveal><div className="access-kicker">THE TRUST BOUNDARY</div><h2>verify account control.<br/><em>keep identity private.</em></h2><p>The owner signs a short-lived, request-specific challenge. Pact verifies the signature against fresh Concordium account information, then checks the active Agent Registry record and its registered payment wallet.</p></div>
          <div className="access-security-list" data-reveal>
            <div><Check size={16}/><span>Signature must match the current registered owner</span></div>
            <div><Check size={16}/><span>Payment sender must match the registered agentWallet</span></div>
            <div><Check size={16}/><span>Challenge is short-lived and single-use</span></div>
            <div><Check size={16}/><span>Payment must be finalized before delivery</span></div>
            <div><Check size={16}/><span>Unavailable checks fail closed</span></div>
          </div>
        </section>

        <section className="access-developer-section" id="developers">
          <div className="developer-copy" data-reveal><div className="access-kicker">A CLEAR INTEGRATION BOUNDARY</div><h2>one protected route.<br/><em>one enforced sequence.</em></h2><p>Connect a seller resource to the Pact gateway. The backend owns verification, settlement coordination, and the final delivery decision.</p><a className="access-text-link" href="https://github.com/Tajudeeen/pact" target="_blank" rel="noreferrer">Explore the source <ArrowUpRight size={15}/></a></div>
          <div className="developer-panel" data-reveal><div className="developer-panel-top"><span><i/> PACT ACCESS / REQUEST FLOW</span><span>SEQUENCE</span></div><div className="developer-code"><div><b>01</b><code>request = createAccessRequest(agent, resource)</code></div><div><b>02</b><code>proof = owner.sign(challenge)</code></div><div><b>03</b><code>verified = verifyOwnerAndAgent(proof)</code></div><div><b>04</b><code>payment = settleX402(verified)</code></div><div><b>05</b><code>if (payment.finalized) deliver(resource)</code></div></div><div className="developer-panel-bottom"><span>ORDERED. SERVER-VERIFIED. FAIL-CLOSED.</span><span>01 — 05</span></div></div>
        </section>

        <section id="faq" className="access-faq-section">
          <div data-reveal><div className="access-kicker">QUESTIONS, ANSWERED</div><h2>know what gets<br/><em>verified.</em></h2><p>Clear boundaries matter when agents can spend money and access private resources.</p></div>
          <div className="access-faq-list" data-reveal>{faqs.map(([question, answer], index)=><details key={question} className="access-faq-item" open={index===0}><summary>{question}<ChevronDown size={17}/></summary><p>{answer}</p></details>)}</div>
        </section>

        <section className="access-scope-section" data-reveal><div className="access-kicker">CURRENT IMPLEMENTATION SCOPE</div><h2>prove the first path.<br/><em>then widen the gate.</em></h2><p>The gateway, Concordium account adapters, Agent Registry lookup, and x402 middleware are implemented. Live facilitator configuration and independently verified testnet payment evidence remain outstanding.</p><div className="access-scope-tags"><span>CONCORDIUM SIGNATURE</span><span>CIS-8004 AGENT BINDING</span><span>x402</span><span>FINALITY GATE</span><span>SANITIZED AUDIT</span></div><div className="access-status-note"><span className="access-status-dot"/><div><strong>Integration foundation built</strong><p>No live testnet payment or production deployment is claimed yet.</p></div></div></section>

        <section className="access-final"><div className="access-kicker">PACT ACCESS</div><h2>agents can move fast.<br/><em>access still follows the rules.</em></h2><a className="access-button" href="#flow">Follow the request <ArrowRight size={17}/></a><p>Proof-gated access for autonomous agents.</p></section>
      </main>

      <footer className="access-footer"><Link to="/" className="access-brand"><img className="access-brand-image" src="/pact-mark.svg" alt="" /><span>pact<span className="access-brand-dot">.</span></span></Link><span>Proof-gated access for autonomous agents.</span><a href="https://github.com/Tajudeeen/pact" target="_blank" rel="noreferrer">source code <ArrowUpRight size={13}/></a><small>© {new Date().getFullYear()} Pact · independent builder project</small></footer>
    </div>
  );
}

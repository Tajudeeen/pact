import { MarketHero, MarketWatch } from "../components/LiveMarkets";
import { GateMotion } from "../components/GateMotion";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  MoveUpRight,
  ShieldCheck,
  Link2,
  ScanLine,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Mark, Badge, CheckLine, Footer } from "../components/ui";
import { useApp } from "../state";
import { useState, type MouseEvent } from "react";
import { browserPreview } from "../api";
export function Landing() {
  const scrollToHow = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!browserPreview) return;
    event.preventDefault();
    document.getElementById("how")?.scrollIntoView({ behavior: "smooth" });
  };
  const { practice } = useApp(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const start = async () => {
    setBusy(true);
    try {
      await practice();
      navigate("/app");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="landing">
      <header className="site-header">
        <Link to="/" aria-label="Pact home">
          <Mark />
        </Link>
        <nav>
          <a href="#how" onClick={scrollToHow}>
            How it works
          </a>
          <Link to="/evidence">Built to be checked</Link>
        </nav>
        <Link to="/app" className="button small outline">
          Open workspace <ArrowUpRight size={16} />
        </Link>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <Badge>
              <i /> BUILT FOR DREAMDEX PERPS
            </Badge>
            <h1>
              A setup is shared.
              <br />
              <em>
                The decision
                <br className="desktop-br" /> is yours.
              </em>
            </h1>
            <p>
              A trade idea arrives in the group. Pact checks the entry, works
              out your size, and shows what you’re agreeing to before an order
              is sent.
            </p>
            <div className="hero-actions">
              <button
                className="button primary"
                onClick={() => void start()}
                disabled={busy}
              >
                {busy ? "Opening practice…" : "Try it without a wallet"}{" "}
                <ArrowUpRight size={18} />
              </button>
              <a href="#how" onClick={scrollToHow} className="muted-link">
                See how it works <ArrowRight size={16} />
              </a>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="hero-checks">
              <CheckLine>Personal risk rules</CheckLine>
              <CheckLine>One approval, one setup</CheckLine>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-grid" />
            <div className="floating-label">
              <span className="signal-dot" /> LIVE MARKET. YOUR TERMS.
            </div>
            <MarketHero />
            <GateMotion />
            <span className="visual-caption">
              Live testnet quotes · practice setups remain simulated
            </span>
          </div>
        </section>
        <div className="sponsor-line">
          <span>YOUR IDEA → YOUR TERMS → YOUR RECEIPT</span>
          <span>
            Execution built around <b>dreamDEX</b> on Somnia
          </span>
        </div>
        <MarketWatch />
        <section className="problem-section">
          <div className="eyebrow">THE PRICE OF “JUST COPY THE TRADE”</div>
          <h2>
            The same message
            <br />
            isn’t the same trade.
          </h2>
          <p>
            Different account. Different arrival time. Different risk. A setup
            should earn your approval under the conditions you’ll actually
            trade.
          </p>
          <div className="problem-stats">
            <div>
              <span>01</span>
              <h3>You arrive later.</h3>
              <p>The entry that made sense an hour ago may already be gone.</p>
            </div>
            <div>
              <span>02</span>
              <h3>Your account is different.</h3>
              <p>
                Someone else’s position size says nothing about what fits your
                budget.
              </p>
            </div>
            <div>
              <span>03</span>
              <h3>You deserve the details.</h3>
              <p>
                See the price bound, planned risk and protection mode before
                approving.
              </p>
            </div>
          </div>
        </section>
        <section id="how" className="how-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                FROM SHARED IDEA TO PERSONAL DECISION
              </div>
              <h2>
                Three steps.
                <br />
                Nothing left implied.
              </h2>
            </div>
            <Link to="/app" className="muted-link">
              Explore the workspace <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="step-grid">
            <article className="step-card step-share">
              <div className="step-top">
                <Link2 size={20} />
                <span>01 / SHARE</span>
              </div>
              <div className="step-art setup-slip" aria-hidden="true">
                <span>THE SHARED IDEA</span>
                <strong>
                  BTC <i>/</i> LONG
                </strong>
                <div>
                  <span>
                    ENTRY
                    <br />
                    <b>67,400–67,800</b>
                  </span>
                  <span>
                    STOP
                    <br />
                    <b>66,400</b>
                  </span>
                  <span>
                    TARGET
                    <br />
                    <b>71,000</b>
                  </span>
                </div>
                <small>Illustrative practice terms</small>
              </div>
              <h3>Publish the setup</h3>
              <p>
                Define the entry range, stop, target and window. Share one set
                of terms.
              </p>
            </article>
            <article className="step-card step-check">
              <div className="step-top">
                <ShieldCheck size={20} />
                <span>02 / CHECK</span>
              </div>
              <div className="step-art decision-slips" aria-hidden="true">
                <div>
                  <span>STANDARD ACCOUNT</span>
                  <strong>
                    <Check size={14} /> Within terms
                  </strong>
                </div>
                <div>
                  <span>LATE ARRIVAL</span>
                  <strong>× Entry missed</strong>
                </div>
                <small>Illustrative practice decisions</small>
              </div>
              <h3>Make it personal</h3>
              <p>
                One idea can earn different decisions. Your account and your
                rules set the size.
              </p>
            </article>
            <article className="step-card step-record">
              <div className="step-top">
                <ScanLine size={20} />
                <span>03 / VERIFY</span>
              </div>
              <div className="step-art receipt-slip" aria-hidden="true">
                <div>
                  <span>PACT / RECEIPT</span>
                  <span className="receipt-mini-mark">{"{P}"}</span>
                </div>
                <p>
                  Approval <b>Recorded</b>
                </p>
                <p>
                  Execution <b>Observed</b>
                </p>
                <div className="receipt-barcode" />
                <small>Illustrative practice record</small>
              </div>
              <h3>Keep the receipt</h3>
              <p>
                Follow the execution trail. Take the terms and observed outcome
                with you.
              </p>
            </article>
          </div>
        </section>
        <section className="honesty-section">
          <div>
            <Badge tone="cream">BUILT TO BE CHECKED</Badge>
            <h2>
              A confirmation should
              <br />
              come with evidence.
            </h2>
            <p>
              Practice stays labeled as practice. A submitted order stays
              pending until observed. Monitored exits stay distinct from native
              protection.
            </p>
            <Link to="/evidence" className="button light">
              See what Pact can prove <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="proof-list">
            {[
              "Versioned setup and approval terms",
              "Separate submitted and filled states",
              "Protection mode you can inspect",
              "Downloadable execution receipts",
            ].map((t, i) => (
              <div key={t}>
                <span>0{i + 1}</span>
                <p>{t}</p>
                <Check size={18} />
              </div>
            ))}
          </div>
        </section>
        <section className="final-cta">
          <span className="eyebrow">ONE SETUP. YOUR TERMS.</span>
          <h2>
            Check it before
            <br />
            you take it.
          </h2>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void start()}
          >
            Start with a practice setup <ArrowUpRight size={18} />
          </button>
          <p>No wallet. No funds. A complete practice workflow.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}

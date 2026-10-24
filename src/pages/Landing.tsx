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
import { Mark, Badge, CheckLine } from "../components/ui";
import { useApp } from "../state";
import { useState } from "react";
export function Landing() {
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
          <a href="#how">How it works</a>
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
              <a href="#how" className="muted-link">
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
              <span className="signal-dot" /> A SHARED IDEA. A PERSONAL CHECK.
            </div>
            <article className="sample-plan">
              <div className="card-top">
                <span className="coin">₿</span>
                <div>
                  <strong>BTC pullback</strong>
                  <small>BTC-PERP · Long</small>
                </div>
                <Badge tone="neutral">Practice</Badge>
              </div>
              <div className="sample-price">
                <span>ENTRY RANGE</span>
                <strong>
                  67,400 <span>to</span> 67,800
                </strong>
              </div>
              <div className="range-track">
                <span className="stop-dot" />
                <span className="entry-block" />
                <span className="target-dot" />
              </div>
              <div className="range-labels">
                <span>
                  Stop
                  <br />
                  <b>66,400</b>
                </span>
                <span>
                  Entry
                  <br />
                  <b>67,600</b>
                </span>
                <span>
                  Target
                  <br />
                  <b>71,000</b>
                </span>
              </div>
              <div className="personal-check">
                <ShieldCheck size={21} />
                <div>
                  <strong>Your account. Your check.</strong>
                  <small>
                    Size depends on your rules and current conditions.
                  </small>
                </div>
                <Check size={18} />
              </div>
              <Link to="/p/btc-pullback" className="sample-action">
                Check this setup for me <ArrowRight size={18} />
              </Link>
            </article>
            <div className="late-note">
              <div className="late-icon">↗</div>
              <div>
                <strong>Arrived after the entry?</strong>
                <p>Pact tells you why the setup no longer fits.</p>
              </div>
            </div>
            <span className="visual-caption">
              Illustrative practice setup · simulated prices
            </span>
          </div>
        </section>
        <div className="sponsor-line">
          <span>YOUR IDEA → YOUR TERMS → YOUR RECEIPT</span>
          <span>
            Execution built around <b>dreamDEX</b> on Somnia
          </span>
        </div>
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
            {[
              [
                Link2,
                "01 / SHARE",
                "Publish the setup",
                "Define an entry range, stop, target and entry window. Share one link.",
              ],
              [
                ShieldCheck,
                "02 / CHECK",
                "Make it personal",
                "Check current conditions against your account and risk rules. Get a size, or a clear refusal.",
              ],
              [
                ScanLine,
                "03 / VERIFY",
                "Keep the receipt",
                "Approve one setup. Follow the order timeline and inspect the recorded outcome.",
              ],
            ].map(([Icon, n, t, d]) => {
              const I = Icon as typeof Link2;
              return (
                <article className="step-card" key={String(n)}>
                  <div className="step-top">
                    <I size={26} />
                    <span>{String(n)}</span>
                  </div>
                  <h3>{String(t)}</h3>
                  <p>{String(d)}</p>
                </article>
              );
            })}
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
      <footer className="site-footer">
        <Mark />
        <p>Shared ideas. Personal decisions.</p>
        <Link to="/evidence">
          Evidence & limitations <ArrowUpRight size={14} />
        </Link>
        <span>© {new Date().getFullYear()} Pact</span>
      </footer>
    </div>
  );
}

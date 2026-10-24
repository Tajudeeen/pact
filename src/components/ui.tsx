import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { NavLink, Link, useNavigate } from "react-router";
import { useApp } from "../state";
import { browserPreview, short } from "../api";
export function Mark() {
  return (
    <span className="brand-lockup">
      <span className="wordmark">
        <svg width="25" height="29" viewBox="0 0 25 29" aria-hidden="true">
          <path
            d="M3 26V5h10a7 7 0 0 1 0 14H8"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path d="m16 14 6-6" stroke="var(--accent)" strokeWidth="4" />
        </svg>
        pact<span className="brand-dot">.</span>
      </span>
      <span className="brand-powered">
        built on{" "}
        <span className="dreamdex-signature">
          <img
            className="dreamdex-symbol"
            src="/brand/dreamdex-mark.svg"
            alt=""
          />
          <img
            className="dreamdex-wordmark"
            src="/brand/dreamdex-wordmark.svg"
            alt="dreamDEX"
          />
        </span>
      </span>
    </span>
  );
}
export function Badge({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function ErrorBox({ message }: { message: string | null }) {
  return message ? (
    <div className="error" role="alert">
      <TriangleAlert size={17} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span /> Loading Pact
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <ShieldCheck size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function PageTitle({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const { session, logout } = useApp();
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link to="/" aria-label="Pact home">
          <Mark />
        </Link>
        <div className="side-label">YOUR WORKSPACE</div>
        <nav>
          <NavLink to="/app" end>
            <span>01</span> Setups
          </NavLink>
          <NavLink to="/app/positions">
            <span>02</span> My orders
          </NavLink>
          <NavLink to="/app/rules">
            <span>03</span> Risk rules
          </NavLink>
          <NavLink to="/app/account">
            <span>04</span> Account
          </NavLink>
        </nav>
        <div className="side-bottom">
          <div className="side-note">
            <ShieldCheck size={18} />
            <p>
              Your approval covers one setup. Future setups need a new decision.
            </p>
          </div>
          <Link to="/evidence">
            How to verify Pact <ArrowUpRight size={15} />
          </Link>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="appbar">
          <Link to="/" className="mobile-brand">
            <Mark />
          </Link>
          <span className="appbar-label">ONE SETUP. YOUR TERMS.</span>
          <div className="appbar-right">
            <Badge tone={session?.mode === "testnet" ? "amber" : "green"}>
              <i />
              {session?.mode === "testnet"
                ? "Tokyo testnet"
                : "Practice environment"}
            </Badge>
            {session ? (
              <button
                className="text-button account-link"
                onClick={() => void logout()}
                title="Sign out"
              >
                {session.mode === "replay"
                  ? "Practice session"
                  : short(session.owner)}{" "}
                <span>↗</span>
              </button>
            ) : (
              <Link to="/app/account" className="text-button">
                Connect wallet
              </Link>
            )}
          </div>
        </header>
        <nav className="mobile-tabs">
          <NavLink to="/app" end>
            Setups
          </NavLink>
          <NavLink to="/app/positions">Orders</NavLink>
          <NavLink to="/app/rules">Rules</NavLink>
          <NavLink to="/app/account">Account</NavLink>
        </nav>
        <main className="workspace-content">{children}</main>
        <Footer workspace />
      </div>
    </div>
  );
}
export function StartGate({ children }: { children: ReactNode }) {
  const { session, loading, practice, error } = useApp();
  const navigate = useNavigate();
  if (loading) return <Loading />;
  if (session) return <>{children}</>;
  return (
    <div className="gate panel">
      <Badge>START WITH PRACTICE</Badge>
      <h2>
        Make the decision
        <br />
        before taking the trade.
      </h2>
      <p>
        Try personal sizing, late-entry checks and order receipts with simulated
        funds. No wallet needed.
      </p>
      <ErrorBox message={error} />
      <button
        className="button primary"
        onClick={() => void practice().catch(() => navigate("/app/account"))}
      >
        Start a practice session <ChevronRight size={17} />
      </button>
      <Link to="/app/account" className="muted-link">
        Or connect a testnet wallet <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}
export function CheckLine({ children }: { children: ReactNode }) {
  return (
    <span className="check-line">
      <Check size={15} />
      {children}
    </span>
  );
}

export function Footer({ workspace = false }: { workspace?: boolean }) {
  const { config } = useApp();
  return (
    <footer
      className={"pact-footer" + (workspace ? " pact-footer-workspace" : "")}
    >
      <div className="footer-top">
        <div className="footer-identity">
          <Link to="/" aria-label="Pact home">
            <Mark />
          </Link>
          <p>
            A shared setup.
            <br />A decision on your terms.
          </p>
        </div>
        <nav aria-label="Pact footer">
          <h2>Explore Pact</h2>
          <Link to="/app">Setups</Link>
          <Link to="/app/rules">Risk rules</Link>
          <Link to="/app/positions">Orders & receipts</Link>
          <Link to="/evidence">Evidence & limits</Link>
        </nav>
        <nav aria-label="dreamDEX resources">
          <h2>Built on dreamDEX</h2>
          <a
            href="https://app.testnet.dreamdex.io"
            target="_blank"
            rel="noreferrer"
          >
            Open testnet <ArrowUpRight size={12} />
          </a>
          <a
            href="https://app.testnet.dreamdex.io/docs/developers/perps-testnet"
            target="_blank"
            rel="noreferrer"
          >
            Developer docs <ArrowUpRight size={12} />
          </a>
          <a
            href="https://github.com/Tajudeeen/pact"
            target="_blank"
            rel="noreferrer"
          >
            Source · private <ArrowUpRight size={12} />
          </a>
        </nav>
        <div className="footer-network">
          <span className="footer-network-label">
            <i /> SOMNIA TOKYO
          </span>
          <strong>Chain 50383</strong>
          <p>
            {browserPreview
              ? "Practice preview. No live orders."
              : config?.testnetEnabled
                ? "Testnet configured. Orders require approval."
                : "Testnet setup pending. Practice is available."}
          </p>
          <Link to="/app/account">
            Account setup <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} Pact · Independent builder project
        </span>
        <span>Planned risk is an estimate, never a maximum loss.</span>
      </div>
    </footer>
  );
}

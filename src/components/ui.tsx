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
import { short } from "../api";
export function Mark() {
  return (
    <span className="wordmark">
      <svg width="25" height="29" viewBox="0 0 25 29" aria-hidden="true">
        <path
          d="M3 26V5h10a7 7 0 0 1 0 14H8"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path d="m16 14 6-6" stroke="#d47c42" strokeWidth="4" />
      </svg>
      pact<span className="brand-dot">.</span>
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
        <footer className="app-footer">
          <span>Pact · Built for dreamDEX</span>
          <span>Planned risk is an estimate, never a maximum loss.</span>
        </footer>
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

import { useState } from "react";
import { Activity, ArrowLeft, ArrowUpRight, Bot, CreditCard, LayoutDashboard, Menu, ShieldCheck, Settings, X } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router";

const navigation = [
  { to: "/app/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/app/agents", label: "Agents", icon: Bot },
  { to: "/app/verification", label: "Verification", icon: ShieldCheck },
  { to: "/app/payments", label: "Payments", icon: CreditCard },
  { to: "/app/activity", label: "Activity", icon: Activity },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function WorkspaceLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="workspace">
      <aside className={mobileOpen ? "workspace-sidebar is-open" : "workspace-sidebar"}>
        <div className="workspace-sidebar-head">
          <Link to="/" className="workspace-brand" aria-label="Pact public homepage">
            <img src="/pact-mark.svg" alt="" />
            <span>pact<span>.</span></span>
          </Link>
          <button className="workspace-icon-button workspace-mobile-close" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18}/></button>
        </div>
        <div className="workspace-nav-label">WORKSPACE</div>
        <nav className="workspace-nav" aria-label="Workspace navigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive ? "workspace-nav-link is-active" : "workspace-nav-link"}>
              <Icon size={17} strokeWidth={1.8}/><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="workspace-sidebar-bottom">
          <div className="workspace-network-indicator"><i/> Concordium Testnet</div>
          <Link to="/" className="workspace-back-link"><ArrowLeft size={15}/> Back to public site</Link>
        </div>
      </aside>

      {mobileOpen && <button className="workspace-scrim" type="button" aria-label="Close navigation overlay" onClick={() => setMobileOpen(false)}/>}

      <div className="workspace-main">
        <header className="workspace-topbar">
          <button className="workspace-icon-button workspace-mobile-trigger" type="button" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={19}/></button>
          <div className="workspace-breadcrumb"><span>PACT ACCESS</span><b>/</b><strong>WORKSPACE</strong></div>
          <div className="workspace-topbar-right"><span className="workspace-mode"><i/> TESTNET ENVIRONMENT</span><a href="https://github.com/Tajudeeen/pact" target="_blank" rel="noreferrer" aria-label="Pact source repository"><ArrowUpRight size={16}/></a></div>
        </header>
        <main className="workspace-content"><Outlet/></main>
        <footer className="workspace-footer"><span>PACT ACCESS</span><span>Proof-gated access for autonomous agents.</span><span>Testnet workspace</span></footer>
      </div>
    </div>
  );
}

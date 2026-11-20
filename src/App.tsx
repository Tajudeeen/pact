import { Route, Routes, Navigate, useLocation, Link } from "react-router";
import { useLayoutEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Landing } from "./pages/Landing";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import { Overview } from "./pages/workspace/Overview";
import { Agents } from "./pages/workspace/Agents";
import { Verification } from "./pages/workspace/Verification";
import { Payments } from "./pages/workspace/Payments";
import { ActivityPage } from "./pages/workspace/Activity";
import { Settings } from "./pages/workspace/Settings";

function WorkspaceNotFound() {
  return (
    <div className="workspace-page">
      <section className="workspace-empty-state">
        <div className="workspace-eyebrow">404 / ROUTE NOT FOUND</div>
        <h2>This workspace route doesn't exist.</h2>
        <p>Use the workspace navigation to open an available Pact Access section.</p>
        <Link className="workspace-back-link" to="/app/overview"><ArrowLeft size={15}/> Return to overview</Link>
      </section>
    </div>
  );
}

export function App() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<WorkspaceLayout />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="agents" element={<Agents />} />
        <Route path="verification" element={<Verification />} />
        <Route path="payments" element={<Payments />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<WorkspaceNotFound />} />
      </Route>
      <Route path="/evidence" element={<Navigate to="/app/activity" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

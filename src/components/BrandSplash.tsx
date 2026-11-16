import { useEffect, useState } from "react";

export function BrandSplash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timeout = window.setTimeout(() => setVisible(false), reducedMotion ? 400 : 1800);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <div className="access-splash" role="status" aria-label="Pact is loading">
      <div className="access-splash-lockup">
        <img className="access-splash-mark" src="/pact-mark.svg" alt="" />
        <span className="access-splash-word">pact<span>.</span></span>
      </div>
      <div className="access-splash-progress" aria-hidden="true"><span /></div>
      <p>PROOF-GATED AGENT ACCESS</p>
    </div>
  );
}

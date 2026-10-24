import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

export function BrandAtmosphere() {
  const [paused, setPaused] = useState(() => {
    try {
      return sessionStorage.getItem("pact:backdrop-paused") === "true";
    } catch {
      return false;
    }
  });
  const [reduced, setReduced] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference?.matches ?? false);
    const visibility = () => setHidden(document.hidden);
    update();
    visibility();
    preference?.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      preference?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const toggle = () => {
    const next = !paused;
    setPaused(next);
    try {
      sessionStorage.setItem("pact:backdrop-paused", String(next));
    } catch {
      /* Optional browser preference. */
    }
  };
  return (
    <>
      <div
        className="brand-atmosphere"
        data-paused={paused || reduced || hidden}
        aria-hidden="true"
      >
        <div className="ambient-mark">
          <div className="ambient-sweep" />
        </div>
        <span className="ambient-register ambient-register-a" />
        <span className="ambient-register ambient-register-b" />
      </div>
      <button
        type="button"
        className="ambient-control"
        onClick={toggle}
        disabled={reduced}
        aria-pressed={paused || reduced}
        aria-label={
          reduced
            ? "Background motion off, follows reduced motion setting"
            : paused
              ? "Play background motion"
              : "Pause background motion"
        }
      >
        {paused || reduced ? <Play size={11} /> : <Pause size={11} />}
        <span>
          {reduced
            ? "Motion reduced"
            : paused
              ? "Backdrop paused"
              : "Pause backdrop"}
        </span>
      </button>
    </>
  );
}

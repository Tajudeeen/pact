import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

export function GateMotion() {
  const [late, setLate] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return (
    <section
      ref={host}
      className="gate-motion"
      data-outcome={late ? "blocked" : "inside"}
      data-paused={paused || !visible}
      aria-label="Illustrative entry gate"
    >
      <div className="gate-motion-heading">
        <span>ONE SETUP. ONE GATE.</span>
        <button
          type="button"
          className="gate-pause"
          onClick={() => setPaused(!paused)}
          aria-label={paused ? "Play entry diagram" : "Pause entry diagram"}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
      </div>
      <div
        className="gate-options"
        role="group"
        aria-label="Illustrative arrival time"
      >
        <button
          type="button"
          aria-pressed={!late}
          onClick={() => setLate(false)}
        >
          Inside the entry
        </button>
        <button type="button" aria-pressed={late} onClick={() => setLate(true)}>
          Arrived too late
        </button>
      </div>
      <svg viewBox="0 0 460 104" aria-hidden="true" className="gate-circuit">
        <path className="gate-track" d="M40 44H422" />
        <path className="gate-track-destination" d="M176 44H422" />
        <g className="gate-source">
          <rect x="27" y="31" width="26" height="26" rx="5" />
          <path d="M34 40h12M34 46h9" />
        </g>
        <g className="gate-check">
          <path d="M168 25v38M180 25v38" />
          <path className="gate-arm" d="M174 29v30" />
        </g>
        <g className="gate-consent">
          <circle cx="302" cy="44" r="13" />
          <path d="m296 44 4 4 8-9" />
        </g>
        <g className="gate-receipt">
          <path d="M410 27h23v34l-6-3-5 3-6-3-6 3Z" />
          <path d="M416 37h11M416 43h11M416 49h7" />
        </g>
        <circle className="gate-packet" cx="40" cy="44" r="4" />
        <text x="40" y="88" textAnchor="middle">
          SETUP
        </text>
        <text x="174" y="88" textAnchor="middle">
          RISK CHECK
        </text>
        <text x="302" y="88" textAnchor="middle">
          CONSENT
        </text>
        <text x="422" y="88" textAnchor="middle">
          RECEIPT
        </text>
      </svg>
      <p className="gate-caption" aria-live="polite">
        {late
          ? "Price left the entry. The signal stops here."
          : "A setup that fits can reach your approval."}
        <small>Illustrative practice sequence. No order is sent.</small>
      </p>
    </section>
  );
}

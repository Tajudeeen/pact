// Decorative placement only. Exact trading calculations stay in src/core/risk.
export function SetupRange({
  entryMin,
  entryMax,
  stop,
  target,
}: {
  entryMin: string;
  entryMax: string;
  stop: string;
  target: string;
}) {
  const values = [entryMin, entryMax, stop, target].map(Number);
  const min = Math.min(...values),
    max = Math.max(...values);
  if (!values.every(Number.isFinite) || max <= min) return null;
  const x = (value: string) => 12 + ((Number(value) - min) / (max - min)) * 276;
  return (
    <svg viewBox="0 0 300 48" className="setup-range" aria-hidden="true">
      <path d="M12 24H288" className="setup-range-track" />
      {[12, 81, 150, 219, 288].map((at) => (
        <path key={at} d={`M${at} 20v8`} className="setup-range-tick" />
      ))}
      <rect
        x={x(entryMin)}
        y="14"
        width={Math.max(2, x(entryMax) - x(entryMin))}
        height="20"
        className="setup-range-entry"
      />
      <circle cx={x(stop)} cy="24" r="4" className="setup-range-stop" />
      <rect
        x={x(target) - 4}
        y="20"
        width="8"
        height="8"
        className="setup-range-target"
      />
    </svg>
  );
}

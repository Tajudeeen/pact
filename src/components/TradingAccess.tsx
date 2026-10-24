import { useEffect, useRef, useState } from "react";
import { api, browserPreview } from "../api";
import { useApp } from "../state";
import type { TradingReadiness } from "../core/readiness";
import { Badge, ErrorBox } from "./ui";

export function TradingAccess() {
  const { session, config } = useApp();
  const [market, setMarket] = useState("BTC-PERP");
  const [result, setResult] = useState<TradingReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [age, setAge] = useState(0);
  const request = useRef<AbortController | null>(null);
  const received = useRef(0);
  const initialAge = useRef(0);
  const owner = session?.mode === "testnet" ? session.owner : null;
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setResult(null);
    setError(null);
    setBusy(false);
    return () => request.current?.abort();
  }, [owner, market]);
  useEffect(() => {
    if (!result) return;
    const timer = setInterval(
      () => setAge(initialAge.current + Date.now() - received.current),
      1000,
    );
    return () => clearInterval(timer);
  }, [result]);
  const check = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    const timer = setTimeout(() => controller.abort(), 16000);
    try {
      const data = await api<TradingReadiness>("/readiness?market=" + market, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (
        data.chainId !== 50383 ||
        data.readOnly !== true ||
        data.owner.toLowerCase() !== owner?.toLowerCase() ||
        data.market !== market ||
        !Number.isFinite(data.validForMs) ||
        data.validForMs < 0 ||
        data.validForMs > 30000 ||
        !data.checks.length
      )
        throw new Error(
          "The access report does not match this wallet, market, or testnet.",
        );
      received.current = Date.now();
      initialAge.current = 30000 - data.validForMs;
      setAge(initialAge.current);
      setResult(data);
    } catch (e) {
      if (request.current === controller)
        setError(
          controller.signal.aborted
            ? "Access check timed out. Try again."
            : (e as Error).message,
        );
    } finally {
      clearTimeout(timer);
      if (request.current === controller) setBusy(false);
    }
  };
  const stale = age >= 30000;
  return (
    <section
      className="panel trading-access"
      aria-labelledby="trading-access-title"
    >
      <div className="section-top">
        <h2 id="trading-access-title">Check testnet access.</h2>
        <Badge tone="neutral">READ ONLY</Badge>
      </div>
      <p className="muted">
        Find missing operator permissions, STT gas, perps margin, or conflicting
        positions before creating your first testnet setup. This check never
        signs or places an order.
      </p>
      {browserPreview ? (
        <a
          className="button outline"
          href="https://pact-testnet.tajudeenowoeteniyan.workers.dev/app/account"
          target="_blank"
          rel="noreferrer"
        >
          Check access in the testnet app
        </a>
      ) : (
        <>
          <label className="field">
            <span>Market to check</span>
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              <option>BTC-PERP</option>
              <option>ETH-PERP</option>
            </select>
          </label>
          <button
            className="button outline"
            disabled={busy || !owner || !config?.testnetEnabled}
            onClick={() => void check()}
          >
            {busy ? "Reading testnet access…" : "Check testnet access"}
          </button>
          {!owner && (
            <p className="tiny muted">
              Sign in with your wallet above to check its access.
            </p>
          )}
          <ErrorBox message={error} />
          {result && (
            <div role="status">
              <p>
                <Badge tone={stale || !result.ready ? "amber" : "green"}>
                  {stale
                    ? "CHECK EXPIRED"
                    : result.ready
                      ? "ACCESS CHECKS PASSED"
                      : "SETUP NEEDED"}
                </Badge>
              </p>
              <p className="tiny muted">
                {stale
                  ? "Run the check again. These observations are over 30 seconds old."
                  : "Observed " +
                    Math.floor(age / 1000) +
                    " seconds ago. This does not approve or guarantee an order."}
              </p>
              <ul className="access-checks">
                {result.checks.map((c) => (
                  <li key={c.id} data-status={c.status}>
                    <div>
                      <strong>{c.label}</strong>
                      <span>
                        {stale
                          ? "Expired"
                          : c.status === "pass"
                            ? "Passed"
                            : "Action needed"}
                      </span>
                    </div>
                    <p>{c.detail}</p>
                  </li>
                ))}
              </ul>
              <p className="tiny muted">
                Chain {result.chainId} · {result.market} · Pool{" "}
                <code>{result.pool}</code>
              </p>
              <p className="tiny muted">
                A setup still needs a fresh price, account-specific sizing, your
                explicit approval, and a successful order simulation. Keep
                enough STT for closing. Monitored exits depend on Pact and RPC
                availability.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

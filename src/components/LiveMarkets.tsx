import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { api, price } from "../api";
import {
  WATCH_MARKETS,
  QUOTE_REFRESH_MS,
  marketBoardSchema,
  quoteStatus,
  type MarketBoard,
} from "../core/markets";

const MarketContext = createContext<{
  board: MarketBoard | null;
  error: string | null;
  now: number;
  retry: () => void;
}>({ board: null, error: null, now: Date.now(), retry: () => {} });
export function MarketProvider({ children }: { children: ReactNode }) {
  const [board, setBoard] = useState<MarketBoard | null>(null),
    [error, setError] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  const [received, setReceived] = useState(0),
    [clock, setClock] = useState(Date.now);
  useEffect(() => {
    let active: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>,
      stopped = false,
      busy = false;
    const run = async () => {
      if (stopped || busy) return;
      if (document.hidden) {
        timer = setTimeout(() => void run(), QUOTE_REFRESH_MS);
        return;
      }
      busy = true;
      active = new AbortController();
      const deadline = setTimeout(() => active?.abort(), 16000);
      try {
        const data = marketBoardSchema.parse(
          await api<unknown>("/markets", { signal: active.signal }),
        );
        if (!stopped) {
          setBoard(data);
          setReceived(Date.now());
          setClock(Date.now());
          setError(null);
        }
      } catch {
        if (!stopped)
          setError(
            "Live quotes are unavailable. Retained prices are marked stale.",
          );
      } finally {
        clearTimeout(deadline);
        active = undefined;
        busy = false;
        if (!stopped) timer = setTimeout(() => void run(), QUOTE_REFRESH_MS);
      }
    };
    const visible = () => {
      if (!document.hidden && !busy) {
        clearTimeout(timer);
        void run();
      }
    };
    void run();
    document.addEventListener("visibilitychange", visible);
    const tick = setInterval(() => {
      if (!document.hidden) setClock(Date.now());
    }, 1000);
    return () => {
      stopped = true;
      active?.abort();
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [revision]);
  const now = board ? board.readAt + Math.max(0, clock - received) : clock;
  return (
    <MarketContext.Provider
      value={{ board, error, now, retry: () => setRevision((r) => r + 1) }}
    >
      {children}
    </MarketContext.Provider>
  );
}
function useQuote(market: string) {
  const ctx = useContext(MarketContext),
    row = ctx.board?.rows.find((r) => r.market === market);
  const status = row
    ? quoteStatus({ ...row, error: ctx.error ?? row.error }, ctx.now)
    : ctx.error
      ? "unavailable"
      : "loading";
  const age =
    row?.observedAt === null || row?.observedAt === undefined
      ? null
      : Math.max(0, Math.floor((ctx.now - row.observedAt) / 1000));
  return { ...ctx, row, status, age };
}
const amount = (value: string | null | undefined) =>
  value ? "$" + price(value) : "Unavailable";
export function LivePrice({ market }: { market: string }) {
  const { row, status, age } = useQuote(market);
  return (
    <div className="live-price-inline" data-status={status}>
      <span>
        <i />{" "}
        {status === "loading"
          ? "Loading live quote"
          : status === "live"
            ? "Live testnet mark"
            : status === "stale"
              ? "Stale testnet mark"
              : "Live mark unavailable"}
      </span>
      <strong>{amount(row?.mark)}</strong>
      {age !== null && <small>read {age}s ago</small>}
    </div>
  );
}
function QuoteTile({
  market,
  hero = false,
}: {
  market: string;
  hero?: boolean;
}) {
  const { row, status, age } = useQuote(market);
  return (
    <article
      className={hero ? "sample-plan live-hero-card" : "quote-tile"}
      data-status={status}
    >
      <div className="quote-tile-top">
        <span>{market}</span>
        <span className="quote-state">
          <i />
          {status === "live" ? "LIVE" : status.toUpperCase()}
        </span>
      </div>
      <span className="quote-caption">
        {status === "stale"
          ? "LAST VALID MARK · USDso"
          : "TESTNET MARK · USDso"}
      </span>
      <strong className="quote-value">
        {status === "loading" ? "Reading chain…" : amount(row?.mark)}
      </strong>
      <div className="quote-book">
        <span>
          Bid <b>{amount(row?.bid)}</b>
        </span>
        <span>
          Ask <b>{amount(row?.ask)}</b>
        </span>
      </div>
      <div className="quote-provenance">
        <span>dreamDEX · Chain 50383</span>
        <span>{age === null ? "No observation yet" : `Read ${age}s ago`}</span>
      </div>
      {row?.oracleUpdatedAt && (
        <small className="quote-oracle">
          Index oracle · {new Date(row.oracleUpdatedAt).toLocaleTimeString()}
        </small>
      )}
      {(row?.error || status === "unavailable") && (
        <p className="quote-error">
          {row?.error ?? "Waiting for a valid on-chain observation."}
        </p>
      )}
      {hero && (
        <>
          <p className="quote-explainer">
            A live market read. Your setup and approval come next.
          </p>
          <Link to="/app/new" className="sample-action">
            Create your setup <ArrowUpRight size={17} />
          </Link>
        </>
      )}
    </article>
  );
}
export function MarketHero() {
  return <QuoteTile market="BTC-PERP" hero />;
}
export function MarketWatch() {
  const { error, retry } = useContext(MarketContext);
  return (
    <section className="market-watch" aria-label="Live dreamDEX testnet prices">
      <div className="market-watch-heading">
        <div>
          <span className="eyebrow">MARKET WATCH</span>
          <p>
            dreamDEX on-chain quotes · Tokyo testnet · refreshes every 10
            seconds
          </p>
        </div>
        {error && (
          <button type="button" className="text-button" onClick={retry}>
            <RefreshCw size={13} /> Retry quotes
          </button>
        )}
      </div>
      <div className="quote-grid">
        {WATCH_MARKETS.map((m) => (
          <QuoteTile key={m} market={m} />
        ))}
      </div>
    </section>
  );
}

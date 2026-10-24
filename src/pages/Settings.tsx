import { LivePrice } from "../components/LiveMarkets";
import { TradingAccess } from "../components/TradingAccess";
import { EntryControl } from "../components/EntryControl";
import { requireTokyo, confirmWallet } from "../wallet";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import {
  Copy,
  ArrowUpRight,
  Wallet,
  Plus,
  Check,
  ShieldCheck,
} from "lucide-react";
import { api, browserPreview, short, usd } from "../api";
import { useApp, useLoad } from "../state";
import {
  DEFAULT_POLICY,
  type Policy,
  type Plan,
  type Account,
} from "../core/types";
import {
  Badge,
  ErrorBox,
  Field,
  Loading,
  PageTitle,
  StartGate,
} from "../components/ui";
export function Rules() {
  const { session } = useApp();
  const data = useLoad("rules:" + session?.owner, (s) =>
    api<Policy>("/policy", { signal: s }),
  );
  const [form, setForm] = useState<Policy>(DEFAULT_POLICY),
    [error, setError] = useState<string | null>(null),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data.value) setForm(data.value);
  }, [data.value]);
  const set = (k: keyof Policy, v: string) => {
    setSaved(false);
    setForm((f) => ({
      ...f,
      [k]: ["slippageBps", "fundingHours"].includes(k) ? Number(v) : v,
    }));
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/policy", { method: "PUT", body: form });
      setSaved(true);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="PERSONAL RULES, APPLIED BEFORE EVERY ORDER"
        title="Choose your boundaries."
      >
        Pact sizes around these rules. Planned loss remains an estimate.
      </PageTitle>
      <StartGate>
        <form className="panel form-panel" onSubmit={(e) => void submit(e)}>
          <h2>Risk budget</h2>
          <div className="form-grid">
            {[
              ["risk", "Planned risk per trade", "10"],
              ["totalRisk", "Total active planned risk", "30"],
              ["dailyLoss", "Daily loss budget", "50"],
              ["maxNotional", "Maximum position notional", "500"],
              ["slippageBps", "Slippage reserve, basis points", "20"],
              ["fundingHours", "Funding reserve, hours", "8"],
              ["minRewardRisk", "Minimum reward / risk", "1.5"],
            ].map(([k, l, p]) => (
              <Field
                key={k}
                label={l}
                hint={
                  k === "maxNotional"
                    ? "Testnet has an additional $25 server cap."
                    : undefined
                }
              >
                <input
                  required
                  inputMode="decimal"
                  value={form[k as keyof Policy]}
                  placeholder={p}
                  onChange={(e) => set(k as keyof Policy, e.target.value)}
                />
              </Field>
            ))}
          </div>
          <ErrorBox message={error ?? data.error} />
          <div className="form-bottom">
            <p className="tiny muted">
              Changing these rules invalidates existing previews. An approved
              open position keeps its recorded terms.
            </p>
            <button className="button primary" type="submit">
              {saved ? (
                <>
                  <Check size={16} /> Rules saved
                </>
              ) : (
                "Save risk rules"
              )}
            </button>
          </div>
        </form>
      </StartGate>
    </>
  );
}
export function NewPlan() {
  const { session, config } = useApp(),
    navigate = useNavigate();
  const [market, setMarket] = useState("BTC-PERP"),
    [mode, setMode] = useState("replay"),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fields = new FormData(e.currentTarget);
    try {
      const plan = await api<Plan>("/plans", {
        method: "POST",
        body: {
          title: fields.get("title"),
          market,
          direction: fields.get("direction"),
          entryMin: fields.get("entryMin"),
          entryMax: fields.get("entryMax"),
          stop: fields.get("stop"),
          target: fields.get("target"),
          expiresAt: Date.now() + Number(fields.get("window")) * 3600000,
          rationale: fields.get("rationale"),
          mode,
        },
      });
      navigate("/p/" + plan.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="SHARE THE CONDITIONS, NOT JUST THE DIRECTION"
        title="Publish a setup."
      >
        A price range, an invalidation level, and a window to decide.
      </PageTitle>
      <StartGate>
        <form className="panel form-panel" onSubmit={(e) => void submit(e)}>
          <LivePrice market={market} />
          <p className="tiny muted">
            Live mark is a reference. Enter and approve your own setup terms.
          </p>
          <div className="form-grid">
            <Field label="Setup name">
              <input
                name="title"
                required
                minLength={4}
                maxLength={80}
                placeholder="BTC, wait for the pullback"
              />
            </Field>
            <Field label="Environment">
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="replay">Practice · simulated market</option>
                <option
                  value="testnet"
                  disabled={
                    !config?.testnetEnabled || session?.mode !== "testnet"
                  }
                >
                  Tokyo testnet
                  {!config?.testnetEnabled ? " · operator setup needed" : ""}
                </option>
              </select>
            </Field>
            <Field label="Market">
              <select
                value={market}
                onChange={(e) => setMarket(e.target.value)}
              >
                <option>BTC-PERP</option>
                <option>ETH-PERP</option>
              </select>
            </Field>
            <Field label="Direction">
              <select name="direction">
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </Field>
            {[
              ["entryMin", "Entry minimum"],
              ["entryMax", "Entry maximum"],
              ["stop", "Stop price"],
              ["target", "Target price"],
            ].map(([n, l]) => (
              <Field label={l} key={n}>
                <input
                  name={n}
                  required
                  inputMode="decimal"
                  placeholder={market === "BTC-PERP" ? "67000" : "2500"}
                />
              </Field>
            ))}
            <Field label="Entry window">
              <select name="window">
                <option value="1">1 hour</option>
                <option value="4">4 hours</option>
                <option value="24">24 hours</option>
              </select>
            </Field>
          </div>
          <Field label="Rationale">
            <textarea
              name="rationale"
              maxLength={1000}
              rows={4}
              placeholder="What makes this setup worth checking, and what invalidates it?"
            />
          </Field>
          <div className="callout">
            <ShieldCheck size={18} />
            <span>
              Publishing records version 1 and its digest. It does not approve a
              trade for anyone.
            </span>
          </div>
          <ErrorBox message={error} />
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? "Publishing…" : "Publish setup"} <ArrowUpRight size={17} />
          </button>
        </form>
      </StartGate>
    </>
  );
}
export function AccountPage() {
  const { session, config, practice, refresh, logout } = useApp();
  const accounts = useLoad("account-list:" + session?.owner, (s) =>
    session ? api<Account[]>("/accounts", { signal: s }) : Promise.resolve([]),
  );
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      if (browserPreview)
        throw new Error(
          "Wallet connection is disabled in this build preview. Use a practice session to explore Pact.",
        );
      if (!window.ethereum)
        throw new Error(
          "Open Pact inside your wallet’s browser to connect. QR pairing is not configured in this version.",
        );
      const addresses = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!addresses[0]) throw new Error("No wallet account selected.");
      if (
        config?.allowedOwner &&
        addresses[0].toLowerCase() !== config.allowedOwner.toLowerCase()
      )
        throw new Error(
          "Select the configured owner wallet " +
            config.allowedOwner +
            " before connecting.",
        );
      await requireTokyo(window.ethereum);
      const challenge = await api<{ id: string; message: string }>(
        "/auth/challenge",
        { method: "POST", body: { address: addresses[0] } },
      );
      const bytes =
        "0x" +
        Array.from(new TextEncoder().encode(challenge.message), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [bytes, addresses[0]],
      });
      await confirmWallet(window.ethereum, addresses[0]);
      await api("/auth/verify", {
        method: "POST",
        body: { id: challenge.id, signature },
      });
      await refresh();
      accounts.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    try {
      await api("/accounts", {
        method: "POST",
        body: { mode: "testnet", scenario: "clean" },
      });
      accounts.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="A CLEAR SEPARATION BETWEEN PRACTICE AND EXECUTION"
        title="Your account, connected."
      >
        Sign-in proves wallet ownership. Trading access is a separate
        permission.
      </PageTitle>
      <div className="account-grid">
        <section className="panel">
          <div className="account-icon">
            <Wallet size={27} />
          </div>
          <h2>
            {session?.mode === "testnet"
              ? "Wallet signed in"
              : "Connect your wallet"}
          </h2>
          <p className="muted">
            Use an EVM wallet to sign a time-limited login message. Pact never
            asks for your owner private key.
          </p>
          {session?.mode === "testnet" && (
            <code className="wallet-address">{session.owner}</code>
          )}
          <ErrorBox message={error} />
          <button
            className="button primary"
            onClick={() => void connect()}
            disabled={busy || browserPreview}
          >
            {browserPreview
              ? "Wallet unavailable in preview"
              : busy
                ? "Waiting for wallet…"
                : session?.mode === "testnet"
                  ? "Switch / reconnect wallet"
                  : "Connect EVM wallet"}
            <ArrowUpRight size={16} />
          </button>
          <div className="account-divider" />
          <h3>Prefer to explore first?</h3>
          <p className="muted">
            Practice includes standard, late, stale, thin-liquidity and
            lost-response scenarios.
          </p>
          <button
            className="button outline"
            onClick={() =>
              void practice()
                .then(() => accounts.reload())
                .catch((e) => setError(e.message))
            }
          >
            Start a fresh practice session
          </button>
          {session && (
            <button
              className="text-button signout"
              onClick={() => void logout()}
            >
              Sign out
            </button>
          )}
        </section>
        <section className="panel">
          <Badge tone="amber">
            {config?.testnetEnabled
              ? "TESTNET CONFIGURED"
              : "TESTNET SETUP PENDING"}
          </Badge>
          <h2>
            Enable a dedicated
            <br />
            trading account.
          </h2>
          <ol className="setup-steps">
            <li>
              <span>1</span>
              <p>
                Use a separate account funded only with test tokens. Keep other
                positions and bots out of it.
              </p>
            </li>
            <li>
              <span>2</span>
              <p>
                In dreamDEX, link the Pact operator to that account’s perps
                markets.
              </p>
            </li>
            <li>
              <span>3</span>
              <p>
                Move eligible USDso into perps margin and fund the operator’s
                testnet gas.
              </p>
            </li>
          </ol>
          {config?.allowedOwner && (
            <div className="operator-box">
              <small>OWNER WALLET</small>
              <code title={config.allowedOwner}>
                {short(config.allowedOwner)}
              </code>
            </div>
          )}
          {config?.operator ? (
            <div className="operator-box">
              <small>PACT OPERATOR</small>
              <code>{short(config.operator)}</code>
              <button
                className="text-button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(config.operator!)
                    .then(() => setCopied(true))
                }
              >
                <Copy size={14} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <p className="callout">
              The operator isn’t configured. Practice works now. No testnet
              execution is claimed.
            </p>
          )}
          <a
            href="https://app.testnet.dreamdex.io"
            target="_blank"
            rel="noreferrer"
            className="muted-link"
          >
            Open dreamDEX testnet <ArrowUpRight size={15} />
          </a>
          {session?.mode === "testnet" && config?.testnetEnabled && (
            <button className="button outline" onClick={() => void add()}>
              <Plus size={16} /> Add signed-in testnet account
            </button>
          )}
          <p className="tiny muted">
            Only the signed-in wallet can be added. Smart-account sign-in and QR
            pairing are not supported yet.
          </p>
        </section>
      </div>
      <TradingAccess />
      {session?.mode === "testnet" && !browserPreview && <EntryControl />}
      {accounts.value?.length ? (
        <section className="panel connected-accounts">
          <h2>Accounts in this session</h2>
          {accounts.value.map((a) => (
            <div key={a.id}>
              <div>
                <strong>{a.label}</strong>
                <small>
                  {a.mode === "replay"
                    ? "Simulated collateral: " + usd(a.balance)
                    : short(a.owner)}
                </small>
              </div>
              <Badge tone="neutral">
                {a.mode === "replay" ? "Practice" : "Testnet"}
              </Badge>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

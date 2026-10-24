import { Link } from "react-router";
import {
  ArrowUpRight,
  Plus,
  Clock,
  ArrowDownRight,
  ArrowUp,
  SlidersHorizontal,
} from "lucide-react";
import type { Intent, Plan } from "../core/types";
import { api, price, usd } from "../api";
import { useApp, useLoad } from "../state";
import {
  Badge,
  Empty,
  ErrorBox,
  Loading,
  PageTitle,
  StartGate,
} from "../components/ui";
import { useState } from "react";
import { SetupRange } from "../components/SetupRange";
import { LivePrice, MarketWatch } from "../components/LiveMarkets";
export function PlanCard({ plan }: { plan: Plan }) {
  return (
    <Link
      className="plan-card"
      data-environment={plan.mode}
      data-direction={plan.direction}
      to={"/p/" + plan.id}
    >
      <div className="ticket-kicker">
        <span>SETUP / V{plan.version}</span>
        <span>
          {plan.mode === "replay" ? "PRACTICE · SIMULATED" : "TOKYO · TESTNET"}
        </span>
      </div>
      <div className="card-top">
        <span
          className={"coin " + (plan.market.startsWith("ETH") ? "eth" : "")}
        >
          {plan.market.startsWith("BTC") ? "₿" : "Ξ"}
        </span>
        <div>
          <strong>{plan.market}</strong>
          <small>
            {plan.author === "Pact practice"
              ? "Pact practice"
              : plan.author.slice(0, 10) + "…"}
          </small>
        </div>
        <Badge tone={plan.direction === "long" ? "green" : "amber"}>
          {plan.direction === "long" ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDownRight size={12} />
          )}{" "}
          {plan.direction}
        </Badge>
      </div>
      <h3>{plan.title}</h3>
      <LivePrice market={plan.market} />
      <div className="card-entry">
        <span>ENTRY RANGE</span>
        <strong>
          {price(plan.entryMin)} <span>–</span> {price(plan.entryMax)}
        </strong>
      </div>
      <SetupRange {...plan} />
      <div className="card-levels">
        <div>
          <small>Stop</small>
          <span>{price(plan.stop)}</span>
        </div>
        <div>
          <small>Target</small>
          <span>{price(plan.target)}</span>
        </div>
        <div>
          <small>Entry window</small>
          <span>
            {Date.now() > plan.expiresAt ? "Expired" : "Check before approval"}
          </span>
        </div>
      </div>
      <div className="card-foot">
        <span>
          <Clock size={13} />
          {Date.now() > plan.expiresAt
            ? "Entry expired"
            : new Date(plan.expiresAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }) + " entry close"}
        </span>
        <span className="ticket-open">
          Check this setup <ArrowUpRight size={16} />
        </span>
      </div>
    </Link>
  );
}
export function Setups() {
  const { session } = useApp();
  const { value: plans, error } = useLoad("plans", (s) =>
    api<Plan[]>("/plans", { signal: s }),
  );
  const [filter, setFilter] = useState("all");
  const chosen = plans?.filter((p) => filter === "all" || p.mode === filter);
  return (
    <>
      <PageTitle
        eyebrow="THE OPPORTUNITY IS SHARED. THE DECISION IS PERSONAL."
        title="Find your next setup."
        action={
          <Link to="/app/new" className="button primary">
            <Plus size={16} /> Publish a setup
          </Link>
        }
      >
        Check the entry, find your size, and decide on your own terms.
      </PageTitle>
      <MarketWatch />
      <div className="workspace-banner">
        <span className="banner-symbol">
          <img src="/brand/pact-mark.svg" alt="" width="35" height="27" />
        </span>
        <div>
          <strong>Start with the same idea. See different decisions.</strong>
          <p>
            Open a practice setup and switch between standard, late, stale and
            thin-liquidity accounts.
          </p>
        </div>
        <Badge tone="neutral">SIMULATED FUNDS</Badge>
      </div>
      <div className="filter-bar">
        <div className="segmented">
          {[
            ["all", "All setups"],
            ["replay", "Practice"],
            ["testnet", "Testnet"],
          ].map(([id, title]) => (
            <button
              key={id}
              className={filter === id ? "selected" : ""}
              onClick={() => setFilter(id)}
            >
              {title}
            </button>
          ))}
        </div>
        <span>
          <SlidersHorizontal size={14} />
          {chosen?.length ?? 0} setups
        </span>
      </div>
      <ErrorBox message={error} />
      {!plans && !error ? (
        <Loading />
      ) : chosen?.length ? (
        <div className="plan-grid">
          {chosen.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
      ) : (
        <Empty title="No setups here yet">
          Publish a setup or switch environments.
        </Empty>
      )}
      <div className="bottom-note">
        <span>THE PACT PRINCIPLE</span>
        <p>“A good setup can still be the wrong trade for your account.”</p>
        <Link to="/app/rules">
          Set your risk rules <ArrowUpRight size={16} />
        </Link>
      </div>
      {!session && (
        <StartGate>
          <span />
        </StartGate>
      )}
    </>
  );
}
export function Positions() {
  const { session } = useApp();
  const data = useLoad(
    "intents:" + session?.owner,
    (s) =>
      session ? api<Intent[]>("/intents", { signal: s }) : Promise.resolve([]),
    2500,
  );
  return (
    <>
      <PageTitle
        eyebrow="EVERY APPROVAL HAS A RECORD"
        title="Your orders, accounted for."
      >
        Track what was approved, what was observed, and what still needs
        attention.
      </PageTitle>
      <StartGate>
        <ErrorBox message={data.error} />
        {!data.value ? (
          <Loading />
        ) : data.value.length ? (
          <div className="orders-list">
            {data.value.map((i) => (
              <Link to={"/orders/" + i.id} key={i.id} className="order-row">
                <div className="order-symbol">
                  {i.plan.market.startsWith("BTC") ? "₿" : "Ξ"}
                </div>
                <div>
                  <strong>{i.plan.title}</strong>
                  <small>
                    {i.plan.market} ·{" "}
                    {i.mode === "replay" ? "Practice" : "Testnet"} ·{" "}
                    {new Date(i.createdAt).toLocaleString()}
                  </small>
                </div>
                <div>
                  <small>Approved notional</small>
                  <strong>{usd(i.decision.notional)}</strong>
                </div>
                <Badge
                  tone={
                    ["attention", "unknown", "blocked", "rejected"].includes(
                      i.state,
                    )
                      ? "amber"
                      : "green"
                  }
                >
                  {i.state.replace("_", " ")}
                </Badge>
                <ArrowUpRight size={19} />
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="Your first decision starts with a setup">
            Preview a setup and approve it to see its timeline here.{" "}
            <Link to="/app">Browse setups</Link>
          </Empty>
        )}
      </StartGate>
    </>
  );
}

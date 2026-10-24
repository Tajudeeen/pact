import Decimal from "decimal.js";
import {
  DEFAULT_POLICY,
  type Account,
  type Decision,
  type Intent,
  type Plan,
  type Policy,
  type Scenario,
} from "../src/core/types";
import { evaluate, insideApproval } from "../src/core/risk";
import { receiptOf } from "../src/core/receipt";
import { Store } from "./store";
import { digest, seededPlans } from "./plans";
import { replaySnapshot } from "./replay";
import type { PreparedAction, Venue } from "./venue";
export class Fault extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export interface Preview {
  id: string;
  owner: string;
  accountId: string;
  plan: Plan;
  policy: Policy;
  decision: Decision;
  expiresAt: number;
  policyDigest: string;
}
const terminal = new Set(["blocked", "rejected", "closed"]);
export class PactService {
  private running = false;
  constructor(
    readonly store: Store,
    readonly venue: Venue | null = null,
    readonly liveEnabled = false,
    readonly now = () => Date.now(),
  ) {
    for (const p of seededPlans(now()))
      if (!store.get("plan", p.id)) store.put("plan", p.id, p.author, p);
  }
  plans() {
    return this.store
      .list<Plan>("plan")
      .filter((p) => !p.revoked)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  plan(id: string) {
    const p = this.store.get<Plan>("plan", id);
    if (!p) throw new Fault("NOT_FOUND", "Setup not found.", 404);
    return p;
  }
  accounts(owner: string) {
    return this.store.list<Account>("account", owner);
  }
  policy(owner: string): Policy {
    return { ...(this.store.get<Policy>("policy", owner) ?? DEFAULT_POLICY) };
  }
  setPolicy(owner: string, p: Policy) {
    if (
      new Decimal(p.risk).gt(p.totalRisk) ||
      new Decimal(p.risk).gt(p.dailyLoss)
    )
      throw new Fault(
        "POLICY_INVALID",
        "Per-trade risk must fit the total and daily budgets.",
      );
    this.store.put("policy", owner, owner, p);
    return p;
  }
  addAccount(
    owner: string,
    mode: "replay" | "testnet",
    scenario: Scenario = "clean",
  ) {
    if (mode === "testnet" && !this.liveEnabled)
      throw new Fault(
        "TESTNET_DISABLED",
        "Testnet execution is not configured. Practice is available.",
      );
    const id =
      mode === "testnet" ? owner.toLowerCase() : `${owner}:${scenario}`;
    const labels = {
      clean: "Practice · standard",
      late: "Practice · arrives late",
      stale: "Practice · old data",
      thin: "Practice · thin liquidity",
      "lost-response": "Practice · lost response",
    };
    const a: Account = {
      id,
      owner,
      label: mode === "testnet" ? "My testnet account" : labels[scenario],
      mode,
      scenario,
      balance: scenario === "thin" ? "25" : "1000",
    };
    this.store.put("account", id, owner, a);
    return a;
  }
  account(owner: string, id: string) {
    const a = this.store.get<Account>("account", id);
    if (!a || a.owner !== owner)
      throw new Fault("NOT_FOUND", "Account not found.", 404);
    return a;
  }
  publish(
    owner: string,
    input: Omit<
      Plan,
      "id" | "author" | "digest" | "createdAt" | "revoked" | "version"
    >,
  ) {
    if (
      input.expiresAt <= this.now() ||
      input.expiresAt > this.now() + 86400000 * 7
    )
      throw new Fault(
        "INVALID_WINDOW",
        "Entry window must be within the next seven days.",
      );
    const id = this.store.id();
    const p: Plan = {
      ...input,
      id,
      author: owner,
      version: 1,
      createdAt: this.now(),
      revoked: false,
      digest: "",
    };
    p.digest = digest({ ...input, author: owner, version: 1 });
    this.store.put("plan", id, owner, p);
    return p;
  }
  revoke(owner: string, id: string) {
    const p = this.plan(id);
    if (p.author !== owner)
      throw new Fault(
        "FORBIDDEN",
        "Only this setup’s author can withdraw it.",
        403,
      );
    p.revoked = true;
    this.store.put("plan", p.id, p.author, p);
    return p;
  }
  intents(owner: string) {
    return this.store
      .list<Intent>("intent", owner)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  intent(owner: string, id: string) {
    const i = this.store.get<Intent>("intent", id);
    if (!i || i.owner !== owner)
      throw new Fault("NOT_FOUND", "Order not found.", 404);
    return i;
  }
  save(i: Intent) {
    i.updatedAt = this.now();
    this.store.put("intent", i.id, i.owner, i);
  }
  event(i: Intent, type: string, detail: string) {
    i.events.push({ at: this.now(), type, detail });
    this.save(i);
  }
  exposure(owner: string, accountId: string, except?: string) {
    const xs = this.intents(owner).filter(
      (i) => i.accountId === accountId && i.id !== except,
    );
    return {
      reserved: xs
        .filter((i) => !terminal.has(i.state))
        .reduce((a, i) => a.plus(i.decision.plannedLoss), new Decimal(0))
        .toFixed(),
      dailyLoss: xs
        .filter(
          (i) =>
            i.state === "closed" &&
            i.updatedAt >= Math.floor(this.now() / 86400000) * 86400000,
        )
        .reduce((a, i) => {
          const r = receiptOf(i);
          const loss =
            r.netPnl === null
              ? new Decimal(i.decision.plannedLoss)
              : Decimal.max(0, new Decimal(r.netPnl).neg());
          return a.plus(loss);
        }, new Decimal(0))
        .toFixed(),
      busy: xs.some((i) => !terminal.has(i.state)),
    };
  }
  async snapshot(plan: Plan, account: Account) {
    if (plan.mode !== account.mode)
      throw new Fault(
        "ENVIRONMENT_MISMATCH",
        "Choose an account in the same environment as this setup.",
      );
    if (account.mode === "replay")
      return replaySnapshot(plan, account, this.now());
    if (!this.venue)
      throw new Fault("TESTNET_DISABLED", "Testnet is not configured.");
    return this.venue.snapshot(plan, account);
  }
  async preview(owner: string, planId: string, accountId: string) {
    const p = this.plan(planId),
      a = this.account(owner, accountId),
      policy = this.policy(owner);
    if (p.mode === "testnet")
      policy.maxNotional = Decimal.min(policy.maxNotional, "25").toFixed();
    const snapshot = await this.snapshot(p, a);
    const result = evaluate(
      p,
      policy,
      snapshot,
      this.now(),
      this.exposure(owner, a.id),
    );
    const v: Preview = {
      id: this.store.id(),
      owner,
      accountId: a.id,
      plan: p,
      policy,
      policyDigest: digest(policy),
      decision: result,
      expiresAt: this.now() + 15000,
    };
    this.store.put("preview", v.id, owner, v);
    return v;
  }
  approve(owner: string, previewId: string, consent: boolean) {
    if (!consent)
      throw new Fault(
        "CONSENT_REQUIRED",
        "Confirm the order and monitored-exit terms.",
      );
    return this.store.atomic(() => {
      const p = this.store.get<Preview>("preview", previewId);
      if (!p || p.owner !== owner)
        throw new Fault("NOT_FOUND", "Preview not found.", 404);
      const existing = this.store.db
        .prepare(
          "SELECT intent FROM approvals WHERE account=? AND plan=? AND version=?",
        )
        .get(p.accountId, p.plan.id, p.plan.version) as
        { intent: string } | undefined;
      if (existing) return this.intent(owner, existing.intent);
      const live = this.plan(p.plan.id);
      this.account(owner, p.accountId);
      if (p.expiresAt <= this.now())
        throw new Fault(
          "PREVIEW_EXPIRED",
          "This preview expired. Check your size again.",
        );
      if (
        live.revoked ||
        live.digest !== p.plan.digest ||
        live.expiresAt <= this.now()
      )
        throw new Fault("PLAN_CHANGED", "The setup changed or expired.");
      const currentPolicy = { ...this.policy(owner) };
      if (p.plan.mode === "testnet")
        currentPolicy.maxNotional = Decimal.min(
          currentPolicy.maxNotional,
          "25",
        ).toFixed();
      if (digest(currentPolicy) !== p.policyDigest)
        throw new Fault(
          "POLICY_CHANGED",
          "Your risk rules changed. Preview again.",
        );
      if (p.decision.outcome === "blocked")
        throw new Fault("PREVIEW_BLOCKED", p.decision.message);
      const x = this.exposure(owner, p.accountId);
      if (x.busy)
        throw new Fault(
          "ACCOUNT_BUSY",
          "Resolve this account’s existing order first.",
        );
      if (
        new Decimal(x.reserved)
          .plus(p.decision.plannedLoss)
          .gt(p.policy.totalRisk) ||
        new Decimal(x.dailyLoss)
          .plus(x.reserved)
          .plus(p.decision.plannedLoss)
          .gt(p.policy.dailyLoss)
      )
        throw new Fault(
          "BUDGET_USED",
          "The risk budget changed. Preview again.",
        );
      const i: Intent = {
        id: this.store.id(),
        owner,
        accountId: p.accountId,
        planId: p.plan.id,
        planVersion: p.plan.version,
        planDigest: p.plan.digest,
        mode: p.plan.mode,
        state: "reserved",
        decision: p.decision,
        plan: p.plan,
        policy: p.policy,
        createdAt: this.now(),
        updatedAt: this.now(),
        protection: "not_armed",
        fills: [],
        events: [
          {
            at: this.now(),
            type: "approved",
            detail:
              "Approved one setup version, account, quantity and price bound. Planned risk reserved.",
          },
        ],
      };
      this.store.db
        .prepare("INSERT INTO approvals VALUES(?,?,?,?,?)")
        .run(owner, p.accountId, p.plan.id, p.plan.version, i.id);
      this.save(i);
      return i;
    });
  }
  action(i: Intent, role: "entry" | "close") {
    const row = this.store.db
      .prepare("SELECT body FROM actions WHERE intent=? AND role=?")
      .get(i.id, role) as { body: string } | undefined;
    return row ? (JSON.parse(row.body) as PreparedAction) : undefined;
  }
  async execute(i: Intent) {
    const a = this.account(i.owner, i.accountId);
    if (
      i.mode === "testnet" &&
      this.store
        .list<Intent>("intent")
        .some(
          (other) =>
            other.id !== i.id &&
            other.mode === "testnet" &&
            ["submitted", "unknown", "closing", "attention"].includes(
              other.state,
            ),
        )
    )
      return;
    if (this.now() - i.createdAt > 15000) {
      i.state = "blocked";
      this.event(
        i,
        "approval_expired",
        "Approval became stale before submission. Nothing sent.",
      );
      return;
    }
    const p = this.plan(i.planId);
    if (p.revoked || p.digest !== i.planDigest) {
      i.state = "blocked";
      this.event(
        i,
        "plan_changed",
        "Setup withdrawn or changed before submission.",
      );
      return;
    }
    const snapshot = await this.snapshot(p, a),
      fresh = evaluate(
        p,
        i.policy,
        snapshot,
        this.now(),
        this.exposure(i.owner, a.id, i.id),
      );
    if (!insideApproval(fresh, i.decision, p.direction)) {
      i.state = "blocked";
      this.event(
        i,
        "recheck_blocked",
        fresh.outcome === "blocked"
          ? fresh.message
          : "Fresh execution would exceed the approved quantity, price or planned risk.",
      );
      return;
    }
    // Keep the original approval immutable. FOK sends its exact size, so a smaller
    // fresh allowance requires a fresh approval instead of silently changing it.
    if (new Decimal(fresh.quantity).lt(i.decision.quantity)) {
      i.state = "blocked";
      this.event(
        i,
        "recheck_resized",
        "The allowed size fell. Check and approve a fresh setup version.",
      );
      return;
    }
    if (i.mode === "replay") {
      i.state = a.scenario === "lost-response" ? "unknown" : "submitted";
      this.event(
        i,
        "submit_recorded",
        "Simulated outbound action persisted once.",
      );
      if (i.state === "unknown")
        this.event(
          i,
          "response_lost",
          "Simulated response lost. Reconciliation will find the existing fill without resending.",
        );
      return;
    }
    const action = await this.venue!.prepare(i, "entry");
    if (this.now() - snapshot.observedAt > 5000 || this.now() >= p.expiresAt) {
      i.state = "blocked";
      this.event(
        i,
        "stale_before_send",
        "Signing finished after the quote expired. Nothing broadcast.",
      );
      return;
    }
    const saved = this.store.atomic(() => {
      const inserted = this.store.db
        .prepare("INSERT OR IGNORE INTO actions VALUES(?,?,?,?)")
        .run(this.store.id(), i.id, "entry", JSON.stringify(action));
      if (!inserted.changes) return false;
      i.state = "submitted";
      i.txHash = action.hash;
      this.event(
        i,
        "transaction_prepared",
        "Exact signed transaction, hash and nonce persisted before broadcast.",
      );
      return true;
    });
    if (saved)
      try {
        await this.venue!.broadcast(action);
      } catch {
        i.state = "unknown";
        this.event(
          i,
          "broadcast_uncertain",
          "RPC response uncertain. Reconcile the persisted hash, never create a replacement order.",
        );
      }
  }
  async reconcile(i: Intent) {
    if (i.mode === "replay") {
      if (
        (i.state === "submitted" || i.state === "unknown") &&
        this.now() - i.updatedAt >= 1000
      ) {
        if (!i.fills.some((f) => f.role === "entry"))
          i.fills.push({
            role: "entry",
            quantity: i.decision.quantity,
            price: i.decision.limit,
            fee: "0",
            at: this.now(),
          });
        i.state = "open";
        i.protection = "monitored";
        this.event(
          i,
          "fill_observed",
          "Existing simulated fill reconciled. No native stop or target was created.",
        );
      }
      return;
    }
    const role = i.state === "closing" ? "close" : "entry",
      action = this.action(i, role);
    if (!action) {
      i.state = "attention";
      this.event(
        i,
        "missing_action",
        "Submission state has no durable action. Review before trading.",
      );
      return;
    }
    const observed = await this.venue!.observe(action);
    if (observed.state === "pending") {
      if (this.now() - i.createdAt > 120000) {
        i.state = "attention";
        i.protection = "degraded";
        this.event(
          i,
          "pending_review",
          "Transaction unresolved for over two minutes. Review its hash and nonce. No replacement action sent.",
        );
      }
      return;
    }
    if (observed.state === "reverted") {
      i.state = role === "entry" ? "rejected" : "attention";
      i.error = observed.detail;
      i.protection = "degraded";
      this.event(i, "transaction_reverted", observed.detail);
      return;
    }
    if (observed.state === "attention") {
      i.state = "attention";
      i.protection = "degraded";
      this.event(i, "receipt_needs_review", observed.detail);
      return;
    }
    const quantity = observed.fills.reduce(
      (a, f) => a.plus(f.quantity),
      new Decimal(0),
    );
    if (!quantity.eq(i.decision.quantity)) {
      i.state = "attention";
      i.protection = "degraded";
      this.event(
        i,
        "fill_size_mismatch",
        "Confirmed fills differ from the approved FOK size. Manual review required.",
      );
      return;
    }
    i.fills = [...i.fills.filter((f) => f.role !== role), ...observed.fills];
    i.state = role === "entry" ? "open" : "closed";
    i.protection = role === "entry" ? "monitored" : "not_armed";
    i.lastMonitorAt = this.now();
    this.event(
      i,
      role === "entry" ? "fill_observed" : "close_reconciled",
      observed.detail,
    );
  }
  async close(owner: string, id: string) {
    const i = this.intent(owner, id);
    if (i.state === "closed" || i.state === "closing") return i;
    if (i.state !== "open")
      throw new Fault(
        "NOT_OPEN",
        "Only an observed open position can be closed.",
      );
    if (i.mode === "replay") {
      i.state = "closed";
      i.protection = "not_armed";
      i.fills.push({
        role: "close",
        quantity: i.decision.quantity,
        price: i.decision.limit,
        fee: "0",
        at: this.now(),
      });
      this.event(
        i,
        "close_reconciled",
        "Simulated position closed flat at the entry price. No invented profit.",
      );
      return i;
    }
    // Serialize with the executor so two close clicks cannot prepare two nonces.
    if (this.running)
      throw new Fault(
        "EXECUTOR_BUSY",
        "Executor is checking an order. Retry shortly.",
      );
    this.running = true;
    try {
      const action = await this.venue!.prepare(i, "close");
      const saved = this.store.atomic(() => {
        const result = this.store.db
          .prepare("INSERT OR IGNORE INTO actions VALUES(?,?,?,?)")
          .run(this.store.id(), i.id, "close", JSON.stringify(action));
        if (!result.changes) return false;
        i.state = "closing";
        i.closeHash = action.hash;
        this.event(
          i,
          "close_prepared",
          "Position-sized opposing FOK close persisted. Dedicated account required.",
        );
        return true;
      });
      if (saved)
        try {
          await this.venue!.broadcast(action);
        } catch {
          this.event(
            i,
            "close_uncertain",
            "Waiting on the persisted close hash. No second close sent.",
          );
        }
      return i;
    } finally {
      this.running = false;
    }
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    this.store.db
      .prepare("INSERT OR REPLACE INTO runtime VALUES('heartbeat',?)")
      .run(String(this.now()));
    try {
      for (const i of this.store
        .list<Intent>("intent")
        .filter((i) => !terminal.has(i.state))) {
        try {
          if (i.state === "reserved") await this.execute(i);
          else if (["submitted", "unknown", "closing"].includes(i.state))
            await this.reconcile(i);
          else if (i.state === "open" && i.mode === "testnet") {
            const s = await this.venue!.snapshot(
              i.plan,
              this.account(i.owner, i.accountId),
            );
            if (this.now() - s.observedAt > 5000)
              throw new Error("Stale monitoring observation.");
            if (
              !new Decimal(s.position).abs().eq(i.decision.quantity) ||
              new Decimal(s.position).gt(0) !== (i.plan.direction === "long")
            )
              throw new Error(
                "Position changed outside Pact. Manual review required.",
              );
            const mark = new Decimal(s.mark),
              stop = new Decimal(i.plan.stop),
              target = new Decimal(i.plan.target);
            i.lastMonitorAt = this.now();
            this.save(i);
            const hit =
              i.plan.direction === "long"
                ? mark.lte(stop) || mark.gte(target)
                : mark.gte(stop) || mark.lte(target);
            if (hit) {
              this.running = false;
              try {
                await this.close(i.owner, i.id);
              } finally {
                this.running = true;
              }
            }
          }
        } catch (error) {
          i.error = (error as Error).message.slice(0, 200);
          if (i.state === "open") {
            i.state = "attention";
            i.protection = "degraded";
            this.event(
              i,
              "monitoring_degraded",
              "Monitoring could not establish a safe position state. Manual review required.",
            );
          } else if (i.state === "reserved") {
            i.state = "blocked";
            this.event(
              i,
              "preflight_failed",
              "Venue preflight failed. Nothing broadcast.",
            );
          } else this.save(i);
        }
      }
    } finally {
      this.running = false;
    }
  }
}

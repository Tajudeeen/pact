import Decimal from "decimal.js";
import { sha256, stringToBytes } from "viem";
import { ApiError } from "../api";
import { canonical, practicePlanRecords } from "../core/plans";
import { replaySnapshot } from "../core/replay";
import { evaluate } from "../core/risk";
import { receiptOf } from "../core/receipt";
import { planSchema, policySchema } from "../core/validation";
import {
  DEFAULT_POLICY,
  type Account,
  type Intent,
  type Plan,
  type Policy,
  type Scenario,
} from "../core/types";

type Preview = {
  id: string;
  accountId: string;
  plan: Plan;
  policy: Policy;
  decision: Intent["decision"];
  expiresAt: number;
};
type State = {
  schema: 1;
  session: { owner: string; mode: "replay" } | null;
  plans: Plan[];
  policy: Policy;
  accounts: Account[];
  previews: Preview[];
  intents: Intent[];
};
const key = "pact:browser-preview:v1";
const scenarios: Scenario[] = [
  "clean",
  "late",
  "stale",
  "thin",
  "lost-response",
];
const labels = [
  "standard",
  "arrives late",
  "old data",
  "thin liquidity",
  "lost response",
];
const terminal = new Set(["closed", "blocked", "rejected"]);
async function digest(value: unknown) {
  return sha256(stringToBytes(canonical(value))).slice(2);
}
function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function fail(code: string, message: string, status = 409): never {
  throw new ApiError(code, message, status);
}

// This deliberately has no transport, operator, wallet, or testnet implementation.
// It exercises the real screens and pure policy modules, not server durability.
export function createPreviewRuntime(
  storage: Pick<Storage, "getItem" | "setItem">,
  now = () => Date.now(),
) {
  let state: State;
  const ready = (async () => {
    const saved = storage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved) as State;
      if (parsed.schema !== 1)
        fail(
          "PREVIEW_STORAGE",
          "This preview's saved data uses an older format. Clear this site's browser data to start again.",
        );
      state = parsed;
    } else {
      state = {
        schema: 1,
        session: null,
        plans: await Promise.all(
          practicePlanRecords(now()).map(async (p) => ({
            ...p,
            digest: await digest(p),
          })),
        ),
        policy: { ...DEFAULT_POLICY },
        accounts: [],
        previews: [],
        intents: [],
      };
    }
  })();
  function persist() {
    storage.setItem(key, JSON.stringify(state));
  }
  function event(i: Intent, type: string, detail: string) {
    i.updatedAt = now();
    i.events.push({ at: now(), type, detail });
  }
  function account(id: string) {
    return (
      state.accounts.find(
        (a) => a.id === id && a.owner === state.session?.owner,
      ) ?? fail("NOT_FOUND", "Account not found.", 404)
    );
  }
  function order(id: string) {
    return (
      state.intents.find(
        (i) => i.id === id && i.owner === state.session?.owner,
      ) ?? fail("NOT_FOUND", "Order not found.", 404)
    );
  }
  function plan(id: string) {
    return (
      state.plans.find((p) => p.id === id) ??
      fail(
        "NOT_FOUND",
        "Setup not found. Locally published setups stay in the browser that created them.",
        404,
      )
    );
  }
  function exposure(accountId: string) {
    const xs = state.intents.filter(
      (i) => i.owner === state.session?.owner && i.accountId === accountId,
    );
    return {
      busy: xs.some((i) => !terminal.has(i.state)),
      reserved: xs
        .filter((i) => !terminal.has(i.state))
        .reduce((v, i) => v.plus(i.decision.plannedLoss), new Decimal(0))
        .toFixed(),
      dailyLoss: "0",
    };
  }
  function reconcile() {
    for (const i of state.intents) {
      if (i.owner !== state.session?.owner) continue;
      if (i.state === "reserved" && now() - i.createdAt > 1000) {
        const a = account(i.accountId);
        i.state = a.scenario === "lost-response" ? "unknown" : "submitted";
        event(
          i,
          "preview_submission",
          "Browser-local simulation only. Nothing sent to an exchange.",
        );
      }
      if (
        ["submitted", "unknown"].includes(i.state) &&
        now() - i.createdAt > 3000
      ) {
        i.state = "open";
        i.protection = "monitored";
        i.fills = [
          {
            role: "entry",
            quantity: i.decision.quantity,
            price: i.decision.limit,
            fee: "0",
            at: now(),
          },
        ];
        event(
          i,
          "preview_fill",
          "Simulated fill observed in this browser. This does not prove server recovery or a blockchain transaction.",
        );
      }
    }
  }
  return async function request<T>(
    path: string,
    options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  ): Promise<T> {
    await ready;
    options.signal?.throwIfAborted();
    const method = options.method ?? "GET",
      body = options.body as Record<string, unknown> | undefined;
    let result: unknown;
    if (
      path.startsWith("/auth/") &&
      !["/auth/practice", "/auth/logout"].includes(path)
    )
      fail(
        "PREVIEW_ONLY",
        "Wallet sign-in and testnet orders are disabled in this build preview. Start a practice session instead.",
      );
    if (
      ![
        "/config",
        "/session",
        "/health",
        "/auth/practice",
        "/auth/logout",
        "/plans",
      ].includes(path) &&
      !/^\/plans\/[^/]+$/.test(path) &&
      !state.session
    )
      fail("SIGN_IN_REQUIRED", "Start a practice session first.", 401);
    reconcile();
    if (path === "/config" && method === "GET")
      result = {
        name: "Pact",
        chainId: 50383,
        testnetEnabled: false,
        operator: null,
        protection: "simulated",
        heartbeatAt: null,
        liveMaxNotional: "25",
      };
    else if (path === "/session" && method === "GET")
      result = { session: state.session };
    else if (path === "/health")
      result = { status: "preview", storage: "browser-local" };
    else if (path === "/auth/practice" && method === "POST") {
      const owner = "practice:" + randomId();
      state.session = { owner, mode: "replay" };
      state.previews = [];
      state.intents = [];
      state.policy = { ...DEFAULT_POLICY };
      state.accounts = scenarios.map((scenario, index) => ({
        id: owner + ":" + scenario,
        owner,
        label: "Practice · " + labels[index],
        mode: "replay",
        scenario,
        balance: scenario === "thin" ? "25" : "1000",
      }));
      result = state.session;
    } else if (path === "/auth/logout" && method === "POST") {
      state.session = null;
      result = { ok: true };
    } else if (path === "/plans" && method === "GET")
      result = state.plans.filter((p) => !p.revoked);
    else if (path === "/plans" && method === "POST") {
      if (!state.session)
        fail("SIGN_IN_REQUIRED", "Start practice first.", 401);
      const parsed = planSchema.safeParse(body);
      if (!parsed.success)
        fail("INVALID_INPUT", parsed.error.issues[0].message, 400);
      const input = parsed.data;
      if (input.mode !== "replay")
        fail(
          "PREVIEW_ONLY",
          "Only practice setups are available in this preview.",
        );
      if (input.expiresAt <= now() || input.expiresAt > now() + 7 * 86400000)
        fail(
          "INVALID_WINDOW",
          "Entry window must be within the next seven days.",
        );
      const p: Plan = {
        ...input,
        id: randomId(),
        author: state.session!.owner,
        version: 1,
        digest: await digest({
          ...input,
          author: state.session!.owner,
          version: 1,
        }),
        createdAt: now(),
        revoked: false,
      };
      state.plans.unshift(p);
      result = p;
    } else if (/^\/plans\/[^/]+$/.test(path) && method === "GET")
      result = plan(decodeURIComponent(path.split("/")[2]));
    else if (/^\/plans\/[^/]+\/revoke$/.test(path) && method === "POST") {
      const p = plan(path.split("/")[2]);
      if (p.author !== state.session?.owner)
        fail("FORBIDDEN", "Only this setup's author can withdraw it.", 403);
      p.revoked = true;
      result = p;
    } else if (path === "/accounts" && method === "GET")
      result = state.accounts;
    else if (path === "/accounts")
      fail(
        "PREVIEW_ONLY",
        "Testnet accounts are disabled. Use the five practice accounts.",
      );
    else if (path === "/policy" && method === "GET") result = state.policy;
    else if (path === "/policy" && method === "PUT") {
      const parsed = policySchema.safeParse(body);
      if (!parsed.success)
        fail("INVALID_INPUT", parsed.error.issues[0].message, 400);
      const p = parsed.data;
      if (
        new Decimal(p.risk).gt(p.totalRisk) ||
        new Decimal(p.risk).gt(p.dailyLoss)
      )
        fail(
          "POLICY_INVALID",
          "Per-trade risk must fit the total and daily budgets.",
        );
      state.policy = p;
      result = p;
    } else if (path === "/previews" && method === "POST") {
      const p = plan(String(body?.planId)),
        a = account(String(body?.accountId));
      const v: Preview = {
        id: randomId(),
        accountId: a.id,
        plan: structuredClone(p),
        policy: { ...state.policy },
        decision: evaluate(
          p,
          state.policy,
          replaySnapshot(p, a, now()),
          now(),
          exposure(a.id),
        ),
        expiresAt: now() + 15000,
      };
      state.previews = state.previews.filter((p) => p.expiresAt > now());
      state.previews.push(v);
      result = v;
    } else if (path === "/intents" && method === "POST") {
      const v =
        state.previews.find((p) => p.id === body?.previewId) ??
        fail("NOT_FOUND", "Preview not found.", 404);
      if (body?.consent !== true)
        fail("CONSENT_REQUIRED", "Confirm the order terms.");
      const existing = state.intents.find(
        (i) =>
          i.accountId === v.accountId &&
          i.planId === v.plan.id &&
          i.planVersion === v.plan.version,
      );
      if (existing) result = existing;
      else {
        const p = plan(v.plan.id);
        if (v.expiresAt <= now())
          fail(
            "PREVIEW_EXPIRED",
            "This preview expired. Check your size again.",
          );
        if (p.revoked || p.digest !== v.plan.digest || p.expiresAt <= now())
          fail("PLAN_CHANGED", "The setup changed or expired.");
        if (canonical(v.policy) !== canonical(state.policy))
          fail("POLICY_CHANGED", "Your risk rules changed. Preview again.");
        if (v.decision.outcome === "blocked")
          fail("PREVIEW_BLOCKED", v.decision.message);
        if (exposure(v.accountId).busy)
          fail("ACCOUNT_BUSY", "Resolve this account's existing order first.");
        const i: Intent = {
          id: randomId(),
          owner: state.session!.owner,
          accountId: v.accountId,
          planId: p.id,
          planVersion: p.version,
          planDigest: p.digest,
          mode: "replay",
          state: "reserved",
          decision: v.decision,
          execution: v.decision,
          plan: v.plan,
          policy: v.policy,
          createdAt: now(),
          updatedAt: now(),
          protection: "not_armed",
          fills: [],
          events: [],
        };
        event(
          i,
          "approved",
          "Practice approval recorded in this browser. No funds or blockchain activity.",
        );
        state.intents.unshift(i);
        result = i;
      }
    } else if (path === "/intents" && method === "GET") result = state.intents;
    else if (/^\/intents\/[^/]+(?:\/(?:close|receipt|recover))?$/.test(path)) {
      const i = order(path.split("/")[2]);
      if (path.endsWith("/receipt") && method === "GET") result = receiptOf(i);
      else if (path.endsWith("/close") && method === "POST") {
        if (i.state !== "open" && i.state !== "closed")
          fail("NOT_OPEN", "Only an observed practice position can be closed.");
        if (i.state !== "closed") {
          i.state = "closed";
          i.protection = "not_armed";
          i.fills.push({
            role: "close",
            quantity: i.decision.quantity,
            price: i.decision.limit,
            fee: "0",
            at: now(),
          });
          event(
            i,
            "preview_close",
            "Simulated flat close at entry. No invented profit or transaction hash.",
          );
        }
        result = i;
      } else if (method === "GET") result = i;
      else
        fail(
          "PREVIEW_ONLY",
          "Server transaction recovery is tested in the repository. This browser preview only simulates practice orders.",
        );
    } else fail("NOT_FOUND", "Preview route not found.", 404);
    persist();
    return structuredClone(result) as T;
  };
}
let runtime: ReturnType<typeof createPreviewRuntime> | undefined;
export function resetPreview() {
  if (!window.confirm("Clear this browser's preview setups and orders?"))
    return;
  localStorage.removeItem(key);
  location.hash = "/";
  location.reload();
}
export async function previewApi<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal },
) {
  runtime ??= createPreviewRuntime(localStorage);
  return runtime<T>(path, options);
}

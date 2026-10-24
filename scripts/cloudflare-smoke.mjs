import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";

// HTTP acceptance checks against a real Worker. All orders use practice mode.
const origin = process.env.PACT_SMOKE_URL ?? "http://localhost:8788";
let cookie = "";
async function request(path, body, expected = 200, session = cookie) {
  const response = await fetch(origin + "/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, cookie: session, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return { data, response };
}
async function untilOpen(id) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const { data } = await request("/intents/" + id);
    if (data.state === "open") return data;
    assert.ok(
      ["reserved", "submitted", "unknown"].includes(data.state),
      data.state,
    );
    await pause(500);
  }
  throw new Error("Durable alarm did not advance practice order to open.");
}
assert.equal((await request("/health")).data.storage, "ready");
const denied = await fetch(origin + "/api/auth/practice", { method: "POST" });
assert.equal(denied.status, 403);
const started = await request("/auth/practice", {});
cookie = started.response.headers.get("set-cookie").split(";")[0];
const accounts = (await request("/accounts")).data;
assert.equal(accounts.length, 5);
const plan = (await request("/plans")).data.find(
  (p) => p.id === "btc-pullback",
);
assert.equal(plan.mode, "replay");
const clean = accounts.find((a) => a.scenario === "clean");
const preview = (
  await request("/previews", { planId: plan.id, accountId: clean.id })
).data;
assert.notEqual(preview.decision.outcome, "blocked");
const entry = (
  await request("/intents", { previewId: preview.id, consent: true }, 201)
).data;
const duplicate = (
  await request("/intents", { previewId: preview.id, consent: true }, 201)
).data;
assert.equal(duplicate.id, entry.id);
assert.equal((await request("/intents")).data.length, 1);
await untilOpen(entry.id);
const other = await request("/auth/practice", {});
const otherCookie = other.response.headers.get("set-cookie").split(";")[0];
await request("/intents/" + entry.id, undefined, 404, otherCookie);
await request("/intents/" + entry.id + "/close", {});
const receipt = (await request("/intents/" + entry.id + "/receipt")).data;
assert.equal(receipt.state, "closed");
assert.equal(receipt.netPnl, "0");
assert.equal(receipt.transactions.length, 0);
const late = accounts.find((a) => a.scenario === "late");
const refusal = (
  await request("/previews", { planId: plan.id, accountId: late.id })
).data;
assert.equal(refusal.decision.outcome, "blocked");
const lost = accounts.find((a) => a.scenario === "lost-response");
const retryPreview = (
  await request("/previews", { planId: plan.id, accountId: lost.id })
).data;
const uncertain = (
  await request("/intents", { previewId: retryPreview.id, consent: true }, 201)
).data;
await untilOpen(uncertain.id);
await request("/intents/" + uncertain.id + "/close", {});
assert.equal(
  (await request("/intents/" + uncertain.id + "/receipt")).data.state,
  "closed",
);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      origin,
      storage: "ready",
      practice: "closed",
      duplicateApproval: "same-intent-no-duplicate",
      crossSession: "refused",
      lateEntry: "refused",
      lostResponse: "recovered-and-closed",
      advancement: "durable-alarms",
      realOrdersPlacedByCheck: 0,
    },
    null,
    2,
  ),
);

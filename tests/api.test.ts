import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { Store } from "../server/store";
import { PactService } from "../server/service";
import { createApp } from "../server/app";
import { Auth } from "../server/auth";
const origin = "http://localhost:5173";
describe("API security and public flow", () => {
  it("requires same-origin writes and keeps private account reads authenticated", async () => {
    const db = new Store(),
      app = createApp(new PactService(db), origin);
    const denied = await app.request("/api/auth/practice", { method: "POST" });
    expect(denied.status).toBe(403);
    expect((await app.request("/api/accounts")).status).toBe(401);
    const response = await app.request("/api/auth/practice", {
      method: "POST",
      headers: { origin },
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const accounts = await app.request("/api/accounts", {
      headers: { cookie },
    });
    expect((await accounts.json()).length).toBe(5);
    db.close();
  });
  it("serves the complete API practice story", async () => {
    const db = new Store();
    let now = 1800000000000;
    const service = new PactService(db, null, false, () => now),
      app = createApp(service, origin);
    const session = await app.request("/api/auth/practice", {
      method: "POST",
      headers: { origin },
    });
    const cookie = session.headers.get("set-cookie")!.split(";")[0],
      headers = { cookie, origin, "Content-Type": "application/json" };
    const accounts = await (
      await app.request("/api/accounts", { headers })
    ).json();
    const preview = await (
      await app.request("/api/previews", {
        method: "POST",
        headers,
        body: JSON.stringify({
          planId: "btc-pullback",
          accountId: accounts[0].id,
        }),
      })
    ).json();
    expect(preview.decision.outcome).not.toBe("blocked");
    const approved = await app.request("/api/intents", {
      method: "POST",
      headers,
      body: JSON.stringify({ previewId: preview.id, consent: true }),
    });
    expect(approved.status).toBe(201);
    const i = await approved.json();
    await service.tick();
    now += 2000;
    await service.tick();
    expect(
      (await (await app.request("/api/intents/" + i.id, { headers })).json())
        .state,
    ).toBe("open");
    await app.request("/api/intents/" + i.id + "/close", {
      method: "POST",
      headers,
      body: "{}",
    });
    const receipt = await (
      await app.request("/api/intents/" + i.id + "/receipt", { headers })
    ).json();
    expect(receipt.state).toBe("closed");
    expect(receipt.netPnl).toBe("0");
    db.close();
  });
  it("accepts a wallet signature once and rejects a different signer", async () => {
    const db = new Store(),
      auth = new Auth(db, origin);
    const alice = privateKeyToAccount(
        ("0x" + "11".repeat(32)) as `0x${string}`,
      ),
      bob = privateKeyToAccount(("0x" + "22".repeat(32)) as `0x${string}`);
    const c = auth.challenge(alice.address);
    await expect(
      auth.verify(c.id, await bob.signMessage({ message: c.message })),
    ).rejects.toThrow("did not match");
    const signature = await alice.signMessage({ message: c.message });
    const s = await auth.verify(c.id, signature);
    expect(auth.read(s.token)?.owner).toBe(alice.address.toLowerCase());
    await expect(auth.verify(c.id, signature)).rejects.toThrow("expired");
    auth.revoke(s.token);
    expect(auth.read(s.token)).toBeUndefined();
    db.close();
  });
  it("rejects malformed plan geometry and unconsented approval", async () => {
    const db = new Store(),
      app = createApp(new PactService(db), origin);
    const session = await app.request("/api/auth/practice", {
      method: "POST",
      headers: { origin },
    });
    const cookie = session.headers.get("set-cookie")!.split(";")[0],
      headers = { cookie, origin, "Content-Type": "application/json" };
    const r = await app.request("/api/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "bad geometry",
        market: "BTC-PERP",
        direction: "long",
        entryMin: "100",
        entryMax: "99",
        stop: "98",
        target: "101",
        expiresAt: Date.now() + 60000,
        rationale: "",
        mode: "replay",
      }),
    });
    expect(r.status).toBe(400);
    const no = await app.request("/api/intents", {
      method: "POST",
      headers,
      body: JSON.stringify({ previewId: "x", consent: false }),
    });
    expect(no.status).toBe(400);
    db.close();
  });
});

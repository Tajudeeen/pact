import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { isAddress, type Hex } from "viem";
import { Auth } from "./auth";
import { Fault, PactService } from "./service";
import { planSchema, policySchema } from "./validation";
import { receiptOf } from "../src/core/receipt";
import type { Scenario } from "../src/core/types";
import type { MarketBoard } from "../src/core/markets";
import { RELEASE } from "./release";
const id = z.string().min(1).max(150);
export function createApp(
  service: PactService,
  origin: string,
  operator: string | null = null,
  allowedOwner?: string,
  rate = new Map<string, { at: number; count: number }>(),
  getMarkets?: () => Promise<MarketBoard>,
) {
  const auth = new Auth(service.store, origin, service.now, allowedOwner),
    app = new Hono<{
      Variables: { owner: string; mode: "replay" | "testnet" };
    }>();
  const cookie = (c: Parameters<typeof setCookie>[0], token: string) =>
    setCookie(c, "pact_session", token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: new URL(origin).protocol === "https:",
      path: "/",
      maxAge: 86400,
    });
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 32768,
      onError: (c) =>
        c.json({ code: "BODY_TOO_LARGE", message: "Request too large." }, 413),
    }),
  );
  app.use("/api/*", async (c, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
      c.req.header("origin") !== origin
    )
      return c.json(
        {
          code: "ORIGIN_REJECTED",
          message: "This request must come from the Pact app.",
        },
        403,
      );
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    // Rate keys use a validated session or the incoming socket, never an untrusted forwarding header.
    const session = auth.read(getCookie(c, "pact_session"));
    const nodeEnv = c.env as
      { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
    const key =
      session?.owner ?? nodeEnv?.incoming?.socket?.remoteAddress ?? "anonymous";
    const now = service.now(),
      r = rate.get(key);
    if (rate.size > 10000)
      for (const [k, v] of rate) if (now - v.at > 60000) rate.delete(k);
    const current = !r || now - r.at > 60000 ? { at: now, count: 0 } : r;
    current.count++;
    rate.set(key, current);
    if (current.count > 180)
      return c.json(
        { code: "RATE_LIMIT", message: "Too many requests. Wait a minute." },
        429,
      );
    if (session) {
      if (
        session.mode === "testnet" &&
        allowedOwner &&
        session.owner.toLowerCase() !== allowedOwner.toLowerCase()
      )
        throw new Fault(
          "WALLET_NOT_ALLOWED",
          "This deployment is configured for a different owner wallet.",
          403,
        );
      c.set("owner", session.owner);
      c.set("mode", session.mode);
    } else if (
      ![
        "/api/config",
        "/api/plans",
        "/api/session",
        "/api/auth/practice",
        "/api/auth/challenge",
        "/api/auth/verify",
        "/api/health",
        "/api/network",
        "/api/markets",
      ].includes(c.req.path) &&
      !/^\/api\/plans\/[^/]+$/.test(c.req.path)
    )
      throw new Fault(
        "SIGN_IN_REQUIRED",
        "Sign in or start practice first.",
        401,
      );
    await next();
  });
  const requireUser = (owner: string | undefined) => {
    if (!owner) throw new Fault("SIGN_IN_REQUIRED", "Sign in first.", 401);
    return owner;
  };
  app.get("/api/health", (c) =>
    c.json({
      status: "ok",
      storage: service.store.db.prepare("SELECT 1").get() ? "ready" : "error",
    }),
  );
  app.get("/api/markets", async (c) => {
    if (!getMarkets)
      throw new Fault(
        "MARKETS_UNAVAILABLE",
        "Live market reads are not configured.",
        503,
      );
    return c.json(await getMarkets());
  });
  app.get("/api/config", (c) => {
    const h = service.store.db
      .prepare("SELECT value FROM runtime WHERE key='heartbeat'")
      .get() as { value: string } | undefined;
    return c.json({
      name: "Pact",
      chainId: 50383,
      testnetEnabled: service.liveEnabled,
      operator,
      allowedOwner: allowedOwner ?? null,
      protection: "monitored",
      heartbeatAt: h ? Number(h.value) : null,
      liveMaxNotional: "25",
      release: RELEASE,
    });
  });
  app.get("/api/network", async (c) => {
    if (!service.venue?.network)
      throw new Fault(
        "TESTNET_DISABLED",
        "Testnet reads are not configured.",
        503,
      );
    let timer: ReturnType<typeof setTimeout>;
    try {
      const status = await Promise.race([
        service.venue.network(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Fault("NETWORK_TIMEOUT", "Testnet read timed out.", 503),
              ),
            12000,
          );
        }),
      ]);
      return c.json({ ...status, readOnly: true });
    } finally {
      clearTimeout(timer!);
    }
  });
  app.get("/api/session", (c) =>
    c.json({ session: auth.read(getCookie(c, "pact_session")) ?? null }),
  );
  app.post("/api/auth/practice", (c) => {
    const owner = "practice:" + service.store.id();
    cookie(c, auth.session(owner, "replay"));
    for (const scenario of [
      "clean",
      "late",
      "stale",
      "thin",
      "lost-response",
    ] as Scenario[])
      service.addAccount(owner, "replay", scenario);
    return c.json({ owner, mode: "replay" });
  });
  app.post("/api/auth/challenge", async (c) => {
    const { address } = z
      .object({ address: z.string().refine(isAddress) })
      .strict()
      .parse(await c.req.json());
    return c.json(auth.challenge(address));
  });
  app.post("/api/auth/verify", async (c) => {
    const { id: challenge, signature } = z
      .object({ id, signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) })
      .strict()
      .parse(await c.req.json());
    const result = await auth.verify(challenge, signature as Hex);
    cookie(c, result.token);
    return c.json({ owner: result.owner, mode: "testnet" });
  });
  app.post("/api/auth/logout", (c) => {
    const t = getCookie(c, "pact_session");
    if (t) auth.revoke(t);
    deleteCookie(c, "pact_session", { path: "/" });
    return c.json({ ok: true });
  });
  app.get("/api/plans", (c) => c.json(service.plans()));
  app.get("/api/plans/:id", (c) => c.json(service.plan(c.req.param("id"))));
  app.post("/api/plans", async (c) => {
    const owner = requireUser(c.get("owner"));
    const p = planSchema.parse(await c.req.json());
    if (p.mode === "testnet" && c.get("mode") !== "testnet")
      throw new Fault(
        "WALLET_REQUIRED",
        "Connect your wallet for a testnet setup.",
        403,
      );
    return c.json(service.publish(owner, p), 201);
  });
  app.post("/api/plans/:id/revoke", (c) =>
    c.json(service.revoke(requireUser(c.get("owner")), c.req.param("id"))),
  );
  app.get("/api/accounts", (c) => c.json(service.accounts(c.get("owner"))));
  app.get("/api/entry-control", (c) => {
    if (c.get("mode") !== "testnet")
      throw new Fault(
        "WALLET_REQUIRED",
        "Sign in with your wallet to manage entries.",
        403,
      );
    return c.json(service.entryControl(requireUser(c.get("owner"))));
  });
  app.put("/api/entry-control", async (c) => {
    if (c.get("mode") !== "testnet")
      throw new Fault(
        "WALLET_REQUIRED",
        "Sign in with your wallet to manage entries.",
        403,
      );
    const { paused } = z
      .object({ paused: z.boolean() })
      .strict()
      .parse(await c.req.json());
    return c.json(
      service.setEntriesPaused(requireUser(c.get("owner")), paused),
    );
  });
  app.get("/api/readiness", async (c) => {
    const owner = requireUser(c.get("owner"));
    if (c.get("mode") !== "testnet")
      throw new Fault(
        "WALLET_REQUIRED",
        "Sign in with your testnet wallet to check trading access.",
        403,
      );
    const market = z
      .enum(["BTC-PERP", "ETH-PERP"])
      .parse(c.req.query("market"));
    if (!service.liveEnabled || !service.venue?.readiness)
      throw new Fault(
        "TESTNET_DISABLED",
        "Testnet access checks are not configured.",
        503,
      );
    let timer: ReturnType<typeof setTimeout>;
    try {
      return c.json(
        await Promise.race([
          service.venue.readiness(owner, market),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Fault(
                    "READINESS_TIMEOUT",
                    "Testnet access check timed out. No readiness is claimed. Try again.",
                    503,
                  ),
                ),
              12000,
            );
          }),
        ]),
      );
    } finally {
      clearTimeout(timer!);
    }
  });
  app.post("/api/accounts", async (c) => {
    const { mode, scenario } = z
      .object({
        mode: z.enum(["replay", "testnet"]),
        scenario: z
          .enum(["clean", "late", "stale", "thin", "lost-response"])
          .default("clean"),
      })
      .strict()
      .parse(await c.req.json());
    if (mode === "testnet" && c.get("mode") !== "testnet")
      throw new Fault(
        "WALLET_REQUIRED",
        "Sign in with the account’s wallet.",
        403,
      );
    return c.json(service.addAccount(c.get("owner"), mode, scenario), 201);
  });
  app.get("/api/policy", (c) => c.json(service.policy(c.get("owner"))));
  app.put("/api/policy", async (c) =>
    c.json(
      service.setPolicy(c.get("owner"), policySchema.parse(await c.req.json())),
    ),
  );
  app.post("/api/previews", async (c) => {
    const data = z
      .object({ planId: id, accountId: id })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await service.preview(c.get("owner"), data.planId, data.accountId),
    );
  });
  app.post("/api/intents", async (c) => {
    const data = z
      .object({ previewId: id, consent: z.literal(true) })
      .strict()
      .parse(await c.req.json());
    return c.json(
      service.approve(c.get("owner"), data.previewId, data.consent),
      201,
    );
  });
  app.get("/api/intents", (c) => c.json(service.intents(c.get("owner"))));
  app.get("/api/intents/:id", (c) =>
    c.json(service.intent(c.get("owner"), c.req.param("id"))),
  );
  app.post("/api/intents/:id/close", async (c) =>
    c.json(await service.close(c.get("owner"), c.req.param("id"))),
  );
  app.post("/api/intents/:id/recover", async (c) =>
    c.json(await service.recover(c.get("owner"), c.req.param("id"))),
  );
  app.post("/api/intents/:id/accounting", async (c) =>
    c.json(await service.settle(c.get("owner"), c.req.param("id"))),
  );
  app.get("/api/intents/:id/receipt", (c) =>
    c.json(receiptOf(service.intent(c.get("owner"), c.req.param("id")))),
  );
  app.onError((error, c) => {
    if (error instanceof Fault)
      return c.json(
        { code: error.code, message: error.message },
        error.status as 400,
      );
    if (error instanceof z.ZodError)
      return c.json(
        {
          code: "INVALID_INPUT",
          message: error.issues[0]?.message ?? "Invalid input.",
        },
        400,
      );
    console.error("Request failed:", error.name);
    return c.json(
      {
        code: "VENUE_UNAVAILABLE",
        message:
          "The request could not be completed. No successful execution is claimed. Try again or inspect the order timeline.",
      },
      503,
    );
  });
  app.all("/api/*", (c) =>
    c.json({ code: "NOT_FOUND", message: "API route not found." }, 404),
  );
  app.notFound((c) =>
    c.json({ code: "NOT_FOUND", message: "Not found." }, 404),
  );
  return app;
}

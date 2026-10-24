import { DurableObject } from "cloudflare:workers";
import { generatePrivateKey } from "viem/accounts";
import type { Hex } from "viem";
import { RecordStore } from "../server/records";
import { DurableSqlDatabase } from "./sqlite";
import { PactService } from "../server/service";
import { createApp } from "../server/app";
import { DreamDex } from "../server/dreamdex";
import type { Intent } from "../src/core/types";
import assets from "./assets.generated.json";

const terminal = new Set(["blocked", "rejected", "closed"]);
export class PactLane extends DurableObject<Cloudflare.Env> {
  private store: RecordStore;
  private service?: PactService;
  private venue: DreamDex | null = null;
  private queue: Promise<void> = Promise.resolve();
  private rates = new Map<string, { at: number; count: number }>();
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.store = new RecordStore(
      new DurableSqlDatabase(ctx.storage.sql),
      (fn) => ctx.storage.transactionSync(fn),
    );
  }
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  private getService() {
    if (!this.service) {
      const enabled = this.env.PACT_TESTNET_TRADING === "true";
      if (enabled && !/^0x[0-9a-fA-F]{40}$/.test(this.env.PACT_TESTNET_OWNER))
        throw new Error(
          "Cloudflare testnet execution requires a configured owner wallet.",
        );
      if (enabled) {
        // Dedicated testnet operator, generated inside private durable storage.
        // Neither the owner key nor this key is accepted through a browser API.
        let key = this.ctx.storage.kv.get<Hex>("operator-private-key");
        if (!key) {
          key = generatePrivateKey();
          this.ctx.storage.kv.put("operator-private-key", key);
        }
        this.venue = new DreamDex(key, WebSocket);
      }
      this.service = new PactService(this.store, this.venue, enabled);
    }
    return this.service;
  }
  private needsAlarm() {
    return this.store
      .list<Intent>("intent")
      .some((i) =>
        i.mode === "testnet"
          ? !terminal.has(i.state)
          : ["reserved", "submitted", "unknown"].includes(i.state),
      );
  }
  private async schedule() {
    if (this.needsAlarm()) {
      const current = await this.ctx.storage.getAlarm();
      const next = Date.now() + 1000;
      if (current === null || current > next)
        await this.ctx.storage.setAlarm(next);
    } else {
      await this.ctx.storage.deleteAlarm();
      await this.venue?.shutdown();
      this.service = undefined;
      this.venue = null;
    }
  }
  async handle(request: Request): Promise<Response> {
    return this.exclusive(async () => {
      const service = this.getService();
      const app = createApp(
        service,
        this.env.PACT_ORIGIN,
        this.venue?.key?.address ?? null,
        this.env.PACT_TESTNET_OWNER || undefined,
        this.rates,
      );
      try {
        // Persist a wakeup before a mutation can create work. An eviction after
        // approval must not leave a reserved order without an executor alarm.
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method))
          await this.ctx.storage.setAlarm(Date.now() + 1000);
        const response = await app.fetch(request, {
          incoming: {
            socket: {
              remoteAddress:
                request.headers.get("cf-connecting-ip") ?? "anonymous",
            },
          },
        });
        return response;
      } finally {
        await this.schedule();
      }
    });
  }
  async alarm(): Promise<void> {
    return this.exclusive(async () => {
      const service = this.getService();
      // Arm the next wakeup before network I/O, so a crash cannot strand work.
      if (this.needsAlarm()) await this.ctx.storage.setAlarm(Date.now() + 1000);
      try {
        await service.tick();
      } finally {
        await this.schedule();
      }
    });
  }
}

const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: wss:; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/")) {
      // One coordination atom per configured owner/operator lane, including its nonce.
      const lane = env.PACT_LANE.getByName(
        "operator:" + (env.PACT_TESTNET_OWNER || "practice"),
      );
      let response: Response;
      try {
        response = await lane.handle(request);
      } catch {
        return Response.json(
          {
            code: "LANE_UNAVAILABLE",
            message:
              "Pact storage or execution is temporarily unavailable. Check the existing order before retrying.",
          },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
      response.headers.set("Content-Security-Policy", csp);
      return response;
    }
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    const rows: Record<string, { content: string; type: string }> = assets;
    const asset =
      rows[path] ??
      (!path.split("/").at(-1)?.includes(".")
        ? rows["/index.html"]
        : undefined);
    if (!asset) return new Response("Not found", { status: 404 });
    return new Response(request.method === "HEAD" ? null : asset.content, {
      headers: {
        "Content-Type": asset.type,
        "Content-Security-Policy": csp,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Cache-Control": path.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      },
    });
  },
} satisfies ExportedHandler<Cloudflare.Env>;

import { rmSync } from "node:fs";
import { Store } from "../../server/store";
import { PactService } from "../../server/service";
import type {
  Observation,
  PositionObservation,
  Venue,
} from "../../server/venue";
import type { Intent, MarketSnapshot } from "../../src/core/types";
import { replaySnapshot } from "../../server/replay";
export const stores: Store[] = [];
export const folders: string[] = [];
export function cleanupExecution() {
  for (const db of stores.splice(0)) db.close();
  for (const dir of folders.splice(0))
    rmSync(dir, { recursive: true, force: true });
}
export function setup(path = ":memory:") {
  let now = 1800000000000;
  let quote: Partial<MarketSnapshot> = {};
  let position: Partial<PositionObservation> = {};
  let positionError = false;
  let broadcastError = false;
  let signingDelay = 0;
  const observations: Partial<Record<"entry" | "close", Observation>> = {};
  const prepared: { role: "entry" | "close"; intent: Intent }[] = [];
  let sends = 0;
  const db = new Store(path);
  stores.push(db);
  const venue: Venue = {
    snapshot: async (p, a) => ({ ...replaySnapshot(p, a, now), ...quote }),
    position: async () => {
      if (positionError)
        throw new Error("Position RPC unavailable. Pact will check again.");
      return {
        position: intent.decision.quantity,
        mark: "67595",
        markValid: true,
        observedAt: now,
        ...position,
      };
    },
    prepare: async (i, role) => {
      now += signingDelay;
      prepared.push({ role, intent: structuredClone(i) });
      return {
        hash: "0x" + (role === "entry" ? "ab" : "cd").repeat(32),
        raw: "0x01",
        pool: "0x" + "11".repeat(20),
        nonce: role === "entry" ? 0 : 1,
        baseDecimals: 8,
        quoteDecimals: 18,
        role,
      };
    },
    broadcast: async () => {
      sends++;
      if (broadcastError) throw new Error("Lost response");
    },
    observe: async (action) =>
      observations[action.role] ?? {
        state: "filled",
        detail: "Mocked on-chain fill",
        fills: [
          {
            role: action.role,
            quantity: intent.decision.quantity,
            price: intent.execution?.limit ?? intent.decision.limit,
            fee: "0",
            at: now,
            txHash: action.hash,
          },
        ],
      },
    shutdown: async () => {},
  };
  let service = new PactService(db, venue, true, () => now);
  const account = service.addAccount("owner", "testnet");
  const { id, author, digest, createdAt, revoked, version, ...terms } =
    service.plan("btc-pullback");
  const plan = service.publish("owner", { ...terms, mode: "testnet" });
  let intent: Intent;
  return {
    db,
    venue,
    plan,
    account,
    prepared,
    observations,
    get service() {
      return service;
    },
    get intent() {
      return service.intent("owner", intent.id);
    },
    get sends() {
      return sends;
    },
    setQuote: (s: Partial<MarketSnapshot>) => {
      quote = s;
    },
    setPosition: (s: Partial<PositionObservation>) => {
      position = s;
    },
    failPosition: (value: boolean) => {
      positionError = value;
    },
    failBroadcast: () => {
      broadcastError = true;
    },
    delaySigning: (ms: number) => {
      signingDelay = ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
    async approve() {
      const preview = await service.preview("owner", plan.id, account.id);
      intent = service.approve("owner", preview.id, true);
      return intent;
    },
    async open() {
      await this.approve();
      await service.tick();
      await service.tick();
      if (this.intent.state !== "open")
        throw new Error("Fixture could not open position");
    },
    restart() {
      db.close();
      stores.splice(stores.indexOf(db), 1);
      const reopened = new Store(path);
      stores.push(reopened);
      service = new PactService(reopened, venue, true, () => now);
    },
  };
}

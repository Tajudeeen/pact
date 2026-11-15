import { afterEach, describe, expect, it } from "vitest";
import { Store } from "../server/store";
import { SqlAccessRepository } from "../server/access/sql-repository";
import type { AccessContext, AccountOwnershipPolicy } from "../server/access/contracts";

const context: AccessContext = {
  requestId: "sql-req-1",
  sellerId: "seller-1",
  resourceId: "resource-1",
  buyerAgentId: "agent-1",
  ownerAccount: "owner-account",
  payerAccount: "payer-account",
  network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
  challenge: "12".repeat(32),
  expiresAt: "2026-11-15T12:05:00.000Z",
};
const policy: AccountOwnershipPolicy = {
  policyId: "owner-proof-v1",
  description: "test policy",
};

describe("SqlAccessRepository", () => {
  let store: Store | undefined;
  afterEach(() => {
    store?.close();
    store = undefined;
  });

  it("persists the request context, policy, and initial proof gate", async () => {
    store = new Store(":memory:");
    const repo = new SqlAccessRepository(store);
    await repo.create(context, policy);

    expect(await repo.get(context.requestId)).toMatchObject({
      requestId: context.requestId,
      state: "proof_required",
    });
    expect(await repo.context(context.requestId)).toEqual(context);
    expect(await repo.policyFor(context)).toEqual(policy);
  });

  it("consumes a challenge exactly once", async () => {
    store = new Store(":memory:");
    const repo = new SqlAccessRepository(
      store,
      () => new Date("2026-11-15T12:01:00.000Z"),
    );
    await repo.create(context, policy);

    expect(await repo.consume(context.requestId, context.challenge)).toBe(true);
    expect(await repo.consume(context.requestId, context.challenge)).toBe(false);
  });

  it("rejects expired and mismatched challenges", async () => {
    store = new Store(":memory:");
    const repo = new SqlAccessRepository(
      store,
      () => new Date("2026-11-15T12:06:00.000Z"),
    );
    await repo.create(context, policy);

    expect(await repo.consume(context.requestId, "ff".repeat(32))).toBe(false);
    expect(await repo.consume(context.requestId, context.challenge)).toBe(false);
  });

  it("uses compare-and-set transitions and allows one delivery claim", async () => {
    store = new Store(":memory:");
    const repo = new SqlAccessRepository(store);
    await repo.create(context, policy);

    await repo.transition(context.requestId, "proof_required", "proof_valid");
    await repo.transition(context.requestId, "proof_verified", "payment_started");
    await repo.transition(context.requestId, "payment_pending", "payment_confirmed", {
      paymentReference: "tx-1",
    });

    expect(await repo.claimDelivery(context.requestId)).toBe(true);
    expect(await repo.claimDelivery(context.requestId)).toBe(false);

    await repo.transition(context.requestId, "paid", "resource_delivered", {
      deliveredAt: "2026-11-15T12:02:00.000Z",
    });
    await repo.completeDelivery(context.requestId, "2026-11-15T12:02:00.000Z");
    expect((await repo.get(context.requestId))?.state).toBe("delivered");
    expect(await repo.claimDelivery(context.requestId)).toBe(false);
  });

  it("rejects stale state transitions", async () => {
    store = new Store(":memory:");
    const repo = new SqlAccessRepository(store);
    await repo.create(context, policy);
    await repo.transition(context.requestId, "proof_required", "proof_valid");

    await expect(
      repo.transition(context.requestId, "proof_required", "proof_valid"),
    ).rejects.toThrow("state changed");
  });
});

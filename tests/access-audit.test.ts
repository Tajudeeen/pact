import { afterEach, describe, expect, it } from "vitest";
import { Store } from "../server/store";
import { SqlAccessAuditWriter } from "../server/access/sql-audit";
import type { AccessAuditEvent } from "../server/access/contracts";

describe("SqlAccessAuditWriter", () => {
  let store: Store | undefined;
  afterEach(() => {
    store?.close();
    store = undefined;
  });

  it("stores ordered, sanitized audit events", async () => {
    store = new Store(":memory:");
    const audit = new SqlAccessAuditWriter(store);
    const events: AccessAuditEvent[] = [
      {
        requestId: "audit-req-1",
        state: "proof_verified",
        at: "2026-11-15T12:00:00.000Z",
        proofReference: "account-signature:audit-req-1",
        registryReference: "agent-token-1",
      },
      {
        requestId: "audit-req-1",
        state: "paid",
        at: "2026-11-15T12:00:05.000Z",
        paymentReference: "ccd-tx-1",
      },
    ];
    for (const event of events) await audit.append(event);

    expect(await audit.list("audit-req-1")).toEqual(events);
    expect(await audit.list("other-request")).toEqual([]);
    const serialized = JSON.stringify(await audit.list("audit-req-1"));
    expect(serialized).not.toContain("identityDocument");
    expect(serialized).not.toContain("rawPresentation");
    expect(serialized).not.toContain("privateKey");
  });
});

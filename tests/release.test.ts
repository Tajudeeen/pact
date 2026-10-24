import { it, expect, vi } from "vitest";
import { assertExecutionNetwork, RELEASE } from "../server/release";
import { DreamDex } from "../server/dreamdex";
it("keeps mainnet unavailable regardless of deployment flags", () => {
  expect(() => assertExecutionNetwork("mainnet")).toThrow(
    "not supported or qualified",
  );
  expect(() => assertExecutionNetwork("5031")).toThrow();
  expect(RELEASE.mainnetEnabled).toBe(false);
  expect(RELEASE.blockers.length).toBeGreaterThan(0);
  vi.stubEnv("PACT_NETWORK", "mainnet");
  try {
    expect(() => new DreamDex()).toThrow("not supported or qualified");
  } finally {
    vi.unstubAllEnvs();
  }
});

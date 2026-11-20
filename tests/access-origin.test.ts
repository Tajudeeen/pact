// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isAllowedBrowserRequest } from "../cloudflare/access-api.js";

const production = "https://pact-access.vercel.app";
const preview = "https://pact-git-feat-pact-multipage-workspace-deeencodes.vercel.app";
const allowlist = preview;

describe("Pact Access browser origin policy", () => {
  it("accepts the production origin", () => {
    const request = new Request("https://worker.test/api/access/challenges", {
      headers: { Origin: production },
    });
    expect(isAllowedBrowserRequest(request, production, allowlist)).toBe(true);
  });

  it("accepts only the explicitly configured Vercel preview origin", () => {
    const request = new Request("https://worker.test/api/access/challenges", {
      headers: { Referer: preview + "/app/verification" },
    });
    expect(isAllowedBrowserRequest(request, production, allowlist)).toBe(true);
  });

  it("rejects unrelated Vercel preview deployments", () => {
    const request = new Request("https://worker.test/api/access/challenges", {
      headers: { Referer: "https://pact-random-deployment.vercel.app/app/verification" },
    });
    expect(isAllowedBrowserRequest(request, production, allowlist)).toBe(false);
  });

  it("does not let an allowed Referer override a disallowed Origin", () => {
    const request = new Request("https://worker.test/api/access/challenges", {
      headers: {
        Origin: "https://attacker.example",
        Referer: preview + "/app/verification",
      },
    });
    expect(isAllowedBrowserRequest(request, production, allowlist)).toBe(false);
  });

  it("rejects requests without an allowed Origin or Referer", () => {
    const request = new Request("https://worker.test/api/access/challenges");
    expect(isAllowedBrowserRequest(request, production, allowlist)).toBe(false);
  });
});

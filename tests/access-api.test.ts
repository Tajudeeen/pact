// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessApi, AccessApiError } from "../src/access/api";

afterEach(() => vi.unstubAllGlobals());

describe("Pact Access API transport", () => {
  it("uses the same-origin Vercel rewrite instead of the legacy browser preview runtime", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ status: "ok", storage: "ready" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await accessApi<{ status: string }>("/health");

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/health");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("sends owner proof JSON through the same-origin access route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ requestId: "request-1" }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await accessApi("/access/challenges", {
      method: "POST",
      body: { buyerAgentId: "agent-token" },
    });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/access/challenges");
    expect(fetchMock.mock.calls[0][1].headers.get("Content-Type")).toBe(
      "application/json",
    );
    expect(fetchMock.mock.calls[0][1].body).toBe(
      JSON.stringify({ buyerAgentId: "agent-token" }),
    );
  });

  it("preserves server error codes and HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { code: "BADGE_REJECTED", message: "Badge is invalid." },
          { status: 403 },
        ),
      ),
    );

    await expect(accessApi("/access/registry/invalid-token")).rejects.toMatchObject({
      name: "AccessApiError",
      code: "BADGE_REJECTED",
      status: 403,
      message: "Badge is invalid.",
    });
  });

  it("rejects absolute or malformed paths before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(accessApi("https://evil.test/api")).rejects.toBeInstanceOf(
      AccessApiError,
    );
    await expect(accessApi("//evil.test/path")).rejects.toBeInstanceOf(
      AccessApiError,
    );
    await expect(accessApi("/../secrets")).rejects.toBeInstanceOf(
      AccessApiError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";

afterEach(cleanup);

describe("Pact Access routes", () => {
  it("redirects /app to the workspace overview", async () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Workspace navigation" })).toBeDefined();
  });

  it.each([
    ["/app/agents", "Agents"],
    ["/app/verification", "Owner verification"],
    ["/app/payments", "Payments"],
    ["/app/activity", "Activity"],
    ["/app/evidence", "Evidence"],
    ["/app/settings", "Settings"],
  ])("renders the %s workspace route", async (path, heading) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: heading })).toBeDefined();
    if (path === "/app/verification")
      expect(screen.getByLabelText("CIS-8004 buyer agent ID")).toBeDefined();
  });

  it("routes the legacy evidence URL to the audit activity page", async () => {
    render(
      <MemoryRouter initialEntries={["/evidence"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Activity" })).toBeDefined();
  });

  it("keeps unknown public routes on the public homepage", async () => {
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: /access for agents/i }),
    ).toBeDefined();
  });
});

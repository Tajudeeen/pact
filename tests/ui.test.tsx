// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";

afterEach(cleanup);

describe("Pact Access public routes", () => {
  it.each(["/app", "/evidence", "/unknown"])(
    "routes %s to the Pact Access landing page",
    async (path) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>,
      );
      expect(
        await screen.findByRole("heading", { name: /access for agents/i }),
      ).toBeDefined();
    },
  );
});

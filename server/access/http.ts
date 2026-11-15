import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  PACT_ACCESS_REQUEST_HEADER,
} from "./x402-hooks";
import type { PactAccessRuntimeConfig } from "./runtime";

export interface PactAccessHttpRuntime {
  middleware: unknown;
  issueChallengeForAgent(buyerAgentId: string): Promise<{
    requestId: string;
    challenge: string;
    expiresAt: string;
    policyId: string;
    message: string;
  }>;
  deliverPaidResource(requestId: string): Promise<
    | { status: "delivered"; value: Uint8Array; paymentReference: string }
    | { status: string }
  >;
}

/**
 * A small Hono router for the first seller resource.
 * Mount this router behind the application's origin, session, and rate-limit
 * middleware. It never accepts seller, resource, owner, or payer fields from
 * the challenge request body.
 */
export function createPactAccessHttpRoutes(
  runtime: PactAccessHttpRuntime,
  config: Pick<PactAccessRuntimeConfig, "routePath" | "mimeType">,
) {
  const app = new Hono();
  app.use(
    "*",
    bodyLimit({
      maxSize: 16_384,
      onError: (c) => c.json({ error: "Request body too large." }, 413),
    }),
  );

  app.post("/api/access/challenges", async (c) => {
    const parsed = z.object({
      buyerAgentId: z.string().min(20).max(80).regex(/^[1-9A-HJ-NP-Za-km-z]+$/),
    }).strict().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "A valid buyerAgentId is required." }, 400);

    try {
      const challenge = await runtime.issueChallengeForAgent(parsed.data.buyerAgentId);
      c.header("Cache-Control", "no-store");
      return c.json(challenge, 201);
    } catch {
      return c.json({
        error: "The buyer agent could not be resolved in the trusted active registry.",
      }, 403);
    }
  });

  app.use(config.routePath, runtime.middleware as MiddlewareHandler);

  app.get(config.routePath, async (c) => {
    const requestId = c.req.header(PACT_ACCESS_REQUEST_HEADER);
    if (!requestId)
      return c.json({ error: "Pact access request header is required." }, 400);

    try {
      const result = await runtime.deliverPaidResource(requestId);
      if (result.status !== "delivered" || !("value" in result))
        return c.json({ error: "Resource is not cleared for delivery." }, 409);

      c.header("Cache-Control", "private, no-store");
      c.header("X-Content-Type-Options", "nosniff");
      const body = new Uint8Array(result.value.byteLength);
      body.set(result.value);
      return c.body(body, 200, {
        "Content-Type": config.mimeType,
      });
    } catch {
      return c.json({ error: "Protected resource delivery is unavailable." }, 409);
    }
  });

  return app;
}

export type PactAccessHttpApp = ReturnType<typeof createPactAccessHttpRoutes>;

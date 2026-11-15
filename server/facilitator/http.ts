import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

export interface PactFacilitatorRuntime {
  supported(): unknown;
  verify(paymentPayload: unknown, paymentRequirements: unknown): Promise<unknown>;
  settle(paymentPayload: unknown, paymentRequirements: unknown): Promise<unknown>;
}

/** Minimal x402 facilitator HTTP API. Deploy separately from the seller app. */
export function createPactFacilitatorHttpApp(
  runtime: PactFacilitatorRuntime,
  config: { authToken: string },
) {
  if (config.authToken.trim().length < 32)
    throw new Error("A 32-character minimum facilitator bearer token is required.");

  const app = new Hono();
  app.use("*", async (c, next) => {
    if (c.req.path === "/health") return next();
    const supplied = Buffer.from(c.req.header("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${config.authToken}`);
    if (
      supplied.byteLength !== expected.byteLength ||
      !timingSafeEqual(supplied, expected)
    ) return c.json({ error: "Unauthorized." }, 401);
    await next();
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 128 * 1024,
      onError: (c) => c.json({ error: "Request body too large." }, 413),
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/supported", (c) => c.json(runtime.supported()));

  const schema = z.object({
    x402Version: z.number().optional(),
    paymentPayload: z.unknown(),
    paymentRequirements: z.unknown(),
  }).strict();

  app.post("/verify", async (c) => {
    const parsed = schema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "Invalid facilitator verification request." }, 400);
    try {
      return c.json(await runtime.verify(
        parsed.data.paymentPayload,
        parsed.data.paymentRequirements,
      ));
    } catch {
      return c.json({ error: "Payment verification failed." }, 502);
    }
  });

  app.post("/settle", async (c) => {
    const parsed = schema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "Invalid facilitator settlement request." }, 400);
    try {
      return c.json(await runtime.settle(
        parsed.data.paymentPayload,
        parsed.data.paymentRequirements,
      ));
    } catch (error) {
      const failure = error as Error & {
        errorReason?: string;
        errorMessage?: string;
        transaction?: string;
        network?: string;
        payer?: string;
      };
      if (failure.errorReason && failure.network) {
        // HTTPFacilitatorClient converts this non-2xx SettleResponse into a
        // SettleError and preserves the transaction hash for seller-side
        // reconciliation after a finalization timeout.
        return c.json({
          success: false,
          errorReason: failure.errorReason,
          errorMessage: failure.errorMessage ?? failure.errorReason,
          transaction: failure.transaction ?? "",
          network: failure.network,
          ...(failure.payer ? { payer: failure.payer } : {}),
        }, 502);
      }
      return c.json({ error: "Payment settlement failed." }, 502);
    }
  });

  return app;
}

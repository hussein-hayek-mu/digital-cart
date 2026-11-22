import { randomUUID } from "node:crypto";
import { checkoutCreateSchema, HTTP_STATUS, idempotencyKeySchema } from "@repo/shared";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import type { Env } from "../config/env.js";
import type { Store } from "../db/store.js";
import { optionalAuth } from "../lib/auth/middleware.js";
import { logger } from "../lib/logger.js";
import type { PaymentProvider } from "../payments/types.js";
import { createCheckout } from "../services/checkout.js";
import { processWaveCompletedEvent } from "../services/fulfilment.js";
import { processOutboxOnce } from "../workers/outbox-processor.js";

export type CheckoutRouteContext = {
  env: Env;
  store: Store;
  provider: PaymentProvider;
};

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function getUserId(req: Request): string | null {
  return (req as Request & { userId?: string }).userId ?? null;
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function errorCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}

/**
 * Phase 4 payment/reservation core.
 *
 * Deliberately mounted as its own router (NOT via routes/v1.ts) so this
 * security/payment-critical surface is easy to audit in isolation:
 *   - POST /api/v1/checkout/sessions        create a reservation + payment session
 *   - GET  /api/v1/orders/:publicRef/status public order status (no codes)
 *   - POST /api/v1/dev/complete-payment     dev-only fake-payment completion
 *
 * Prices are always computed server-side from the store; the client only
 * ever supplies `productPublicId` + `quantity`. Idempotency is carried by
 * the `Idempotency-Key` header, never the request body.
 */
export function mountCheckoutRoutes(app: Express, ctx: CheckoutRouteContext) {
  const r = express.Router();

  r.post(
    "/checkout/sessions",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const parsedKey = idempotencyKeySchema.safeParse(req.header("Idempotency-Key"));
      if (!parsedKey.success) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: {
            code: "IDEMPOTENCY_KEY_REQUIRED",
            message: "Idempotency-Key header is required and must be at least 16 characters",
          },
        });
        return;
      }

      const body = checkoutCreateSchema.parse(req.body);

      try {
        const result = await createCheckout({
          store: ctx.store,
          provider: ctx.provider,
          env: ctx.env,
          input: body,
          idempotencyKey: parsedKey.data,
          userId: getUserId(req),
        });

        res.status(HTTP_STATUS.CREATED).json({
          data: {
            publicReference: result.publicReference,
            status: result.status,
            waveLaunchUrl: result.waveLaunchUrl,
            totalAmountMinor: result.totalAmountMinor,
            currency: result.currency,
            accessToken: result.accessToken,
            reused: result.reused,
          },
        });
      } catch (err) {
        const code = errorCode(err);
        if (code === "INSUFFICIENT_STOCK") {
          res.status(HTTP_STATUS.CONFLICT).json({ error: { code } });
          return;
        }
        if (code === "PRODUCT_NOT_FOUND") {
          res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code } });
          return;
        }
        throw err;
      }
    }),
  );

  // Public order status — never exposes codes/secrets, only status + totals.
  r.get(
    "/orders/:publicRef/status",
    asyncHandler(async (req, res) => {
      const order = await ctx.store.getOrderByPublicRef(routeParam(req.params.publicRef));
      if (!order) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      res.json({
        data: {
          publicReference: order.publicReference,
          status: order.status,
          totalAmountMinor: order.totalAmountMinor,
          currency: order.currency,
          paidAt: order.paidAt,
          fulfilledAt: order.fulfilledAt,
        },
      });
    }),
  );

  // Dev-only: simulate a completed Wave payment without any live Wave call.
  // Only ever mounted outside production and only for the fake provider.
  if (ctx.env.NODE_ENV !== "production" && ctx.env.PAYMENT_PROVIDER === "fake") {
    r.post(
      "/dev/complete-payment",
      asyncHandler(async (req, res) => {
        const body = (req.body ?? {}) as { sessionId?: unknown; transactionId?: unknown };
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
        if (!sessionId) {
          res.status(HTTP_STATUS.BAD_REQUEST).json({ error: { code: "SESSION_ID_REQUIRED" } });
          return;
        }
        const transactionId =
          typeof body.transactionId === "string" && body.transactionId.length > 0
            ? body.transactionId
            : `TXN_FAKE_${randomUUID().slice(0, 8)}`;

        if (!ctx.provider.completeSessionForTest) {
          res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
          return;
        }

        try {
          await ctx.provider.completeSessionForTest(sessionId, transactionId);
          await processWaveCompletedEvent({
            store: ctx.store,
            provider: ctx.provider,
            env: ctx.env,
            sessionId,
            eventId: `dev_${randomUUID()}`,
          });
          await processOutboxOnce(ctx.store, ctx.provider, ctx.env);
        } catch (err) {
          logger.warn("dev_complete_payment_failed", {
            error: err instanceof Error ? err.message : "unknown",
          });
          res.status(HTTP_STATUS.BAD_REQUEST).json({ error: { code: "COMPLETE_PAYMENT_FAILED" } });
          return;
        }

        const payment = await ctx.store.getPaymentBySessionId(sessionId);
        const order = payment ? await ctx.store.getOrderById(payment.orderId) : null;

        res.json({
          data: {
            ok: true,
            transactionId,
            publicReference: order?.publicReference,
            status: order?.status,
          },
        });
      }),
    );
  }

  app.use("/api/v1", r);
}

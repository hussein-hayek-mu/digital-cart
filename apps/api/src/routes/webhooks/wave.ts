import { HTTP_STATUS, verifyWaveSignatureHeader } from "@repo/shared";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import type { Env } from "../../config/env.js";
import type { Store } from "../../db/store.js";
import { logger } from "../../lib/logger.js";
import type { PaymentProvider } from "../../payments/types.js";
import {
  processWaveCompletedEvent,
  processWavePaymentFailedEvent,
} from "../../services/fulfilment.js";

export type WaveWebhookContext = {
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

type WaveWebhookPayload = {
  id: string;
  type: string;
  data: { id: string };
};

/**
 * Wave checkout webhook.
 *
 * Mounted as its own route (NOT via `routes/v1.ts`) and registered before
 * `express.json()` in `index.ts`, because signature verification needs the
 * *exact* raw request bytes — `express.raw({ type: "application/json" })`
 * is scoped to this single route so the rest of the API keeps using the
 * normal parsed-JSON body.
 *
 * Flow:
 *   1. Capture the raw body (Buffer -> utf8 string) before any JSON parsing.
 *   2. Verify the `Wave-Signature` header (timing-safe HMAC, `t=`/`v1=`
 *      parts, 5-minute clock-skew tolerance) against the current and, if
 *      configured, previous webhook secret (for zero-downtime rotation).
 *   3. Respond 200 immediately once the signature is valid, then process
 *      the event asynchronously — Wave expects a fast ack and will retry
 *      on timeout, which would otherwise cause duplicate processing.
 *   4. Deduplicate by provider event id via `store.recordWebhookEvent`
 *      (done inside `processWaveCompletedEvent` /
 *      `processWavePaymentFailedEvent`) so retried/duplicated deliveries
 *      are no-ops.
 *
 * This route only *enqueues* work (`processWaveCompletedEvent` pushes a
 * `fulfil_checkout` outbox job); the outbox worker is responsible for
 * actually calling `runFulfilCheckoutJob`, which re-confirms payment via a
 * live provider GET before touching inventory.
 */
export function mountWaveWebhookRoutes(app: Express, ctx: WaveWebhookContext) {
  app.post(
    "/api/v1/webhooks/wave",
    express.raw({ type: "application/json" }),
    asyncHandler(async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : typeof req.body === "string"
          ? req.body
          : "";
      const signature = req.header("Wave-Signature") ?? "";
      // Support secret rotation: accept the current secret and, during a
      // rotation window, the previous one too. Never log either value.
      const secrets = [ctx.env.WAVE_WEBHOOK_SECRET, ctx.env.WAVE_WEBHOOK_SECRET_PREVIOUS].filter(
        Boolean,
      ) as string[];

      let valid = false;
      if (secrets.length > 0) {
        valid = verifyWaveSignatureHeader(signature, rawBody, secrets);
      } else if (ctx.env.PAYMENT_PROVIDER === "fake" && ctx.env.NODE_ENV !== "production") {
        // Dev/fake-provider convenience only: never allow an unsigned
        // webhook to be accepted in production, even accidentally.
        valid = true;
      }

      if (!valid) {
        logger.warn("webhook_signature_invalid");
        res.status(HTTP_STATUS.FORBIDDEN).json({ error: { code: "INVALID_SIGNATURE" } });
        return;
      }

      // Ack quickly; Wave should not wait on our downstream processing.
      res.status(HTTP_STATUS.OK).json({ received: true });

      try {
        const payload = JSON.parse(rawBody) as WaveWebhookPayload;
        switch (payload.type) {
          case "checkout.session.completed": {
            await processWaveCompletedEvent({
              store: ctx.store,
              provider: ctx.provider,
              env: ctx.env,
              sessionId: payload.data.id,
              eventId: payload.id,
            });
            break;
          }
          case "checkout.session.payment_failed": {
            await processWavePaymentFailedEvent({
              store: ctx.store,
              sessionId: payload.data.id,
              eventId: payload.id,
            });
            break;
          }
          default: {
            logger.info("webhook_event_type_ignored", { type: payload.type });
          }
        }
      } catch (err) {
        logger.error("webhook_process_enqueue_failed", {
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }),
  );
}

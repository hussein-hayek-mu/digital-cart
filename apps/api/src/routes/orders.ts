import { guestLookupSchema, HTTP_STATUS } from "@repo/shared";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import type { Env } from "../config/env.js";
import type { Store } from "../db/store.js";
import { optionalAuth } from "../lib/auth/middleware.js";
import { rateLimit } from "../lib/rate-limit.js";
import {
  getOrderDetails,
  requestOrderLink,
  resolveOrderAccess,
  revealCodesForOrder,
} from "../services/order-access.js";

const ACCESS_HEADER = "X-Order-Access-Token";

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
}

/**
 * Phase 7 order access.
 *   POST /api/v1/orders/lookup              email a fresh access link (uniform reply)
 *   GET  /api/v1/orders/:publicRef          order details, no codes
 *   POST /api/v1/orders/:publicRef/codes    reveal codes (audited)
 *
 * Access = signed-in owner (Bearer JWT) or an X-Order-Access-Token issued for
 * that order. Unknown order and missing access both answer 404.
 */
export function mountOrderRoutes(app: Express, ctx: { env: Env; store: Store }) {
  const r = express.Router();

  r.post(
    "/orders/lookup",
    rateLimit({ name: "order_lookup", windowMs: 15 * 60_000, max: 5 }),
    asyncHandler(async (req, res) => {
      const body = guestLookupSchema.parse(req.body);
      await requestOrderLink(ctx.store, body.publicReference, body.email);
      res.status(HTTP_STATUS.OK).json({ data: { sent: true } });
    }),
  );

  const access = async (req: Request) =>
    resolveOrderAccess(ctx.store, ctx.env, {
      publicReference: String(req.params.publicRef),
      userId: req.userId ?? null,
      token: req.header(ACCESS_HEADER) ?? null,
    });

  r.get(
    "/orders/:publicRef",
    noStore,
    rateLimit({ name: "order_view", windowMs: 15 * 60_000, max: 120 }),
    optionalAuth,
    asyncHandler(async (req, res) => {
      const granted = await access(req);
      if (!granted) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      res.json({ data: await getOrderDetails(ctx.store, granted.order) });
    }),
  );

  r.post(
    "/orders/:publicRef/codes",
    noStore,
    rateLimit({ name: "order_reveal", windowMs: 15 * 60_000, max: 20 }),
    optionalAuth,
    asyncHandler(async (req, res) => {
      const granted = await access(req);
      if (!granted) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      if (granted.order.status !== "fulfilled") {
        res.status(HTTP_STATUS.CONFLICT).json({ error: { code: "NOT_FULFILLED" } });
        return;
      }
      const codes = await revealCodesForOrder(ctx.store, ctx.env, granted, req.userId ?? null);
      res.json({ data: { publicReference: granted.order.publicReference, codes } });
    }),
  );

  app.use("/api/v1", r);
}

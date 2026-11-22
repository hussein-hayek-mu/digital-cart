import { HTTP_STATUS, profileUpdateSchema } from "@repo/shared";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import type { Store } from "../db/store.js";
import { requireAuth } from "../lib/auth/middleware.js";
import {
  getOrCreateProfile,
  listUserOrderSummaries,
  updateProfile,
} from "../services/profile.js";

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function getAuthContext(req: Request): { userId: string; userEmail?: string } {
  const userId = req.userId;
  if (!userId) {
    throw Object.assign(new Error("UNAUTHORIZED"), { code: "UNAUTHORIZED" });
  }
  return { userId, userEmail: req.userEmail };
}

/**
 * Phase 3 authenticated profile routes.
 * Mounted under /api/v1 — never trusts client-supplied email or role.
 */
export function mountProfileRoutes(app: Express, store: Store) {
  const r = express.Router();

  r.get(
    "/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { userId, userEmail } = getAuthContext(req);
      const profile = await getOrCreateProfile(store, userId, userEmail);
      res.status(HTTP_STATUS.OK).json({ data: profile });
    }),
  );

  r.patch(
    "/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { userId, userEmail } = getAuthContext(req);
      const body = profileUpdateSchema.parse(req.body);
      const profile = await updateProfile(store, userId, body, userEmail);
      res.status(HTTP_STATUS.OK).json({ data: profile });
    }),
  );

  r.get(
    "/me/orders",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { userId } = getAuthContext(req);
      const orders = await listUserOrderSummaries(store, userId);
      res.status(HTTP_STATUS.OK).json({ data: { orders } });
    }),
  );

  app.use("/api/v1", r);
}

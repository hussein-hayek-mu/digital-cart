import { HTTP_STATUS, orderStatusSchema } from "@repo/shared";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth/middleware.js";
import { rateLimit } from "../lib/rate-limit.js";
import {
  addCodes,
  AdminError,
  createProduct,
  getOrder,
  getProduct,
  getSummary,
  listActivity,
  listCategories,
  listInventory,
  listProducts,
  recordRefund,
  resendOrderLink,
  retryFulfilment,
  searchOrders,
  setCodeDisabled,
  updateProduct,
  type AdminCtx,
} from "../services/admin.js";

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((err: unknown) => {
      if (err instanceof AdminError) {
        res.status(err.status).json({ error: { code: err.code, details: err.details } });
        return;
      }
      next(err);
    });
  };
}

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

const productSchema = z.object({
  name: text(120),
  categoryId: z.string().uuid(),
  platform: text(60),
  region: text(60),
  faceValue: z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,2})?$/)
    .refine((v) => Number(v) > 0),
  faceCurrency: z.string().trim().min(1).max(12),
  saleAmountMinor: z.number().int().min(100).max(10_000_000),
  description: optionalText(2000),
  instructions: optionalText(4000),
  isActive: z.boolean(),
  lowStockThreshold: z.number().int().min(0).max(1000),
});

const codesSchema = z.object({ codes: z.string().min(1).max(100_000) });
const refundSchema = z.object({ step: z.enum(["start", "complete"]), note: text(500) });
const orderQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: orderStatusSchema.optional(),
});

/**
 * Phase 8 admin API, all under /api/v1/admin. Every route requires a signed-in
 * user whose account has the admin role in public.user_roles; the check runs
 * server-side on every request. Responses are never cached.
 */
export function mountAdminRoutes(app: Express, ctx: AdminCtx | null) {
  const r = express.Router();

  r.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  r.use(rateLimit({ name: "admin", windowMs: 15 * 60_000, max: 600 }));
  r.use(requireAuth);
  r.use((req, res, next) => {
    if (!ctx) {
      res.status(503).json({ error: { code: "ADMIN_REQUIRES_DATABASE" } });
      return;
    }
    const userId = req.userId;
    if (!userId) {
      res.status(HTTP_STATUS.FORBIDDEN).json({ error: { code: "FORBIDDEN" } });
      return;
    }
    ctx.store
      .isAdmin(userId)
      .then((ok) => {
        if (ok) next();
        else res.status(HTTP_STATUS.FORBIDDEN).json({ error: { code: "FORBIDDEN" } });
      })
      .catch(next);
  });

  const c = () => ctx as AdminCtx;
  const adminId = (req: Request) => req.userId as string;

  r.get("/me", (req, res) => {
    res.json({ data: { isAdmin: true, email: req.userEmail ?? null } });
  });

  r.get("/summary", asyncHandler(async (_req, res) => void res.json({ data: await getSummary(c()) })));
  r.get("/categories", asyncHandler(async (_req, res) => void res.json({ data: await listCategories(c()) })));
  r.get("/products", asyncHandler(async (_req, res) => void res.json({ data: await listProducts(c()) })));

  r.post(
    "/products",
    asyncHandler(async (req, res) => {
      const input = productSchema.parse(req.body);
      res.status(HTTP_STATUS.CREATED).json({ data: await createProduct(c(), adminId(req), input) });
    }),
  );

  r.get(
    "/products/:publicId",
    asyncHandler(async (req, res) => void res.json({ data: await getProduct(c(), String(req.params.publicId)) })),
  );

  r.patch(
    "/products/:publicId",
    asyncHandler(async (req, res) => {
      const input = productSchema.partial().parse(req.body);
      res.json({ data: await updateProduct(c(), adminId(req), String(req.params.publicId), input) });
    }),
  );

  r.get(
    "/products/:publicId/codes",
    asyncHandler(async (req, res) => void res.json({ data: await listInventory(c(), String(req.params.publicId)) })),
  );

  r.post(
    "/products/:publicId/codes",
    asyncHandler(async (req, res) => {
      const { codes } = codesSchema.parse(req.body);
      res.json({ data: await addCodes(c(), adminId(req), String(req.params.publicId), codes) });
    }),
  );

  for (const action of ["disable", "enable"] as const) {
    r.post(
      `/codes/:id/${action}`,
      asyncHandler(async (req, res) => {
        const id = z.string().uuid().parse(req.params.id);
        await setCodeDisabled(c(), adminId(req), id, action === "disable");
        res.json({ data: { ok: true } });
      }),
    );
  }

  r.get(
    "/orders",
    asyncHandler(async (req, res) => {
      const { q, status } = orderQuerySchema.parse(req.query);
      res.json({ data: await searchOrders(c(), q || undefined, status) });
    }),
  );

  r.get(
    "/orders/:ref",
    asyncHandler(async (req, res) => void res.json({ data: await getOrder(c(), String(req.params.ref)) })),
  );

  r.post(
    "/orders/:ref/fulfil",
    asyncHandler(async (req, res) => {
      await retryFulfilment(c(), adminId(req), String(req.params.ref));
      res.json({ data: { ok: true } });
    }),
  );

  r.post(
    "/orders/:ref/resend-link",
    asyncHandler(async (req, res) => {
      await resendOrderLink(c(), adminId(req), String(req.params.ref));
      res.json({ data: { ok: true } });
    }),
  );

  r.post(
    "/orders/:ref/refund",
    asyncHandler(async (req, res) => {
      const { step, note } = refundSchema.parse(req.body);
      await recordRefund(c(), adminId(req), String(req.params.ref), step, note);
      res.json({ data: { ok: true } });
    }),
  );

  r.get(
    "/activity",
    asyncHandler(async (req, res) => {
      const adminOnly = req.query.all !== "1";
      res.json({ data: await listActivity(c(), { adminOnly, limit: 200 }) });
    }),
  );

  app.use("/api/v1/admin", r);
}

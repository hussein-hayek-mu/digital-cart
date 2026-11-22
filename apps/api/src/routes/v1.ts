import {
  cartValidateSchema,
  checkoutCreateSchema,
  guestLookupSchema,
  guestVerifySchema,
  hashToken,
  HTTP_STATUS,
  profileUpdateSchema,
  adminCategorySchema,
  adminProductSchema,
  adminRevealSchema,
  adminRefundSchema,
  encryptCardSecret,
  fingerprintCode,
  maskCode,
  normalizeCode,
  verifyWaveSignatureHeader,
} from "@repo/shared";
import { randomUUID } from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import type { Env } from "../config/env.js";
import type { Store } from "../db/store.js";
import { generatePublicId } from "../lib/ids.js";
import { logger } from "../lib/logger.js";
import type { PaymentProvider } from "../payments/types.js";
import { createCheckout, validateCart } from "../services/checkout.js";
import {
  issueGuestAccessToken,
  processWaveCompletedEvent,
  revealOrderCodes,
  runFulfilCheckoutJob,
} from "../services/fulfilment.js";

export type AppContext = {
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

export function mountV1Routes(app: Express, ctx: AppContext) {
  const r = express.Router();

  r.get(
    "/categories",
    asyncHandler(async (_req, res) => {
      const cats = await ctx.store.listCategories();
      res.json({
        data: cats.map((c) => ({
          publicId: c.publicId,
          name: c.name,
          slug: c.slug,
          description: c.description,
          imageUrl: c.imageUrl,
          sortOrder: c.sortOrder,
        })),
      });
    }),
  );

  r.get(
    "/categories/:slug",
    asyncHandler(async (req, res) => {
      const cat = await ctx.store.getCategoryBySlug(req.params.slug);
      if (!cat) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      const products = await ctx.store.listProducts({ categorySlug: cat.slug });
      const data = [];
      for (const p of products) {
        data.push({
          publicId: p.publicId,
          slug: p.slug,
          name: p.name,
          platform: p.platform,
          region: p.region,
          faceValue: p.faceValue,
          faceCurrency: p.faceCurrency,
          saleAmountMinor: p.saleAmountMinor,
          saleCurrency: p.saleCurrency,
          stockLabel: await ctx.store.stockLabelFor(p),
          categorySlug: cat.slug,
        });
      }
      res.json({ data: { category: cat, products: data } });
    }),
  );

  r.get(
    "/products",
    asyncHandler(async (req, res) => {
      const products = await ctx.store.listProducts({
        categorySlug: typeof req.query.category === "string" ? req.query.category : undefined,
        q: typeof req.query.q === "string" ? req.query.q : undefined,
      });
      const cats = await ctx.store.listCategories();
      const catMap = new Map(cats.map((c) => [c.id, c.slug]));
      const data = [];
      for (const p of products) {
        data.push({
          publicId: p.publicId,
          slug: p.slug,
          name: p.name,
          platform: p.platform,
          region: p.region,
          faceValue: p.faceValue,
          faceCurrency: p.faceCurrency,
          saleAmountMinor: p.saleAmountMinor,
          saleCurrency: p.saleCurrency,
          description: p.description,
          instructions: p.instructions,
          imageUrl: p.imageUrl,
          stockLabel: await ctx.store.stockLabelFor(p),
          categorySlug: catMap.get(p.categoryId) ?? "",
        });
      }
      res.json({ data });
    }),
  );

  r.get(
    "/products/:slug",
    asyncHandler(async (req, res) => {
      const p = await ctx.store.getProductBySlug(req.params.slug);
      if (!p) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      const cats = await ctx.store.listCategories();
      const cat = cats.find((c) => c.id === p.categoryId);
      res.json({
        data: {
          publicId: p.publicId,
          slug: p.slug,
          name: p.name,
          platform: p.platform,
          region: p.region,
          faceValue: p.faceValue,
          faceCurrency: p.faceCurrency,
          saleAmountMinor: p.saleAmountMinor,
          saleCurrency: p.saleCurrency,
          description: p.description,
          instructions: p.instructions,
          imageUrl: p.imageUrl,
          stockLabel: await ctx.store.stockLabelFor(p),
          categorySlug: cat?.slug ?? "",
        },
      });
    }),
  );

  r.post(
    "/cart/validate",
    asyncHandler(async (req, res) => {
      const body = cartValidateSchema.parse(req.body);
      const result = await validateCart(ctx.store, body.items);
      res.json({ data: result });
    }),
  );

  r.post(
    "/checkout/sessions",
    asyncHandler(async (req, res) => {
      const idempotencyKey = req.header("Idempotency-Key");
      if (!idempotencyKey || idempotencyKey.length < 8) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: { code: "IDEMPOTENCY_KEY_REQUIRED" } });
        return;
      }
      const body = checkoutCreateSchema.parse(req.body);
      try {
        const result = await createCheckout({
          store: ctx.store,
          provider: ctx.provider,
          env: ctx.env,
          input: body,
          idempotencyKey,
          userId: getUserId(req),
        });
        res.status(HTTP_STATUS.CREATED).json({ data: result });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "INSUFFICIENT_STOCK") {
          res.status(HTTP_STATUS.CONFLICT).json({ error: { code } });
          return;
        }
        throw err;
      }
    }),
  );

  r.get(
    "/orders/:publicRef/status",
    asyncHandler(async (req, res) => {
      const order = await ctx.store.getOrderByPublicRef(req.params.publicRef);
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

  r.post(
    "/guest/orders/lookup",
    asyncHandler(async (req, res) => {
      const body = guestLookupSchema.parse(req.body);
      const result = await issueGuestAccessToken(
        ctx.store,
        ctx.env,
        body.publicReference,
        body.email,
      );
      res.json({ data: result });
    }),
  );

  r.post(
    "/guest/orders/verify",
    asyncHandler(async (req, res) => {
      const body = guestVerifySchema.parse(req.body);
      const order = await ctx.store.getOrderByPublicRef(body.publicReference);
      if (!order || order.customerEmail.toLowerCase() !== body.email.toLowerCase()) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: { code: "INVALID_TOKEN" } });
        return;
      }
      const tokenHash = hashToken(body.token, ctx.env.GUEST_TOKEN_PEPPER);
      const row = await ctx.store.findGuestToken(tokenHash);
      if (!row || row.orderId !== order.id || row.expiresAt < new Date()) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: { code: "INVALID_TOKEN" } });
        return;
      }
      await ctx.store.markGuestTokenUsed(row.id);
      res.json({
        data: {
          accessToken: body.token,
          publicReference: order.publicReference,
          status: order.status,
        },
      });
    }),
  );

  r.get(
    "/guest/orders/:publicRef/codes",
    asyncHandler(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      const token = req.header("X-Guest-Access-Token");
      if (!token) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: { code: "UNAUTHORIZED" } });
        return;
      }
      const order = await ctx.store.getOrderByPublicRef(req.params.publicRef);
      if (!order) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      const tokenHash = hashToken(token, ctx.env.GUEST_TOKEN_PEPPER);
      const row = await ctx.store.findGuestToken(tokenHash);
      if (!row || row.orderId !== order.id) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: { code: "UNAUTHORIZED" } });
        return;
      }
      if (order.status !== "fulfilled") {
        res.status(HTTP_STATUS.CONFLICT).json({ error: { code: "NOT_FULFILLED" } });
        return;
      }
      const codes = await revealOrderCodes({ store: ctx.store, env: ctx.env, orderId: order.id });
      res.json({
        data: {
          publicReference: order.publicReference,
          codes: codes.map((c) => ({
            fulfilmentId: c.fulfilmentId,
            payload: c.secret,
          })),
        },
      });
    }),
  );

  r.get(
    "/me",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: { code: "UNAUTHORIZED" } });
        return;
      }
      const profile = await ctx.store.getProfile(userId);
      res.json({ data: profile });
    }),
  );

  r.patch(
    "/me",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: { code: "UNAUTHORIZED" } });
        return;
      }
      const body = profileUpdateSchema.parse(req.body);
      const existing = (await ctx.store.getProfile(userId)) ?? {
        id: userId,
        fullName: null,
        email: null,
        phoneE164: null,
      };
      const next = {
        ...existing,
        fullName: body.fullName ?? existing.fullName,
        phoneE164: body.phoneE164 ?? existing.phoneE164,
      };
      await ctx.store.upsertProfile(next);
      res.json({ data: next });
    }),
  );

  r.get(
    "/me/orders",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: { code: "UNAUTHORIZED" } });
        return;
      }
      const orders = await ctx.store.listOrdersForUser(userId);
      res.json({
        data: orders.map((o) => ({
          publicReference: o.publicReference,
          status: o.status,
          totalAmountMinor: o.totalAmountMinor,
          currency: o.currency,
          createdAt: o.createdAt,
        })),
      });
    }),
  );

  r.get(
    "/me/orders/:publicRef/codes",
    asyncHandler(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      const userId = getUserId(req);
      if (!userId) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: { code: "UNAUTHORIZED" } });
        return;
      }
      const order = await ctx.store.getOrderByPublicRef(req.params.publicRef);
      if (!order || order.userId !== userId) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      if (order.status !== "fulfilled") {
        res.status(HTTP_STATUS.CONFLICT).json({ error: { code: "NOT_FULFILLED" } });
        return;
      }
      const codes = await revealOrderCodes({ store: ctx.store, env: ctx.env, orderId: order.id });
      res.json({
        data: {
          codes: codes.map((c) => ({ fulfilmentId: c.fulfilmentId, payload: c.secret })),
        },
      });
    }),
  );

  // Admin
  async function requireAdmin(req: Request, res: Response): Promise<boolean> {
    const userId = getUserId(req);
    if (!userId || !(await ctx.store.isAdmin(userId))) {
      // Dev convenience: header X-Admin-Dev: true when not production
      if (ctx.env.NODE_ENV !== "production" && req.header("X-Admin-Dev") === "true") {
        return true;
      }
      res.status(HTTP_STATUS.FORBIDDEN).json({ error: { code: "FORBIDDEN" } });
      return false;
    }
    return true;
  }

  r.post(
    "/admin/categories",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) return;
      const body = adminCategorySchema.parse(req.body);
      const row = {
        id: randomUUID(),
        publicId: generatePublicId("cat"),
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
      };
      await ctx.store.adminUpsertCategory(row);
      await ctx.store.writeAudit({
        id: randomUUID(),
        actorType: "admin",
        actorId: getUserId(req),
        action: "category.create",
        targetType: "category",
        targetId: row.publicId,
        metadataRedacted: { slug: row.slug },
        createdAt: new Date(),
      });
      res.status(HTTP_STATUS.CREATED).json({ data: { publicId: row.publicId, slug: row.slug } });
    }),
  );

  r.post(
    "/admin/products",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) return;
      const body = adminProductSchema.parse(req.body);
      const cats = await ctx.store.listCategories();
      const cat = cats.find((c) => c.publicId === body.categoryPublicId);
      if (!cat) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: { code: "CATEGORY_NOT_FOUND" } });
        return;
      }
      const row = {
        id: randomUUID(),
        publicId: generatePublicId("prd"),
        categoryId: cat.id,
        name: body.name,
        slug: body.slug,
        platform: body.platform,
        region: body.region,
        faceValue: body.faceValue,
        faceCurrency: body.faceCurrency,
        saleAmountMinor: body.saleAmountMinor,
        saleCurrency: "XOF" as const,
        description: body.description ?? null,
        instructions: body.instructions ?? null,
        imageUrl: body.imageUrl ?? null,
        isActive: body.isActive ?? true,
        lowStockThreshold: body.lowStockThreshold ?? 5,
      };
      await ctx.store.adminUpsertProduct(row);
      res.status(HTTP_STATUS.CREATED).json({ data: { publicId: row.publicId, slug: row.slug } });
    }),
  );

  r.post(
    "/admin/inventory/upload",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) return;
      const productPublicId = String(req.body.productPublicId ?? "");
      const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
      if (rows.length > 5000) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: { code: "TOO_MANY_ROWS" } });
        return;
      }
      const product = await ctx.store.getProductByPublicId(productPublicId);
      if (!product) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: { code: "PRODUCT_NOT_FOUND" } });
        return;
      }
      const batchId = randomUUID();
      const invRows = [];
      for (const raw of rows) {
        const code = raw.code ? normalizeCode(String(raw.code)) : undefined;
        const serial = raw.serial ? normalizeCode(String(raw.serial)) : undefined;
        const pin = raw.pin ? String(raw.pin).trim() : undefined;
        const secret = code ? { code } : { serial, pin };
        const fingerprintSource = code ?? `${serial}:${pin}`;
        if (!fingerprintSource) continue;
        const enc = encryptCardSecret(secret, ctx.env.CODE_ENCRYPTION_KEY_v1, 1);
        invRows.push({
          id: randomUUID(),
          productId: product.id,
          batchId,
          encryptedPayload: enc.ciphertext,
          encryptionIv: enc.iv,
          authenticationTag: enc.authTag,
          encryptionKeyVersion: 1,
          codeFingerprint: fingerprintCode(fingerprintSource, ctx.env.CODE_FINGERPRINT_PEPPER),
          maskedCode: maskCode(code ?? serial ?? "****"),
          status: "available" as const,
          reservedOrderId: null,
          reservedUntil: null,
          soldOrderItemId: null,
        });
      }
      const result = await ctx.store.adminAddInventory(invRows, batchId, product.id, getUserId(req));
      await ctx.store.writeAudit({
        id: randomUUID(),
        actorType: "admin",
        actorId: getUserId(req),
        action: "inventory.upload",
        targetType: "product",
        targetId: product.publicId,
        metadataRedacted: { accepted: result.accepted, rejected: result.rejected },
        createdAt: new Date(),
      });
      res.json({ data: result });
    }),
  );

  r.get(
    "/admin/orders",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) return;
      const orders = await ctx.store.listAllOrders(100);
      res.json({
        data: orders.map((o) => ({
          publicReference: o.publicReference,
          status: o.status,
          totalAmountMinor: o.totalAmountMinor,
          customerEmail: o.customerEmail.replace(/(.{2}).+(@.+)/, "$1***$2"),
          createdAt: o.createdAt,
        })),
      });
    }),
  );

  r.get(
    "/admin/audit-logs",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) return;
      res.json({ data: await ctx.store.listAuditLogs(100) });
    }),
  );

  r.post(
    "/admin/orders/reveal",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) return;
      res.setHeader("Cache-Control", "no-store");
      const body = adminRevealSchema.parse(req.body);
      const inv = await ctx.store.getInventory(body.inventoryId);
      if (!inv) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      const { decryptCardSecret } = await import("@repo/shared");
      const secret = decryptCardSecret(
        {
          ciphertext: inv.encryptedPayload,
          iv: inv.encryptionIv,
          authTag: inv.authenticationTag,
          keyVersion: inv.encryptionKeyVersion,
        },
        ctx.env.CODE_ENCRYPTION_KEY_v1,
      );
      await ctx.store.writeAudit({
        id: randomUUID(),
        actorType: "admin",
        actorId: getUserId(req),
        action: "inventory.reveal",
        targetType: "inventory",
        targetId: inv.id,
        metadataRedacted: { reason: body.reason, masked: inv.maskedCode },
        createdAt: new Date(),
      });
      res.json({ data: { payload: secret, maskedCode: inv.maskedCode } });
    }),
  );

  r.post(
    "/admin/refunds",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) return;
      const body = adminRefundSchema.parse(req.body);
      const order = await ctx.store.getOrderByPublicRef(body.orderPublicReference);
      if (!order) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      if (order.status === "fulfilled") {
        const fulfilments = await ctx.store.listFulfilments(order.id);
        const revealed = fulfilments.some((f) => f.revealCount > 0);
        if (revealed) {
          res.status(HTTP_STATUS.CONFLICT).json({ error: { code: "ALREADY_REVEALED" } });
          return;
        }
      }
      await ctx.store.updateOrderStatus(order.id, "refund_pending");
      const payment = await ctx.store.getPaymentByOrderId(order.id);
      if (payment) {
        await ctx.provider.refundCheckoutSession(payment.providerCheckoutSessionId);
      }
      await ctx.store.updateOrderStatus(order.id, "refunded");
      await ctx.store.writeAudit({
        id: randomUUID(),
        actorType: "admin",
        actorId: getUserId(req),
        action: "order.refund",
        targetType: "order",
        targetId: order.publicReference,
        metadataRedacted: { reason: body.reason },
        createdAt: new Date(),
      });
      res.json({ data: { status: "refunded" } });
    }),
  );

  // Dev/test: complete fake payment
  r.post(
    "/dev/complete-payment",
    asyncHandler(async (req, res) => {
      if (ctx.env.NODE_ENV === "production") {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      const sessionId = String(req.body.sessionId ?? "");
      const transactionId = String(req.body.transactionId ?? `TXN_${randomUUID().slice(0, 8)}`);
      if (ctx.provider.completeSessionForTest) {
        await ctx.provider.completeSessionForTest(sessionId, transactionId);
      }
      await processWaveCompletedEvent({
        store: ctx.store,
        provider: ctx.provider,
        env: ctx.env,
        sessionId,
        eventId: `evt_${randomUUID()}`,
      });
      // Process immediately in memory mode
      await runFulfilCheckoutJob({
        store: ctx.store,
        provider: ctx.provider,
        env: ctx.env,
        sessionId,
      });
      res.json({ data: { ok: true, transactionId } });
    }),
  );

  app.use("/api/v1", r);

  // Wave webhook with raw body
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
      const secrets = [ctx.env.WAVE_WEBHOOK_SECRET].filter(Boolean) as string[];

      // In fake/dev mode without secret, accept only when PAYMENT_PROVIDER=fake
      let valid = false;
      if (secrets.length > 0) {
        valid = verifyWaveSignatureHeader(signature, rawBody, secrets);
      } else if (ctx.env.PAYMENT_PROVIDER === "fake" && ctx.env.NODE_ENV !== "production") {
        valid = true;
      }

      if (!valid) {
        logger.warn("webhook_signature_invalid");
        res.status(HTTP_STATUS.FORBIDDEN).json({ error: { code: "INVALID_SIGNATURE" } });
        return;
      }

      // ACK quickly
      res.status(HTTP_STATUS.OK).json({ received: true });

      try {
        const payload = JSON.parse(rawBody) as {
          id: string;
          type: string;
          data: { id: string };
        };
        if (payload.type === "checkout.session.completed") {
          await processWaveCompletedEvent({
            store: ctx.store,
            provider: ctx.provider,
            env: ctx.env,
            sessionId: payload.data.id,
            eventId: payload.id,
          });
        }
      } catch (err) {
        logger.error("webhook_process_enqueue_failed", {
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }),
  );
}

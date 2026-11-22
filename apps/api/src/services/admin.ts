import { randomUUID } from "node:crypto";
import { encryptCardSecret, fingerprintCode, maskCode, normalizeCode, type OrderStatus } from "@repo/shared";
import type { Env } from "../config/env.js";
import { withTransaction, type Pool } from "../db/pool.js";
import { advanceOrder, ensureProfile, SELLABLE } from "../db/postgres-store.js";
import type { InventoryRow, Store } from "../db/store.js";
import { generatePublicId } from "../lib/ids.js";
import { logger } from "../lib/logger.js";
import { sendOrderLinkEmail } from "./order-access.js";

/**
 * Phase 8 admin operations. These run against Postgres directly; the admin
 * area is unavailable on the in-memory store. Codes are only ever returned
 * masked here — admins never see a full code through the API.
 */

export type AdminCtx = { pool: Pool; store: Store; env: Env };

export class AdminError extends Error {
  constructor(
    public code: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

const MAX_CODES_PER_UPLOAD = 500;

async function audit(
  ctx: AdminCtx,
  adminId: string,
  action: string,
  target: { type: string; id: string | null },
  metadata: Record<string, unknown>,
) {
  await ctx.store.writeAudit({
    id: randomUUID(),
    actorType: "admin",
    actorId: adminId,
    action,
    targetType: target.type,
    targetId: target.id,
    metadataRedacted: metadata,
    createdAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getSummary(ctx: AdminCtx) {
  const { rows } = await ctx.pool.query(`
    SELECT
      (SELECT count(*) FROM public.orders
        WHERE created_at >= date_trunc('day', now())
          AND status IN ('paid', 'fulfilled', 'manual_review')) AS orders_today,
      (SELECT coalesce(sum(total_amount_minor), 0) FROM public.orders
        WHERE paid_at >= date_trunc('day', now()) AND status IN ('paid', 'fulfilled')) AS revenue_today,
      (SELECT coalesce(sum(total_amount_minor), 0) FROM public.orders
        WHERE paid_at >= now() - interval '30 days' AND status IN ('paid', 'fulfilled')) AS revenue_30d,
      (SELECT count(*) FROM public.orders WHERE status = 'manual_review') AS manual_review,
      (SELECT count(*) FROM public.orders WHERE status = 'refund_pending') AS refund_pending
  `);
  const r = rows[0];
  const products = await listProducts(ctx);
  const lowStock = products.filter((p) => p.isActive && p.stock.available <= p.lowStockThreshold);
  return {
    ordersToday: Number(r.orders_today),
    revenueTodayMinor: Number(r.revenue_today),
    revenue30dMinor: Number(r.revenue_30d),
    manualReview: Number(r.manual_review),
    refundPending: Number(r.refund_pending),
    lowStock: lowStock.map((p) => ({
      publicId: p.publicId,
      name: p.name,
      available: p.stock.available,
      threshold: p.lowStockThreshold,
    })),
  };
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function listCategories(ctx: AdminCtx) {
  const { rows } = await ctx.pool.query(
    `SELECT id, name, slug FROM public.categories ORDER BY sort_order, name`,
  );
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, slug: r.slug as string }));
}

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name,
    count(ci.id) FILTER (WHERE ${SELLABLE}) AS stock_available,
    count(ci.id) FILTER (WHERE ci.status = 'reserved' AND ci.reserved_until >= now()) AS stock_reserved,
    count(ci.id) FILTER (WHERE ci.status = 'sold') AS stock_sold,
    count(ci.id) FILTER (WHERE ci.status = 'disabled') AS stock_disabled
  FROM public.products p
  JOIN public.categories c ON c.id = p.category_id
  LEFT JOIN public.card_inventory ci ON ci.product_id = p.id`;

function toAdminProduct(r: Record<string, any>) {
  return {
    id: r.id as string,
    publicId: r.public_id as string,
    name: r.name as string,
    slug: r.slug as string,
    categoryId: r.category_id as string,
    categoryName: r.category_name as string,
    platform: r.platform as string,
    region: r.region as string,
    faceValue: String(Number(r.face_value)),
    faceCurrency: String(r.face_currency).trim(),
    saleAmountMinor: Number(r.sale_amount_minor),
    description: (r.description as string | null) ?? null,
    instructions: (r.instructions as string | null) ?? null,
    isActive: Boolean(r.is_active),
    lowStockThreshold: Number(r.low_stock_threshold),
    stock: {
      available: Number(r.stock_available),
      reserved: Number(r.stock_reserved),
      sold: Number(r.stock_sold),
      disabled: Number(r.stock_disabled),
    },
  };
}

export type AdminProduct = ReturnType<typeof toAdminProduct>;

export async function listProducts(ctx: AdminCtx): Promise<AdminProduct[]> {
  const { rows } = await ctx.pool.query(
    `${PRODUCT_SELECT} GROUP BY p.id, c.name, c.sort_order ORDER BY c.sort_order, p.sale_amount_minor, p.name`,
  );
  return rows.map(toAdminProduct);
}

export async function getProduct(ctx: AdminCtx, publicId: string): Promise<AdminProduct> {
  const { rows } = await ctx.pool.query(`${PRODUCT_SELECT} WHERE p.public_id = $1 GROUP BY p.id, c.name`, [publicId]);
  if (!rows[0]) throw new AdminError("NOT_FOUND", 404);
  return toAdminProduct(rows[0]);
}

export type ProductInput = {
  name: string;
  categoryId: string;
  platform: string;
  region: string;
  faceValue: string;
  faceCurrency: string;
  saleAmountMinor: number;
  description: string | null;
  instructions: string | null;
  isActive: boolean;
  lowStockThreshold: number;
};

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "produit"
  );
}

async function assertCategory(ctx: AdminCtx, categoryId: string) {
  const { rows } = await ctx.pool.query(`SELECT 1 FROM public.categories WHERE id = $1`, [categoryId]);
  if (!rows[0]) throw new AdminError("CATEGORY_NOT_FOUND", 400);
}

export async function createProduct(ctx: AdminCtx, adminId: string, input: ProductInput) {
  await assertCategory(ctx, input.categoryId);
  const base = slugify(input.name);
  const { rows: taken } = await ctx.pool.query(
    `SELECT slug FROM public.products WHERE slug = $1 OR slug LIKE $1 || '-%'`,
    [base],
  );
  const used = new Set(taken.map((r) => r.slug as string));
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;

  const publicId = generatePublicId("prd");
  await ctx.pool.query(
    `INSERT INTO public.products (
       public_id, category_id, name, slug, platform, region, face_value, face_currency,
       sale_amount_minor, description, instructions, is_active, low_stock_threshold
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      publicId,
      input.categoryId,
      input.name,
      slug,
      input.platform,
      input.region,
      input.faceValue,
      input.faceCurrency,
      input.saleAmountMinor,
      input.description,
      input.instructions,
      input.isActive,
      input.lowStockThreshold,
    ],
  );
  const product = await getProduct(ctx, publicId);
  await audit(ctx, adminId, "product.created", { type: "product", id: product.id }, {
    name: product.name,
    priceMinor: product.saleAmountMinor,
  });
  return product;
}

export async function updateProduct(ctx: AdminCtx, adminId: string, publicId: string, input: Partial<ProductInput>) {
  const before = await getProduct(ctx, publicId);
  if (input.categoryId && input.categoryId !== before.categoryId) await assertCategory(ctx, input.categoryId);
  const next = { ...before, ...input };

  await ctx.pool.query(
    `UPDATE public.products SET
       category_id = $2, name = $3, platform = $4, region = $5, face_value = $6, face_currency = $7,
       sale_amount_minor = $8, description = $9, instructions = $10, is_active = $11, low_stock_threshold = $12
     WHERE id = $1`,
    [
      before.id,
      next.categoryId,
      next.name,
      next.platform,
      next.region,
      next.faceValue,
      next.faceCurrency,
      next.saleAmountMinor,
      next.description,
      next.instructions,
      next.isActive,
      next.lowStockThreshold,
    ],
  );

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(input) as (keyof ProductInput)[]) {
    if (key === "description" || key === "instructions") {
      if (before[key] !== next[key]) changes[key] = { from: "…", to: "…" };
      continue;
    }
    if (String(before[key]) !== String(next[key])) changes[key] = { from: before[key], to: next[key] };
  }
  if (Object.keys(changes).length > 0) {
    await audit(ctx, adminId, "product.updated", { type: "product", id: before.id }, {
      name: next.name,
      changes,
    });
  }
  return getProduct(ctx, publicId);
}

// ---------------------------------------------------------------------------
// Codes (inventory)
// ---------------------------------------------------------------------------

export async function listInventory(ctx: AdminCtx, publicId: string) {
  const product = await getProduct(ctx, publicId);
  const { rows } = await ctx.pool.query(
    `SELECT ci.id, ci.masked_code, ci.created_at,
       CASE WHEN ${SELLABLE} THEN 'available' ELSE ci.status::text END AS status,
       o.public_reference AS order_reference
     FROM public.card_inventory ci
     LEFT JOIN public.order_items oi ON oi.id = ci.sold_order_item_id
     LEFT JOIN public.orders o ON o.id = coalesce(oi.order_id, ci.reserved_order_id)
     WHERE ci.product_id = $1
     ORDER BY
       CASE WHEN ${SELLABLE} THEN 0 WHEN ci.status = 'reserved' THEN 1 WHEN ci.status = 'disabled' THEN 2 ELSE 3 END,
       ci.created_at DESC
     LIMIT 500`,
    [product.id],
  );
  return {
    product,
    codes: rows.map((r) => ({
      id: r.id as string,
      maskedCode: r.masked_code as string,
      status: r.status as string,
      orderReference: r.status === "available" ? null : ((r.order_reference as string | null) ?? null),
      createdAt: (r.created_at as Date).toISOString(),
    })),
  };
}

/** Splits pasted text (one code per line, commas/semicolons also accepted) into normalised codes. */
export function parseCodes(text: string): { codes: string[]; duplicatesInInput: number; invalid: number } {
  const seen = new Set<string>();
  let duplicatesInInput = 0;
  let invalid = 0;
  for (const raw of text.split(/[\r\n,;]+/)) {
    if (!raw.trim()) continue;
    const code = normalizeCode(raw);
    if (code.length < 4 || code.length > 128) {
      invalid++;
      continue;
    }
    if (seen.has(code)) {
      duplicatesInInput++;
      continue;
    }
    seen.add(code);
  }
  return { codes: [...seen], duplicatesInInput, invalid };
}

export async function addCodes(ctx: AdminCtx, adminId: string, publicId: string, text: string) {
  const product = await getProduct(ctx, publicId);
  const parsed = parseCodes(text);
  if (parsed.codes.length === 0) throw new AdminError("NO_CODES", 400);
  if (parsed.codes.length > MAX_CODES_PER_UPLOAD) {
    throw new AdminError("TOO_MANY_CODES", 400, { max: MAX_CODES_PER_UPLOAD });
  }

  const rows: InventoryRow[] = parsed.codes.map((code) => {
    const enc = encryptCardSecret({ code }, ctx.env.CODE_ENCRYPTION_KEY_v1, 1);
    return {
      id: randomUUID(),
      productId: product.id,
      batchId: null,
      encryptedPayload: enc.ciphertext,
      encryptionIv: enc.iv,
      authenticationTag: enc.authTag,
      encryptionKeyVersion: 1,
      codeFingerprint: fingerprintCode(code, ctx.env.CODE_FINGERPRINT_PEPPER),
      maskedCode: maskCode(code),
      status: "available",
      reservedOrderId: null,
      reservedUntil: null,
      soldOrderItemId: null,
    };
  });
  const result = await ctx.store.adminAddInventory(rows, randomUUID(), product.id, adminId);
  const summary = {
    added: result.accepted,
    alreadyInStock: result.rejected,
    duplicatesInInput: parsed.duplicatesInInput,
    invalid: parsed.invalid,
  };
  await audit(ctx, adminId, "inventory.added", { type: "product", id: product.id }, { name: product.name, ...summary });
  return summary;
}

export async function setCodeDisabled(ctx: AdminCtx, adminId: string, inventoryId: string, disabled: boolean) {
  const { rows } = disabled
    ? await ctx.pool.query(
        `UPDATE public.card_inventory ci
         SET status = 'disabled', reserved_order_id = NULL, reserved_until = NULL
         WHERE ci.id = $1 AND ${SELLABLE}
         RETURNING ci.product_id, ci.masked_code`,
        [inventoryId],
      )
    : await ctx.pool.query(
        `UPDATE public.card_inventory SET status = 'available'
         WHERE id = $1 AND status = 'disabled'
         RETURNING product_id, masked_code`,
        [inventoryId],
      );
  if (!rows[0]) throw new AdminError("CODE_NOT_CHANGEABLE", 409);
  await audit(
    ctx,
    adminId,
    disabled ? "inventory.disabled" : "inventory.enabled",
    { type: "card_inventory", id: inventoryId },
    { maskedCode: rows[0].masked_code },
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function toOrderSummary(r: Record<string, any>) {
  return {
    publicReference: r.public_reference as string,
    status: r.status as OrderStatus,
    customerFullName: r.customer_full_name as string,
    customerEmail: r.customer_email as string,
    totalAmountMinor: Number(r.total_amount_minor),
    hasAccount: r.user_id !== null,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export async function searchOrders(ctx: AdminCtx, q: string | undefined, status: OrderStatus | undefined) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(public_reference ILIKE $${params.length} OR customer_email ILIKE $${params.length}
                 OR customer_full_name ILIKE $${params.length} OR customer_phone_e164 ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}::public.order_status`);
  }
  const { rows } = await ctx.pool.query(
    `SELECT * FROM public.orders ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC LIMIT 100`,
    params,
  );
  return rows.map(toOrderSummary);
}

async function findOrder(ctx: AdminCtx, publicReference: string) {
  const order = await ctx.store.getOrderByPublicRef(publicReference);
  if (!order) throw new AdminError("NOT_FOUND", 404);
  return order;
}

export async function getOrder(ctx: AdminCtx, publicReference: string) {
  const order = await findOrder(ctx, publicReference);
  const [items, payment, codes, history] = await Promise.all([
    ctx.store.listOrderItems(order.id),
    ctx.store.getPaymentByOrderId(order.id),
    ctx.pool.query(
      `SELECT f.reveal_count, f.first_revealed_at, ci.masked_code, oi.product_name
       FROM public.fulfilments f
       JOIN public.card_inventory ci ON ci.id = f.inventory_id
       JOIN public.order_items oi ON oi.id = f.order_item_id
       WHERE f.order_id = $1 ORDER BY oi.product_name, ci.masked_code`,
      [order.id],
    ),
    ctx.pool.query(
      `SELECT a.action, a.actor_type, a.created_at, a.metadata, p.email AS actor_email
       FROM public.audit_logs a LEFT JOIN public.profiles p ON p.id = a.actor_id
       WHERE a.target_id = $1 ORDER BY a.created_at DESC LIMIT 50`,
      [order.id],
    ),
  ]);
  return {
    order: {
      ...toOrderSummary({
        public_reference: order.publicReference,
        status: order.status,
        customer_full_name: order.customerFullName,
        customer_email: order.customerEmail,
        total_amount_minor: order.totalAmountMinor,
        user_id: order.userId,
        created_at: order.createdAt,
      }),
      customerPhone: order.customerPhoneE164,
      paidAt: order.paidAt?.toISOString() ?? null,
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
    },
    items: items.map((i) => ({
      name: i.productName,
      quantity: i.quantity,
      unitAmountMinor: i.unitAmountMinor,
      totalAmountMinor: i.totalAmountMinor,
    })),
    payment: payment
      ? {
          provider: payment.provider,
          status: payment.status,
          transactionId: payment.providerTransactionId,
          amountMinor: payment.expectedAmountMinor,
        }
      : null,
    codes: codes.rows.map((r) => ({
      productName: r.product_name as string,
      maskedCode: r.masked_code as string,
      revealCount: Number(r.reveal_count),
      firstRevealedAt: r.first_revealed_at ? (r.first_revealed_at as Date).toISOString() : null,
    })),
    history: history.rows.map((r) => ({
      action: r.action as string,
      actorType: r.actor_type as string,
      actorEmail: (r.actor_email as string | null) ?? null,
      metadata: r.metadata as Record<string, unknown>,
      createdAt: (r.created_at as Date).toISOString(),
    })),
  };
}

/**
 * Delivers a manual-review order once stock is back: reuses codes still
 * reserved for it, reserves what is missing, then marks the order fulfilled.
 */
export async function retryFulfilment(ctx: AdminCtx, adminId: string, publicReference: string) {
  const order = await findOrder(ctx, publicReference);
  await withTransaction(ctx.pool, async (db) => {
    const { rows: locked } = await db.query(`SELECT status FROM public.orders WHERE id = $1 FOR UPDATE`, [order.id]);
    if (locked[0]?.status !== "manual_review") throw new AdminError("ORDER_NOT_IN_REVIEW", 409);

    const { rows: items } = await db.query(
      `SELECT id, product_id, product_name, quantity FROM public.order_items WHERE order_id = $1 ORDER BY created_at, id`,
      [order.id],
    );
    const missing: string[] = [];
    const plan: { itemId: string; inventoryIds: string[] }[] = [];
    for (const item of items) {
      const { rows: mine } = await db.query(
        `SELECT id FROM public.card_inventory
         WHERE reserved_order_id = $1 AND product_id = $2 AND status = 'reserved'
         ORDER BY created_at, id LIMIT $3 FOR UPDATE`,
        [order.id, item.product_id, item.quantity],
      );
      const ids = mine.map((r) => r.id as string);
      if (ids.length < item.quantity) {
        const { rows: extra } = await db.query(
          `SELECT ci.id FROM public.card_inventory ci
           WHERE ci.product_id = $1 AND ${SELLABLE} AND ci.id <> ALL($3::uuid[])
           ORDER BY ci.created_at, ci.id LIMIT $2 FOR UPDATE SKIP LOCKED`,
          [item.product_id, item.quantity - ids.length, ids],
        );
        ids.push(...extra.map((r) => r.id as string));
      }
      if (ids.length < item.quantity) missing.push(item.product_name as string);
      plan.push({ itemId: item.id as string, inventoryIds: ids });
    }
    if (missing.length > 0) throw new AdminError("INSUFFICIENT_STOCK", 409, { products: missing });

    for (const { itemId, inventoryIds } of plan) {
      for (const inventoryId of inventoryIds) {
        await db.query(
          `UPDATE public.card_inventory
           SET status = 'sold', sold_order_item_id = $2, reserved_order_id = NULL, reserved_until = NULL
           WHERE id = $1`,
          [inventoryId, itemId],
        );
        await db.query(
          `INSERT INTO public.fulfilments (id, order_id, order_item_id, inventory_id, delivered_at)
           VALUES ($1, $2, $3, $4, now())`,
          [randomUUID(), order.id, itemId, inventoryId],
        );
      }
    }
    await db.query(
      `UPDATE public.card_inventory SET status = 'available', reserved_order_id = NULL, reserved_until = NULL
       WHERE reserved_order_id = $1 AND status = 'reserved'`,
      [order.id],
    );
    await advanceOrder(db, order.id, ["fulfilled"]);
  });

  await ctx.store.enqueueOutbox({
    id: randomUUID(),
    jobType: "notify_order_fulfilled",
    payload: { orderId: order.id, publicReference: order.publicReference },
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    availableAt: new Date(),
    lastError: null,
  });
  await audit(ctx, adminId, "order.fulfilled_by_admin", { type: "order", id: order.id }, {
    publicReference: order.publicReference,
  });
}

export async function resendOrderLink(ctx: AdminCtx, adminId: string, publicReference: string) {
  const order = await findOrder(ctx, publicReference);
  await sendOrderLinkEmail(ctx.store, ctx.env, order.id);
  await audit(ctx, adminId, "order.link_resent", { type: "order", id: order.id }, {
    publicReference: order.publicReference,
  });
}

/**
 * Records a refund in two steps (started, then money sent back). Money is
 * returned outside the app for now; this only tracks it.
 */
export async function recordRefund(
  ctx: AdminCtx,
  adminId: string,
  publicReference: string,
  step: "start" | "complete",
  note: string,
) {
  const order = await findOrder(ctx, publicReference);
  const allowedFrom: OrderStatus[] =
    step === "start" ? ["paid", "fulfilled", "manual_review"] : ["refund_pending"];
  if (!allowedFrom.includes(order.status)) throw new AdminError("INVALID_ORDER_STATUS", 409);

  await withTransaction(ctx.pool, async (db) => {
    await ensureProfile(db, adminId);
    if (step === "start") {
      await db.query(
        `UPDATE public.card_inventory SET status = 'available', reserved_order_id = NULL, reserved_until = NULL
         WHERE reserved_order_id = $1 AND status = 'reserved'`,
        [order.id],
      );
    }
    await advanceOrder(db, order.id, [step === "start" ? "refund_pending" : "refunded"]);
  });
  await audit(
    ctx,
    adminId,
    step === "start" ? "order.refund_started" : "order.refunded",
    { type: "order", id: order.id },
    { publicReference: order.publicReference, note },
  );
  logger.info("admin_refund_recorded", { orderId: order.id, step });
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export async function listActivity(ctx: AdminCtx, opts: { adminOnly: boolean; limit: number }) {
  const { rows } = await ctx.pool.query(
    `SELECT a.id, a.action, a.actor_type, a.target_type, a.created_at, a.metadata, p.email AS actor_email
     FROM public.audit_logs a LEFT JOIN public.profiles p ON p.id = a.actor_id
     ${opts.adminOnly ? `WHERE a.actor_type = 'admin'` : ""}
     ORDER BY a.created_at DESC LIMIT $1`,
    [opts.limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    action: r.action as string,
    actorType: r.actor_type as string,
    actorEmail: (r.actor_email as string | null) ?? null,
    targetType: (r.target_type as string | null) ?? null,
    metadata: r.metadata as Record<string, unknown>,
    createdAt: (r.created_at as Date).toISOString(),
  }));
}

import { stockLabel, type OrderStatus, type StockLabel } from "@repo/shared";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "./pool.js";
import { withTransaction } from "./pool.js";
import type {
  AuditLogRow,
  CategoryRow,
  FulfilmentRow,
  GuestTokenRow,
  InventoryRow,
  OrderItemRow,
  OrderRow,
  OutboxJobRow,
  PaymentRow,
  ProductRow,
  ProfileRow,
  Store,
} from "./store.js";

type Row = Record<string, any>;
type Queryable = Pool | PoolClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reservations past `reserved_until` belong to abandoned checkouts and can be resold. */
export const SELLABLE = `(ci.status = 'available' OR (ci.status = 'reserved' AND ci.reserved_until < now()))`;

/** NUMERIC comes back as "10.0000"; the API exposes "10". */
function trimNumeric(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

const toCategory = (r: Row): CategoryRow => ({
  id: r.id,
  publicId: r.public_id,
  name: r.name,
  slug: r.slug,
  description: r.description,
  imageUrl: r.image_url,
  sortOrder: r.sort_order,
  isActive: r.is_active,
});

const toProduct = (r: Row): ProductRow => ({
  id: r.id,
  publicId: r.public_id,
  categoryId: r.category_id,
  name: r.name,
  slug: r.slug,
  platform: r.platform,
  region: r.region,
  faceValue: trimNumeric(r.face_value),
  faceCurrency: r.face_currency,
  saleAmountMinor: r.sale_amount_minor,
  saleCurrency: "XOF",
  description: r.description,
  instructions: r.instructions,
  imageUrl: r.image_url,
  isActive: r.is_active,
  lowStockThreshold: r.low_stock_threshold,
});

const toInventory = (r: Row): InventoryRow => ({
  id: r.id,
  productId: r.product_id,
  batchId: r.batch_id,
  encryptedPayload: r.encrypted_payload,
  encryptionIv: r.encryption_iv,
  authenticationTag: r.authentication_tag,
  encryptionKeyVersion: r.encryption_key_version,
  codeFingerprint: r.code_fingerprint,
  maskedCode: r.masked_code,
  status: r.status,
  reservedOrderId: r.reserved_order_id,
  reservedUntil: r.reserved_until,
  soldOrderItemId: r.sold_order_item_id,
});

const toOrder = (r: Row): OrderRow => ({
  id: r.id,
  publicReference: r.public_reference,
  userId: r.user_id,
  customerFullName: r.customer_full_name ?? "",
  customerEmail: r.customer_email,
  customerPhoneE164: r.customer_phone_e164,
  subtotalAmountMinor: r.subtotal_amount_minor,
  totalAmountMinor: r.total_amount_minor,
  currency: "XOF",
  status: r.status,
  idempotencyKey: r.idempotency_key,
  reservationExpiresAt: r.reservation_expires_at,
  paidAt: r.paid_at,
  fulfilledAt: r.fulfilled_at,
  createdAt: r.created_at,
});

const toOrderItem = (r: Row): OrderItemRow => ({
  id: r.id,
  orderId: r.order_id,
  productId: r.product_id,
  productPublicId: r.product_public_id,
  productName: r.product_name,
  platform: r.platform,
  region: r.region,
  faceValue: trimNumeric(r.face_value),
  faceCurrency: r.face_currency,
  quantity: r.quantity,
  unitAmountMinor: r.unit_amount_minor,
  totalAmountMinor: r.total_amount_minor,
  currency: "XOF",
});

const toPayment = (r: Row): PaymentRow => ({
  id: r.id,
  orderId: r.order_id,
  provider: r.provider,
  providerCheckoutSessionId: r.provider_checkout_session_id,
  providerTransactionId: r.provider_transaction_id,
  clientReference: r.client_reference,
  expectedAmountMinor: r.expected_amount_minor,
  expectedCurrency: "XOF",
  status: r.status,
  whenExpires: r.when_expires,
  waveLaunchUrl: r.wave_launch_url,
});

const toFulfilment = (r: Row): FulfilmentRow => ({
  id: r.id,
  orderId: r.order_id,
  orderItemId: r.order_item_id,
  inventoryId: r.inventory_id,
  deliveredAt: r.delivered_at,
  firstRevealedAt: r.first_revealed_at,
  lastRevealedAt: r.last_revealed_at,
  revealCount: r.reveal_count,
});

const toGuestToken = (r: Row): GuestTokenRow => ({
  id: r.id,
  orderId: r.order_id,
  tokenHash: r.token_hash,
  expiresAt: r.expires_at,
  usedAt: r.used_at,
});

const toOutboxJob = (r: Row): OutboxJobRow => ({
  id: r.id,
  jobType: r.job_type,
  payload: r.payload,
  status: r.status,
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  availableAt: r.available_at,
  lastError: r.last_error,
});

const toProfile = (r: Row): ProfileRow => ({
  id: r.id,
  fullName: r.full_name,
  email: r.email,
  phoneE164: r.phone_e164,
});

const toAudit = (r: Row): AuditLogRow => ({
  id: r.id,
  actorType: r.actor_type,
  actorId: r.actor_id,
  action: r.action,
  targetType: r.target_type,
  targetId: r.target_id,
  metadataRedacted: r.metadata,
  createdAt: r.created_at,
});

async function one<T>(db: Queryable, sql: string, params: unknown[], map: (r: Row) => T): Promise<T | null> {
  const { rows } = await db.query(sql, params);
  return rows[0] ? map(rows[0]) : null;
}

async function many<T>(db: Queryable, sql: string, params: unknown[], map: (r: Row) => T): Promise<T[]> {
  const { rows } = await db.query(sql, params);
  return rows.map(map);
}

/** Every user-linked row references public.profiles; create it from auth.users if missing. */
export async function ensureProfile(db: Queryable, userId: string) {
  await db.query(
    `INSERT INTO public.profiles (id, email)
     SELECT u.id, u.email FROM auth.users u WHERE u.id = $1
     ON CONFLICT (id) DO NOTHING`,
    [userId],
  );
}

/** Moves an order through the transitions allowed by the status trigger. */
export async function advanceOrder(db: Queryable, orderId: string, steps: OrderStatus[]) {
  for (const status of steps) {
    await db.query(
      `UPDATE public.orders SET
         status = $2::public.order_status,
         paid_at = CASE WHEN $2::text IN ('paid', 'manual_review') THEN COALESCE(paid_at, now()) ELSE paid_at END,
         fulfilled_at = CASE WHEN $2::text = 'fulfilled' THEN now() ELSE fulfilled_at END
       WHERE id = $1`,
      [orderId, status],
    );
  }
}

export function createPostgresStore(pool: Pool): Store {
  const store: Store = {
    async listCategories() {
      return many(
        pool,
        `SELECT * FROM public.categories WHERE is_active ORDER BY sort_order, name`,
        [],
        toCategory,
      );
    },

    async getCategoryBySlug(slug) {
      return one(pool, `SELECT * FROM public.categories WHERE slug = $1 AND is_active`, [slug], toCategory);
    },

    async listProducts(filters) {
      const where = ["p.is_active"];
      const params: unknown[] = [];
      if (filters?.categorySlug) {
        params.push(filters.categorySlug);
        where.push(`c.slug = $${params.length}`);
      }
      if (filters?.q) {
        params.push(`%${filters.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
        const i = params.length;
        where.push(`(p.name ILIKE $${i} OR p.platform ILIKE $${i} OR p.region ILIKE $${i})`);
      }
      return many(
        pool,
        `SELECT p.* FROM public.products p
         JOIN public.categories c ON c.id = p.category_id
         WHERE ${where.join(" AND ")}
         ORDER BY c.sort_order, p.face_currency, p.sale_amount_minor`,
        params,
        toProduct,
      );
    },

    async getProductBySlug(slug) {
      return one(pool, `SELECT * FROM public.products WHERE slug = $1 AND is_active`, [slug], toProduct);
    },

    async getProductByPublicId(publicId) {
      return one(pool, `SELECT * FROM public.products WHERE public_id = $1`, [publicId], toProduct);
    },

    async countAvailable(productId) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM public.card_inventory ci WHERE ci.product_id = $1 AND ${SELLABLE}`,
        [productId],
      );
      return rows[0].n;
    },

    async stockLabelFor(product) {
      const n = await store.countAvailable(product.id);
      return stockLabel(n) as StockLabel;
    },

    async getOrderByIdempotencyKey(key) {
      return one(pool, `SELECT * FROM public.orders WHERE idempotency_key = $1`, [key], toOrder);
    },

    async getOrderByPublicRef(ref) {
      return one(pool, `SELECT * FROM public.orders WHERE public_reference = $1`, [ref], toOrder);
    },

    async getOrderById(id) {
      if (!UUID_RE.test(id)) return null;
      return one(pool, `SELECT * FROM public.orders WHERE id = $1`, [id], toOrder);
    },

    async listOrderItems(orderId) {
      return many(
        pool,
        `SELECT * FROM public.order_items WHERE order_id = $1 ORDER BY created_at, id`,
        [orderId],
        toOrderItem,
      );
    },

    async getPaymentByOrderId(orderId) {
      return one(
        pool,
        `SELECT * FROM public.payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [orderId],
        toPayment,
      );
    },

    async getPaymentBySessionId(sessionId) {
      return one(
        pool,
        `SELECT * FROM public.payments WHERE provider_checkout_session_id = $1`,
        [sessionId],
        toPayment,
      );
    },

    async listOrdersForUser(userId) {
      return many(
        pool,
        `SELECT * FROM public.orders WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
        toOrder,
      );
    },

    async createCheckoutBundle({ order, items, payment }) {
      await withTransaction(pool, async (db) => {
        if (order.userId) await ensureProfile(db, order.userId);
        await db.query(
          `INSERT INTO public.orders (
             id, public_reference, user_id, customer_email, customer_phone_e164, customer_full_name,
             subtotal_amount_minor, total_amount_minor, currency, status, reservation_expires_at,
             idempotency_key, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            order.id,
            order.publicReference,
            order.userId,
            order.customerEmail,
            order.customerPhoneE164,
            order.customerFullName || null,
            order.subtotalAmountMinor,
            order.totalAmountMinor,
            order.currency,
            order.status,
            order.reservationExpiresAt,
            order.idempotencyKey,
            order.createdAt,
          ],
        );
        for (const item of items) {
          await db.query(
            `INSERT INTO public.order_items (
               id, order_id, product_id, product_public_id, product_name, product_slug, platform, region,
               face_value, face_currency, quantity, unit_amount_minor, total_amount_minor, currency
             )
             SELECT $1, $2, $3, $4, $5, p.slug, $6, $7, $8, $9, $10, $11, $12, $13
             FROM public.products p WHERE p.id = $3`,
            [
              item.id,
              item.orderId,
              item.productId,
              item.productPublicId,
              item.productName,
              item.platform,
              item.region,
              item.faceValue,
              item.faceCurrency,
              item.quantity,
              item.unitAmountMinor,
              item.totalAmountMinor,
              item.currency,
            ],
          );
        }
        await db.query(
          `INSERT INTO public.payments (
             id, order_id, provider, provider_checkout_session_id, provider_transaction_id, client_reference,
             expected_amount_minor, expected_currency, status, when_expires, wave_launch_url
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            payment.id,
            payment.orderId,
            payment.provider,
            payment.providerCheckoutSessionId,
            payment.providerTransactionId,
            payment.clientReference,
            payment.expectedAmountMinor,
            payment.expectedCurrency,
            payment.status,
            payment.whenExpires,
            payment.waveLaunchUrl,
          ],
        );
      });
    },

    async reserveInventory(productId, qty, orderId, until) {
      return withTransaction(pool, async (db) => {
        const { rows } = await db.query(
          `UPDATE public.card_inventory SET status = 'reserved', reserved_order_id = $3, reserved_until = $4
           WHERE id IN (
             SELECT ci.id FROM public.card_inventory ci
             WHERE ci.product_id = $1 AND ${SELLABLE}
             ORDER BY ci.created_at, ci.id
             LIMIT $2
             FOR UPDATE SKIP LOCKED
           )
           RETURNING id`,
          [productId, qty, orderId, until],
        );
        if (rows.length < qty) {
          throw Object.assign(new Error("INSUFFICIENT_STOCK"), { code: "INSUFFICIENT_STOCK" });
        }
        return rows.map((r) => r.id as string);
      });
    },

    async releaseReservation(orderId) {
      await pool.query(
        `UPDATE public.card_inventory
         SET status = 'available', reserved_order_id = NULL, reserved_until = NULL
         WHERE reserved_order_id = $1 AND status = 'reserved'`,
        [orderId],
      );
    },

    async markPaymentSession(paymentId, session) {
      const columns: Record<string, string> = {
        status: "status",
        providerTransactionId: "provider_transaction_id",
        providerCheckoutSessionId: "provider_checkout_session_id",
        whenExpires: "when_expires",
        waveLaunchUrl: "wave_launch_url",
      };
      const sets: string[] = [];
      const params: unknown[] = [paymentId];
      for (const [key, column] of Object.entries(columns)) {
        const value = session[key as keyof PaymentRow];
        if (value === undefined) continue;
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
      if (sets.length === 0) return;
      await pool.query(`UPDATE public.payments SET ${sets.join(", ")} WHERE id = $1`, params);
    },

    async recordWebhookEvent(event) {
      const { rowCount } = await pool.query(
        `INSERT INTO public.webhook_events (id, provider, provider_event_id, event_type, processing_status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (provider, provider_event_id) DO NOTHING`,
        [event.id, event.provider, event.providerEventId, event.eventType, event.processingStatus],
      );
      return rowCount === 1;
    },

    async enqueueOutbox(job) {
      await pool.query(
        `INSERT INTO public.outbox_jobs (id, job_type, payload, status, attempts, max_attempts, available_at, last_error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [job.id, job.jobType, JSON.stringify(job.payload), job.status, job.attempts, job.maxAttempts, job.availableAt, job.lastError],
      );
    },

    async claimOutboxJobs(limit) {
      return many(
        pool,
        `UPDATE public.outbox_jobs SET status = 'processing', attempts = attempts + 1, locked_at = now()
         WHERE id IN (
           SELECT id FROM public.outbox_jobs
           WHERE status IN ('pending', 'failed') AND available_at <= now() AND attempts < max_attempts
           ORDER BY available_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
        [limit],
        toOutboxJob,
      );
    },

    async completeOutboxJob(id, ok, error) {
      if (ok) {
        await pool.query(
          `UPDATE public.outbox_jobs SET status = 'completed', last_error = NULL, locked_at = NULL WHERE id = $1`,
          [id],
        );
        return;
      }
      await pool.query(
        `UPDATE public.outbox_jobs SET
           last_error = $2,
           locked_at = NULL,
           status = CASE WHEN attempts >= max_attempts THEN 'dead_letter'::public.outbox_job_status
                         ELSE 'failed'::public.outbox_job_status END,
           available_at = now() + make_interval(secs => LEAST(60 * power(2, attempts), 3600))
         WHERE id = $1`,
        [id, error ?? "error"],
      );
    },

    async fulfilPaidOrder(orderId, transactionId) {
      return withTransaction(pool, async (db) => {
        const order = await one(db, `SELECT * FROM public.orders WHERE id = $1 FOR UPDATE`, [orderId], toOrder);
        const payment = await one(
          db,
          `SELECT * FROM public.payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [orderId],
          toPayment,
        );
        if (!order || !payment) throw new Error("ORDER_NOT_FOUND");
        if (order.status === "fulfilled") return "already" as const;
        if (order.status === "manual_review") return "manual_review" as const;
        if (payment.providerTransactionId && payment.providerTransactionId !== transactionId) {
          throw new Error("TRANSACTION_MISMATCH");
        }

        await db.query(
          `UPDATE public.payments SET provider_transaction_id = $2, status = 'succeeded' WHERE id = $1`,
          [payment.id, transactionId],
        );

        const items = await many(
          db,
          `SELECT * FROM public.order_items WHERE order_id = $1 ORDER BY created_at, id`,
          [orderId],
          toOrderItem,
        );
        const reserved = await many(
          db,
          `SELECT * FROM public.card_inventory
           WHERE reserved_order_id = $1 AND status = 'reserved'
           ORDER BY created_at, id
           FOR UPDATE`,
          [orderId],
          toInventory,
        );

        // Reserved codes are matched to items by product, never across products.
        const byProduct = new Map<string, InventoryRow[]>();
        for (const inv of reserved) {
          const list = byProduct.get(inv.productId) ?? [];
          list.push(inv);
          byProduct.set(inv.productId, list);
        }
        const enough = items.every((item) => (byProduct.get(item.productId)?.length ?? 0) >= item.quantity);

        const toManualReview: OrderStatus[] =
          order.status === "pending_payment"
            ? ["payment_processing", "manual_review"]
            : order.status === "paid"
              ? ["manual_review"]
              : order.status === "payment_processing" || order.status === "expired" || order.status === "payment_failed"
                ? ["manual_review"]
                : [];

        if (!enough) {
          if (toManualReview.length === 0) throw new Error(`UNEXPECTED_ORDER_STATUS:${order.status}`);
          await advanceOrder(db, orderId, toManualReview);
          return "manual_review" as const;
        }

        const toFulfilled: OrderStatus[] =
          order.status === "pending_payment"
            ? ["payment_processing", "paid", "fulfilled"]
            : order.status === "payment_processing"
              ? ["paid", "fulfilled"]
              : order.status === "paid"
                ? ["fulfilled"]
                : [];
        if (toFulfilled.length === 0) {
          // Paid after the order expired or failed: a person must check it.
          await advanceOrder(db, orderId, toManualReview);
          return "manual_review" as const;
        }

        for (const item of items) {
          const codes = byProduct.get(item.productId)!.splice(0, item.quantity);
          for (const inv of codes) {
            await db.query(
              `UPDATE public.card_inventory SET status = 'sold', sold_order_item_id = $2 WHERE id = $1`,
              [inv.id, item.id],
            );
            await db.query(
              `INSERT INTO public.fulfilments (id, order_id, order_item_id, inventory_id, delivered_at)
               VALUES ($1, $2, $3, $4, now())`,
              [randomUUID(), orderId, item.id, inv.id],
            );
          }
        }
        // Any extra reserved codes go back on sale.
        await db.query(
          `UPDATE public.card_inventory
           SET status = 'available', reserved_order_id = NULL, reserved_until = NULL
           WHERE reserved_order_id = $1 AND status = 'reserved'`,
          [orderId],
        );
        await advanceOrder(db, orderId, toFulfilled);
        return "fulfilled" as const;
      });
    },

    async listFulfilments(orderId) {
      return many(
        pool,
        `SELECT * FROM public.fulfilments WHERE order_id = $1 ORDER BY created_at, id`,
        [orderId],
        toFulfilment,
      );
    },

    async getInventory(id) {
      return one(pool, `SELECT * FROM public.card_inventory WHERE id = $1`, [id], toInventory);
    },

    async recordReveal(fulfilmentId) {
      await pool.query(
        `UPDATE public.fulfilments SET
           reveal_count = reveal_count + 1,
           first_revealed_at = COALESCE(first_revealed_at, now()),
           last_revealed_at = now()
         WHERE id = $1`,
        [fulfilmentId],
      );
    },

    async createGuestToken(row) {
      await pool.query(
        `INSERT INTO public.guest_access_tokens (id, order_id, token_hash, expires_at, used_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.id, row.orderId, row.tokenHash, row.expiresAt, row.usedAt],
      );
    },

    async findGuestToken(hash) {
      return one(pool, `SELECT * FROM public.guest_access_tokens WHERE token_hash = $1`, [hash], toGuestToken);
    },

    async markGuestTokenUsed(id) {
      await pool.query(`UPDATE public.guest_access_tokens SET used_at = now() WHERE id = $1`, [id]);
    },

    async getProfile(userId) {
      if (!UUID_RE.test(userId)) return null;
      return one(pool, `SELECT * FROM public.profiles WHERE id = $1`, [userId], toProfile);
    },

    async upsertProfile(row) {
      await pool.query(
        `INSERT INTO public.profiles (id, full_name, email, phone_e164)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           email = COALESCE(EXCLUDED.email, public.profiles.email),
           phone_e164 = EXCLUDED.phone_e164`,
        [row.id, row.fullName, row.email, row.phoneE164],
      );
    },

    async isAdmin(userId) {
      if (!UUID_RE.test(userId)) return false;
      const { rows } = await pool.query(
        `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'admin'`,
        [userId],
      );
      return rows.length > 0;
    },

    async adminUpsertCategory(row) {
      await pool.query(
        `INSERT INTO public.categories (id, public_id, name, slug, description, image_url, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description,
           image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active`,
        [row.id, row.publicId, row.name, row.slug, row.description, row.imageUrl, row.sortOrder, row.isActive],
      );
    },

    async adminUpsertProduct(row) {
      await pool.query(
        `INSERT INTO public.products (
           id, public_id, category_id, name, slug, platform, region, face_value, face_currency,
           sale_amount_minor, sale_currency, description, instructions, image_url, is_active, low_stock_threshold
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO UPDATE SET
           category_id = EXCLUDED.category_id, name = EXCLUDED.name, slug = EXCLUDED.slug,
           platform = EXCLUDED.platform, region = EXCLUDED.region, face_value = EXCLUDED.face_value,
           face_currency = EXCLUDED.face_currency, sale_amount_minor = EXCLUDED.sale_amount_minor,
           description = EXCLUDED.description, instructions = EXCLUDED.instructions,
           image_url = EXCLUDED.image_url, is_active = EXCLUDED.is_active,
           low_stock_threshold = EXCLUDED.low_stock_threshold`,
        [
          row.id,
          row.publicId,
          row.categoryId,
          row.name,
          row.slug,
          row.platform,
          row.region,
          row.faceValue,
          row.faceCurrency,
          row.saleAmountMinor,
          row.saleCurrency,
          row.description,
          row.instructions,
          row.imageUrl,
          row.isActive,
          row.lowStockThreshold,
        ],
      );
    },

    async adminAddInventory(rows, batchId, productId, uploadedBy) {
      return withTransaction(pool, async (db) => {
        if (uploadedBy) await ensureProfile(db, uploadedBy);
        const uploader = uploadedBy && UUID_RE.test(uploadedBy) ? uploadedBy : null;
        if (rows.length > 0) {
          await db.query(
            `INSERT INTO public.inventory_batches (id, product_id, quantity_uploaded, uploaded_by)
             VALUES ($1, $2, $3, $4)`,
            [batchId, productId, rows.length, uploader],
          );
        }
        let accepted = 0;
        for (const row of rows) {
          const { rowCount } = await db.query(
            `INSERT INTO public.card_inventory (
               id, product_id, batch_id, encrypted_payload, encryption_iv, authentication_tag,
               encryption_key_version, code_fingerprint, masked_code, status, uploaded_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'available',$10)
             ON CONFLICT (code_fingerprint) DO NOTHING`,
            [
              row.id,
              productId,
              batchId,
              row.encryptedPayload,
              row.encryptionIv,
              row.authenticationTag,
              row.encryptionKeyVersion,
              row.codeFingerprint,
              row.maskedCode,
              uploader,
            ],
          );
          accepted += rowCount ?? 0;
        }
        return { accepted, rejected: rows.length - accepted };
      });
    },

    async listAuditLogs(limit) {
      return many(
        pool,
        `SELECT * FROM public.audit_logs ORDER BY created_at DESC LIMIT $1`,
        [limit],
        toAudit,
      );
    },

    async writeAudit(row) {
      const actorId = row.actorId && UUID_RE.test(row.actorId) ? row.actorId : null;
      const targetId = row.targetId && UUID_RE.test(row.targetId) ? row.targetId : null;
      const metadata =
        row.targetId && !targetId ? { ...row.metadataRedacted, targetRef: row.targetId } : row.metadataRedacted;
      await pool.query(
        `INSERT INTO public.audit_logs (id, actor_type, actor_id, action, target_type, target_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [row.id, row.actorType, actorId, row.action, row.targetType, targetId, JSON.stringify(metadata), row.createdAt],
      );
    },

    async listAllOrders(limit) {
      return many(pool, `SELECT * FROM public.orders ORDER BY created_at DESC LIMIT $1`, [limit], toOrder);
    },

    async updateOrderStatus(orderId, status) {
      await advanceOrder(pool, orderId, [status]);
    },

    async listStaleOpenPayments(olderThan) {
      return many(
        pool,
        `SELECT p.* FROM public.payments p
         JOIN public.orders o ON o.id = p.order_id
         WHERE p.status = 'session_open'
           AND o.status IN ('pending_payment', 'payment_processing')
           AND (
             (p.when_expires IS NOT NULL AND p.when_expires <= now())
             OR (o.reservation_expires_at IS NOT NULL AND o.reservation_expires_at <= now())
             OR o.created_at <= $1
           )`,
        [olderThan],
        toPayment,
      );
    },
  };

  return store;
}

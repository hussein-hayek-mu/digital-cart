import {
  encryptCardSecret,
  fingerprintCode,
  maskCode,
  normalizeCode,
  stockLabel,
  type StockLabel,
  type OrderStatus,
} from "@repo/shared";
import { randomUUID } from "node:crypto";
import { generatePublicId } from "../lib/ids.js";
import { PRODUCT_INSTRUCTIONS, SEED_CATEGORIES, SEED_PRODUCTS, productDescription } from "./seed-data.js";
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
  WebhookEventRow,
} from "./store.js";

export function createMemoryStore(opts: {
  encryptionKey: string;
  fingerprintPepper: string;
}): Store {
  const categories = new Map<string, CategoryRow>();
  const products = new Map<string, ProductRow>();
  const inventory = new Map<string, InventoryRow>();
  const orders = new Map<string, OrderRow>();
  const orderItems = new Map<string, OrderItemRow[]>();
  const payments = new Map<string, PaymentRow>();
  const fulfilments = new Map<string, FulfilmentRow[]>();
  const guestTokens = new Map<string, GuestTokenRow>();
  const outbox: OutboxJobRow[] = [];
  const webhooks = new Set<string>();
  const audits: AuditLogRow[] = [];
  const profiles = new Map<string, ProfileRow>();
  const admins = new Set<string>();

  // Seed catalog — demo categories & products for local testing
  const categoryIds = new Map<string, string>();
  for (const cat of SEED_CATEGORIES) {
    const id = randomUUID();
    categoryIds.set(cat.slug, id);
    categories.set(id, {
      id,
      publicId: generatePublicId("cat"),
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      imageUrl: null,
      sortOrder: cat.sortOrder,
      isActive: true,
    });
  }

  for (const seed of SEED_PRODUCTS) {
    const id = randomUUID();
    const row: ProductRow = {
      id,
      publicId: generatePublicId("prd"),
      categoryId: categoryIds.get(seed.categorySlug)!,
      name: seed.name,
      slug: seed.slug,
      platform: seed.platform,
      region: seed.region,
      faceValue: seed.faceValue,
      faceCurrency: seed.faceCurrency,
      saleAmountMinor: seed.priceMinor,
      saleCurrency: "XOF",
      description: productDescription(seed.name),
      instructions: PRODUCT_INSTRUCTIONS,
      imageUrl: null,
      isActive: true,
      lowStockThreshold: 5,
    };
    products.set(id, row);
    for (const code of seed.demoCodes) {
      const normalized = normalizeCode(code);
      const enc = encryptCardSecret({ code: normalized }, opts.encryptionKey, 1);
      const invId = randomUUID();
      inventory.set(invId, {
        id: invId,
        productId: id,
        batchId: null,
        encryptedPayload: enc.ciphertext,
        encryptionIv: enc.iv,
        authenticationTag: enc.authTag,
        encryptionKeyVersion: 1,
        codeFingerprint: fingerprintCode(normalized, opts.fingerprintPepper),
        maskedCode: maskCode(normalized),
        status: "available",
        reservedOrderId: null,
        reservedUntil: null,
        soldOrderItemId: null,
      });
    }
  }

  const store: Store = {
    async listCategories() {
      return [...categories.values()].filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async getCategoryBySlug(slug) {
      return [...categories.values()].find((c) => c.slug === slug && c.isActive) ?? null;
    },
    async listProducts(filters) {
      let list = [...products.values()].filter((p) => p.isActive);
      if (filters?.categorySlug) {
        const catRow = [...categories.values()].find((c) => c.slug === filters.categorySlug);
        list = list.filter((p) => p.categoryId === catRow?.id);
      }
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.platform.toLowerCase().includes(q) ||
            p.region.toLowerCase().includes(q),
        );
      }
      return list;
    },
    async getProductBySlug(slug) {
      return [...products.values()].find((p) => p.slug === slug && p.isActive) ?? null;
    },
    async getProductByPublicId(publicId) {
      return [...products.values()].find((p) => p.publicId === publicId) ?? null;
    },
    async countAvailable(productId) {
      return [...inventory.values()].filter((i) => i.productId === productId && i.status === "available").length;
    },
    async stockLabelFor(product) {
      const n = await store.countAvailable(product.id);
      return stockLabel(n) as StockLabel;
    },
    async getOrderByIdempotencyKey(key) {
      return [...orders.values()].find((o) => o.idempotencyKey === key) ?? null;
    },
    async getOrderByPublicRef(ref) {
      return [...orders.values()].find((o) => o.publicReference === ref) ?? null;
    },
    async getOrderById(id) {
      return orders.get(id) ?? null;
    },
    async listOrderItems(orderId) {
      return orderItems.get(orderId) ?? [];
    },
    async getPaymentByOrderId(orderId) {
      return [...payments.values()].find((p) => p.orderId === orderId) ?? null;
    },
    async getPaymentBySessionId(sessionId) {
      return [...payments.values()].find((p) => p.providerCheckoutSessionId === sessionId) ?? null;
    },
    async listOrdersForUser(userId) {
      return [...orders.values()].filter((o) => o.userId === userId);
    },
    async reserveInventory(productId, qty, orderId, until) {
      const available = [...inventory.values()].filter(
        (i) => i.productId === productId && i.status === "available",
      );
      if (available.length < qty) {
        throw Object.assign(new Error("INSUFFICIENT_STOCK"), { code: "INSUFFICIENT_STOCK" });
      }
      const picked = available.slice(0, qty);
      for (const row of picked) {
        row.status = "reserved";
        row.reservedOrderId = orderId;
        row.reservedUntil = until;
      }
      return picked.map((p) => p.id);
    },
    async releaseReservation(orderId) {
      for (const row of inventory.values()) {
        if (row.reservedOrderId === orderId && row.status === "reserved") {
          row.status = "available";
          row.reservedOrderId = null;
          row.reservedUntil = null;
        }
      }
    },
    async createCheckoutBundle(input) {
      orders.set(input.order.id, input.order);
      orderItems.set(input.order.id, input.items);
      payments.set(input.payment.id, input.payment);
    },
    async markPaymentSession(paymentId, session) {
      const p = payments.get(paymentId);
      if (!p) return;
      Object.assign(p, session);
    },
    async recordWebhookEvent(event) {
      const key = `${event.provider}:${event.providerEventId}`;
      if (webhooks.has(key)) return false;
      webhooks.add(key);
      return true;
    },
    async enqueueOutbox(job) {
      outbox.push(job);
    },
    async claimOutboxJobs(limit) {
      const now = new Date();
      const claimed: OutboxJobRow[] = [];
      for (const job of outbox) {
        if (claimed.length >= limit) break;
        if (
          (job.status === "pending" || job.status === "failed") &&
          job.availableAt <= now &&
          job.attempts < job.maxAttempts
        ) {
          job.status = "processing";
          job.attempts += 1;
          claimed.push(job);
        }
      }
      return claimed;
    },
    async completeOutboxJob(id, ok, error) {
      const job = outbox.find((j) => j.id === id);
      if (!job) return;
      if (ok) {
        job.status = "completed";
        job.lastError = null;
      } else {
        job.lastError = error ?? "error";
        job.status = job.attempts >= job.maxAttempts ? "dead_letter" : "failed";
        job.availableAt = new Date(Date.now() + Math.min(60_000 * 2 ** job.attempts, 3600_000));
      }
    },
    async fulfilPaidOrder(orderId, transactionId) {
      const order = orders.get(orderId);
      const payment = [...payments.values()].find((p) => p.orderId === orderId);
      if (!order || !payment) throw new Error("ORDER_NOT_FOUND");
      if (order.status === "fulfilled") return "already";
      if (payment.providerTransactionId && payment.providerTransactionId !== transactionId) {
        throw new Error("TRANSACTION_MISMATCH");
      }
      payment.providerTransactionId = transactionId;
      payment.status = "succeeded";

      const items = orderItems.get(orderId) ?? [];
      const reserved = [...inventory.values()].filter(
        (i) => i.reservedOrderId === orderId && i.status === "reserved",
      );
      const needed = items.reduce((s, i) => s + i.quantity, 0);
      if (reserved.length < needed) {
        order.status = "manual_review";
        return "manual_review";
      }

      const fulfilled: FulfilmentRow[] = [];
      let reservedIdx = 0;
      for (const item of items) {
        for (let q = 0; q < item.quantity; q++) {
          const inv = reserved[reservedIdx++];
          inv.status = "sold";
          inv.soldOrderItemId = item.id;
          fulfilled.push({
            id: randomUUID(),
            orderId,
            orderItemId: item.id,
            inventoryId: inv.id,
            deliveredAt: new Date(),
            firstRevealedAt: null,
            lastRevealedAt: null,
            revealCount: 0,
          });
        }
      }
      fulfilments.set(orderId, fulfilled);
      order.status = "fulfilled";
      order.paidAt = new Date();
      order.fulfilledAt = new Date();
      return "fulfilled";
    },
    async listFulfilments(orderId) {
      return fulfilments.get(orderId) ?? [];
    },
    async getInventory(id) {
      return inventory.get(id) ?? null;
    },
    async recordReveal(fulfilmentId) {
      for (const list of fulfilments.values()) {
        const f = list.find((x) => x.id === fulfilmentId);
        if (f) {
          const now = new Date();
          f.revealCount += 1;
          f.firstRevealedAt ??= now;
          f.lastRevealedAt = now;
        }
      }
    },
    async createGuestToken(row) {
      guestTokens.set(row.id, row);
    },
    async findGuestToken(hash) {
      return [...guestTokens.values()].find((t) => t.tokenHash === hash) ?? null;
    },
    async markGuestTokenUsed(id) {
      const t = guestTokens.get(id);
      if (t) t.usedAt = new Date();
    },
    async getProfile(userId) {
      return profiles.get(userId) ?? null;
    },
    async upsertProfile(row) {
      profiles.set(row.id, row);
    },
    async isAdmin(userId) {
      return admins.has(userId);
    },
    async adminUpsertCategory(row) {
      categories.set(row.id, row);
    },
    async adminUpsertProduct(row) {
      products.set(row.id, row);
    },
    async adminAddInventory(rows) {
      let accepted = 0;
      let rejected = 0;
      for (const row of rows) {
        if ([...inventory.values()].some((i) => i.codeFingerprint === row.codeFingerprint)) {
          rejected += 1;
          continue;
        }
        inventory.set(row.id, row);
        accepted += 1;
      }
      return { accepted, rejected };
    },
    async listAuditLogs(limit) {
      return audits.slice(-limit).reverse();
    },
    async writeAudit(row) {
      audits.push(row);
    },
    async listAllOrders(limit) {
      return [...orders.values()].slice(-limit).reverse();
    },
    async updateOrderStatus(orderId, status: OrderStatus) {
      const o = orders.get(orderId);
      if (o) o.status = status;
    },
    async listStaleOpenPayments(olderThan) {
      const now = new Date();
      const stale: PaymentRow[] = [];
      for (const payment of payments.values()) {
        if (payment.status !== "session_open") continue;
        const order = orders.get(payment.orderId);
        if (!order) continue;
        if (order.status !== "pending_payment" && order.status !== "payment_processing") continue;

        const whenExpiresPast = payment.whenExpires !== null && payment.whenExpires <= now;
        const reservationPast =
          order.reservationExpiresAt !== null && order.reservationExpiresAt <= now;
        const createdStale = order.createdAt <= olderThan;

        if (whenExpiresPast || reservationPast || createdStale) {
          stale.push(payment);
        }
      }
      return stale;
    },
  };

  return store;
}

import type { InventoryStatus, OrderStatus, PaymentStatus, StockLabel } from "@repo/shared";

export type CategoryRow = {
  id: string;
  publicId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type ProductRow = {
  id: string;
  publicId: string;
  categoryId: string;
  name: string;
  slug: string;
  platform: string;
  region: string;
  faceValue: string;
  faceCurrency: string;
  saleAmountMinor: number;
  saleCurrency: "XOF";
  description: string | null;
  instructions: string | null;
  imageUrl: string | null;
  isActive: boolean;
  lowStockThreshold: number;
};

export type InventoryRow = {
  id: string;
  productId: string;
  batchId: string | null;
  encryptedPayload: Buffer;
  encryptionIv: Buffer;
  authenticationTag: Buffer;
  encryptionKeyVersion: number;
  codeFingerprint: string;
  maskedCode: string;
  status: InventoryStatus;
  reservedOrderId: string | null;
  reservedUntil: Date | null;
  soldOrderItemId: string | null;
};

export type OrderRow = {
  id: string;
  publicReference: string;
  userId: string | null;
  customerFullName: string;
  customerEmail: string;
  customerPhoneE164: string;
  subtotalAmountMinor: number;
  totalAmountMinor: number;
  currency: "XOF";
  status: OrderStatus;
  idempotencyKey: string;
  reservationExpiresAt: Date | null;
  paidAt: Date | null;
  fulfilledAt: Date | null;
  createdAt: Date;
};

export type OrderItemRow = {
  id: string;
  orderId: string;
  productId: string;
  productPublicId: string;
  productName: string;
  platform: string;
  region: string;
  faceValue: string;
  faceCurrency: string;
  quantity: number;
  unitAmountMinor: number;
  totalAmountMinor: number;
  currency: "XOF";
};

export type PaymentRow = {
  id: string;
  orderId: string;
  provider: string;
  providerCheckoutSessionId: string;
  providerTransactionId: string | null;
  clientReference: string;
  expectedAmountMinor: number;
  expectedCurrency: "XOF";
  status: PaymentStatus;
  whenExpires: Date | null;
  waveLaunchUrl: string | null;
};

export type FulfilmentRow = {
  id: string;
  orderId: string;
  orderItemId: string;
  inventoryId: string;
  deliveredAt: Date;
  firstRevealedAt: Date | null;
  lastRevealedAt: Date | null;
  revealCount: number;
};

export type GuestTokenRow = {
  id: string;
  orderId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type OutboxJobRow = {
  id: string;
  jobType: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed" | "dead_letter";
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lastError: string | null;
};

export type WebhookEventRow = {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  processingStatus: string;
};

export type AuditLogRow = {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadataRedacted: Record<string, unknown>;
  createdAt: Date;
};

export type ProfileRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  phoneE164: string | null;
};

export interface Store {
  listCategories(): Promise<CategoryRow[]>;
  getCategoryBySlug(slug: string): Promise<CategoryRow | null>;
  listProducts(filters?: { categorySlug?: string; q?: string }): Promise<ProductRow[]>;
  getProductBySlug(slug: string): Promise<ProductRow | null>;
  getProductByPublicId(publicId: string): Promise<ProductRow | null>;
  countAvailable(productId: string): Promise<number>;
  getOrderByIdempotencyKey(key: string): Promise<OrderRow | null>;
  getOrderByPublicRef(ref: string): Promise<OrderRow | null>;
  getOrderById(id: string): Promise<OrderRow | null>;
  listOrderItems(orderId: string): Promise<OrderItemRow[]>;
  getPaymentByOrderId(orderId: string): Promise<PaymentRow | null>;
  getPaymentBySessionId(sessionId: string): Promise<PaymentRow | null>;
  listOrdersForUser(userId: string): Promise<OrderRow[]>;
  createCheckoutBundle(input: {
    order: OrderRow;
    items: OrderItemRow[];
    payment: PaymentRow;
    reservedInventoryIds: string[];
  }): Promise<void>;
  reserveInventory(productId: string, qty: number, orderId: string, until: Date): Promise<string[]>;
  releaseReservation(orderId: string): Promise<void>;
  markPaymentSession(paymentId: string, session: Partial<PaymentRow>): Promise<void>;
  recordWebhookEvent(event: WebhookEventRow): Promise<boolean>;
  enqueueOutbox(job: OutboxJobRow): Promise<void>;
  claimOutboxJobs(limit: number): Promise<OutboxJobRow[]>;
  completeOutboxJob(id: string, ok: boolean, error?: string): Promise<void>;
  fulfilPaidOrder(orderId: string, transactionId: string): Promise<"fulfilled" | "manual_review" | "already">;
  listFulfilments(orderId: string): Promise<FulfilmentRow[]>;
  getInventory(id: string): Promise<InventoryRow | null>;
  recordReveal(fulfilmentId: string): Promise<void>;
  createGuestToken(row: GuestTokenRow): Promise<void>;
  findGuestToken(hash: string): Promise<GuestTokenRow | null>;
  markGuestTokenUsed(id: string): Promise<void>;
  getProfile(userId: string): Promise<ProfileRow | null>;
  upsertProfile(row: ProfileRow): Promise<void>;
  isAdmin(userId: string): Promise<boolean>;
  adminUpsertCategory(row: CategoryRow): Promise<void>;
  adminUpsertProduct(row: ProductRow): Promise<void>;
  adminAddInventory(rows: InventoryRow[], batchId: string, productId: string, uploadedBy: string | null): Promise<{ accepted: number; rejected: number }>;
  listAuditLogs(limit: number): Promise<AuditLogRow[]>;
  writeAudit(row: AuditLogRow): Promise<void>;
  listAllOrders(limit: number): Promise<OrderRow[]>;
  updateOrderStatus(orderId: string, status: OrderStatus): Promise<void>;
  listStaleOpenPayments(olderThan: Date): Promise<PaymentRow[]>;
  stockLabelFor(product: ProductRow): Promise<StockLabel>;
}

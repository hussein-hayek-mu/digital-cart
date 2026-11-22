import { z } from "zod";
import { CURRENCY_CODE } from "./constants.js";
import { INVENTORY_STATUSES } from "./inventory-status.js";
import { ORDER_STATUSES } from "./order-states.js";
import { PAYMENT_STATUSES } from "./payment-states.js";
import { STOCK_LABELS } from "./stock.js";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.literal(CURRENCY_CODE),
});

export const phoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Phone must be E.164");

export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format");

export const uuidSchema = z.string().uuid();

export const publicReferenceSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid public reference format");

export const idempotencyKeySchema = z.string().min(16).max(128);

export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const inventoryStatusSchema = z.enum(INVENTORY_STATUSES);
export const stockLabelSchema = z.enum(STOCK_LABELS);

// ---------------------------------------------------------------------------
// Public catalog
// ---------------------------------------------------------------------------

export const publicProductSchema = z.object({
  publicId: z.string().min(1),
  slug: slugSchema,
  name: z.string().min(1).max(200),
  platform: z.string().min(1).max(100),
  region: z.string().min(1).max(100),
  faceValue: z.string().min(1),
  faceCurrency: z.string().length(3),
  saleAmountMinor: z.number().int().positive(),
  saleCurrency: z.literal(CURRENCY_CODE),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  stockLabel: stockLabelSchema,
  categorySlug: slugSchema,
});

export const categorySchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export const categoryListResponseSchema = z.object({
  categories: z.array(categorySchema),
});

export const productListQuerySchema = z.object({
  categorySlug: slugSchema.optional(),
  platform: z.string().min(1).max(100).optional(),
  region: z.string().min(1).max(100).optional(),
  search: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const productListResponseSchema = z.object({
  products: z.array(publicProductSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Cart & checkout
// ---------------------------------------------------------------------------

export const cartItemInputSchema = z.object({
  productPublicId: z.string().min(1),
  quantity: z.number().int().positive().max(20),
});

export const cartValidateSchema = z.object({
  items: z.array(cartItemInputSchema).min(1).max(50),
});

export const cartValidatedLineSchema = z.object({
  productPublicId: z.string().min(1),
  productName: z.string(),
  productSlug: slugSchema,
  quantity: z.number().int().positive(),
  unitAmountMinor: z.number().int().nonnegative(),
  totalAmountMinor: z.number().int().nonnegative(),
  currency: z.literal(CURRENCY_CODE),
  stockLabel: stockLabelSchema,
});

export const cartValidateResponseSchema = z.object({
  items: z.array(cartValidatedLineSchema),
  subtotalAmountMinor: z.number().int().nonnegative(),
  totalAmountMinor: z.number().int().nonnegative(),
  currency: z.literal(CURRENCY_CODE),
});

// NOTE: Idempotency is carried via the `Idempotency-Key` request header
// (see `idempotencyKeySchema` + `routes/checkout.ts`), never the body — a
// client-supplied body field would let a caller "idempotency-key" their way
// into re-pricing or replaying an order. Any legacy `idempotencyKey` field
// sent in the body is simply ignored (zod strips unknown keys by default).
export const checkoutCreateSchema = z.object({
  items: z.array(cartItemInputSchema).min(1).max(50),
  customerFullName: z.string().min(1).max(200),
  customerEmail: z.string().email().max(320),
  customerPhoneE164: phoneE164Schema,
  successPath: z.string().startsWith("/").optional(),
  errorPath: z.string().startsWith("/").optional(),
});

export type CheckoutCreateInput = z.infer<typeof checkoutCreateSchema>;
export type CheckoutCreate = CheckoutCreateInput;

export const createCheckoutSessionResponseSchema = z.object({
  orderPublicReference: publicReferenceSchema,
  waveLaunchUrl: z.string().url(),
  reservationExpiresAt: z.string().datetime(),
  totalAmountMinor: z.number().int().nonnegative(),
  currency: z.literal(CURRENCY_CODE),
});

// ---------------------------------------------------------------------------
// Orders & guest retrieval
// ---------------------------------------------------------------------------

export const orderItemSnapshotSchema = z.object({
  id: uuidSchema,
  productId: uuidSchema,
  productName: z.string(),
  productSlug: slugSchema,
  platform: z.string(),
  region: z.string(),
  faceValue: z.number().positive(),
  faceCurrency: z.string().length(3),
  quantity: z.number().int().positive(),
  unitAmountMinor: z.number().int().nonnegative(),
  totalAmountMinor: z.number().int().nonnegative(),
  currency: z.literal(CURRENCY_CODE),
});

export const orderSummarySchema = z.object({
  publicReference: publicReferenceSchema,
  status: orderStatusSchema,
  subtotalAmountMinor: z.number().int().nonnegative(),
  totalAmountMinor: z.number().int().nonnegative(),
  currency: z.literal(CURRENCY_CODE),
  createdAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable().optional(),
  fulfilledAt: z.string().datetime().nullable().optional(),
});

export const orderStatusResponseSchema = z.object({
  order: orderSummarySchema,
  items: z.array(orderItemSnapshotSchema),
});

export const orderListResponseSchema = z.object({
  orders: z.array(orderSummarySchema),
});

export const guestLookupSchema = z.object({
  publicReference: publicReferenceSchema,
  email: z.string().email(),
});

export const guestVerifySchema = z.object({
  publicReference: publicReferenceSchema,
  email: z.string().email(),
  token: z.string().min(32).max(256),
});

export const revealedCodeSchema = z.object({
  orderItemId: uuidSchema,
  platform: z.string(),
  region: z.string(),
  faceValue: z.number().positive(),
  faceCurrency: z.string().length(3),
  code: z.string().min(1),
});

export const orderCodesResponseSchema = z.object({
  publicReference: publicReferenceSchema,
  codes: z.array(revealedCodeSchema),
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const profileSchema = z.object({
  id: uuidSchema,
  fullName: z.string().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phoneE164: phoneE164Schema.nullable().optional(),
});

export const profileUpdateSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phoneE164: phoneE164Schema.optional(),
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const paymentSummarySchema = z.object({
  id: uuidSchema,
  orderId: uuidSchema,
  provider: z.string(),
  status: paymentStatusSchema,
  expectedAmountMinor: z.number().int().nonnegative(),
  expectedCurrency: z.literal(CURRENCY_CODE),
  clientReference: publicReferenceSchema,
  createdAt: z.string().datetime(),
});

export const waveWebhookHeadersSchema = z.object({
  "wave-signature": z.string().min(1),
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminCategorySchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const adminProductSchema = z.object({
  categoryPublicId: z.string().min(1),
  name: z.string().min(1).max(200),
  slug: slugSchema,
  platform: z.string().min(1).max(80),
  region: z.string().min(1).max(80),
  faceValue: z.string().min(1).max(40),
  faceCurrency: z.string().length(3),
  saleAmountMinor: z.number().int().positive(),
  description: z.string().max(4000).optional(),
  instructions: z.string().max(4000).optional(),
  imageUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
  lowStockThreshold: z.number().int().positive().optional(),
});

export const inventoryUploadRowSchema = z
  .object({
    code: z.string().min(1).max(256).optional(),
    serial: z.string().min(1).max(256).optional(),
    pin: z.string().min(1).max(256).optional(),
  })
  .refine((r) => Boolean(r.code || (r.serial && r.pin)), {
    message: "Provide code or serial+pin",
  });

export const adminInventoryUploadSchema = z.object({
  productId: uuidSchema,
  supplierReference: z.string().max(200).optional(),
  codes: z.array(z.string().min(4).max(256)).min(1).max(1000),
});

export const adminInventoryUploadResponseSchema = z.object({
  batchId: uuidSchema,
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
});

export const adminInventoryItemSchema = z.object({
  id: uuidSchema,
  productId: uuidSchema,
  batchId: uuidSchema.nullable().optional(),
  maskedCode: z.string(),
  status: inventoryStatusSchema,
  createdAt: z.string().datetime(),
});

export const adminRevealSchema = z.object({
  inventoryId: uuidSchema,
  reason: z.string().min(5).max(500),
});

export const adminRefundSchema = z.object({
  orderPublicReference: publicReferenceSchema,
  reason: z.string().min(5).max(500),
});

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  currency: z.literal(CURRENCY_CODE),
  timestamp: z.string().datetime(),
});

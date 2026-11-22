import {
  RESERVATION_GRACE_MS,
  checkoutCreateSchema,
  sumLineTotals,
  toWaveAmountString,
  type CheckoutCreateInput,
} from "@repo/shared";
import { randomUUID } from "node:crypto";
import type { Env } from "../config/env.js";
import type { Store, OrderItemRow, OrderRow, PaymentRow } from "../db/store.js";
import { generatePublicReference } from "../lib/ids.js";
import type { PaymentProvider } from "../payments/types.js";
import { CHECKOUT_ACCESS_TTL_HOURS, issueOrderAccessToken } from "./order-access.js";

export async function createCheckout(params: {
  store: Store;
  provider: PaymentProvider;
  env: Env;
  input: CheckoutCreateInput;
  idempotencyKey: string;
  userId: string | null;
}) {
  const { store, provider, env, idempotencyKey, userId } = params;
  const input = checkoutCreateSchema.parse(params.input);

  const accessTtlMs = CHECKOUT_ACCESS_TTL_HOURS * 60 * 60 * 1000;

  const existing = await store.getOrderByIdempotencyKey(idempotencyKey);
  if (existing) {
    const payment = await store.getPaymentByOrderId(existing.id);
    return {
      publicReference: existing.publicReference,
      status: existing.status,
      waveLaunchUrl: payment?.waveLaunchUrl ?? null,
      totalAmountMinor: existing.totalAmountMinor,
      currency: existing.currency,
      accessToken: await issueOrderAccessToken(store, env, existing.id, accessTtlMs),
      reused: true,
    };
  }

  const lineProducts = [];
  for (const item of input.items) {
    const product = await store.getProductByPublicId(item.productPublicId);
    if (!product || !product.isActive) {
      throw Object.assign(new Error("PRODUCT_NOT_FOUND"), { code: "PRODUCT_NOT_FOUND" });
    }
    const available = await store.countAvailable(product.id);
    if (available < item.quantity) {
      throw Object.assign(new Error("INSUFFICIENT_STOCK"), { code: "INSUFFICIENT_STOCK" });
    }
    lineProducts.push({ product, quantity: item.quantity });
  }

  const total = sumLineTotals(
    lineProducts.map(({ product, quantity }) => ({
      unitAmountMinor: product.saleAmountMinor,
      quantity,
    })),
  );

  const orderId = randomUUID();
  const publicReference = generatePublicReference();
  const items: OrderItemRow[] = lineProducts.map(({ product, quantity }) => ({
    id: randomUUID(),
    orderId,
    productId: product.id,
    productPublicId: product.publicId,
    productName: product.name,
    platform: product.platform,
    region: product.region,
    faceValue: product.faceValue,
    faceCurrency: product.faceCurrency,
    quantity,
    unitAmountMinor: product.saleAmountMinor,
    totalAmountMinor: product.saleAmountMinor * quantity,
    currency: "XOF" as const,
  }));

  const reservedIds: string[] = [];
  const provisionalExpiry = new Date(Date.now() + 35 * 60 * 1000 + RESERVATION_GRACE_MS);

  try {
    for (const { product, quantity } of lineProducts) {
      const ids = await store.reserveInventory(product.id, quantity, orderId, provisionalExpiry);
      reservedIds.push(...ids);
    }

    const successUrl = `${env.APP_BASE_URL}/paiement/traitement?ref=${publicReference}`;
    const errorUrl = `${env.APP_BASE_URL}/paiement/echec?ref=${publicReference}`;

    const session = await provider.createCheckoutSession({
      amount: toWaveAmountString(total.amountMinor),
      currency: "XOF",
      successUrl,
      errorUrl,
      clientReference: publicReference,
      restrictPayerMobile: input.customerPhoneE164,
    });

    const reservationExpiresAt = new Date(
      new Date(session.whenExpires).getTime() + RESERVATION_GRACE_MS,
    );

    const order: OrderRow = {
      id: orderId,
      publicReference,
      userId,
      customerFullName: input.customerFullName,
      customerEmail: input.customerEmail,
      customerPhoneE164: input.customerPhoneE164,
      subtotalAmountMinor: total.amountMinor,
      totalAmountMinor: total.amountMinor,
      currency: "XOF",
      status: "pending_payment",
      idempotencyKey,
      reservationExpiresAt,
      paidAt: null,
      fulfilledAt: null,
      createdAt: new Date(),
    };

    const payment: PaymentRow = {
      id: randomUUID(),
      orderId,
      provider: provider.name,
      providerCheckoutSessionId: session.id,
      providerTransactionId: null,
      clientReference: publicReference,
      expectedAmountMinor: total.amountMinor,
      expectedCurrency: "XOF",
      status: "session_open",
      whenExpires: new Date(session.whenExpires),
      waveLaunchUrl: session.waveLaunchUrl,
    };

    await store.createCheckoutBundle({
      order,
      items,
      payment,
      reservedInventoryIds: reservedIds,
    });

    return {
      publicReference,
      status: order.status,
      waveLaunchUrl: session.waveLaunchUrl,
      totalAmountMinor: total.amountMinor,
      currency: "XOF" as const,
      accessToken: await issueOrderAccessToken(store, env, orderId, accessTtlMs),
      reused: false,
    };
  } catch (err) {
    await store.releaseReservation(orderId);
    throw err;
  }
}

export async function validateCart(store: Store, items: Array<{ productPublicId: string; quantity: number }>) {
  const lines = [];
  for (const item of items) {
    const product = await store.getProductByPublicId(item.productPublicId);
    if (!product || !product.isActive) {
      throw Object.assign(new Error("PRODUCT_NOT_FOUND"), { code: "PRODUCT_NOT_FOUND" });
    }
    const available = await store.countAvailable(product.id);
    const label = await store.stockLabelFor(product);
    lines.push({
      productPublicId: product.publicId,
      name: product.name,
      quantity: item.quantity,
      unitAmountMinor: product.saleAmountMinor,
      lineTotalMinor: product.saleAmountMinor * item.quantity,
      currency: "XOF" as const,
      stockLabel: label,
      canFulfill: available >= item.quantity,
    });
  }
  const total = sumLineTotals(
    lines.map((l) => ({ unitAmountMinor: l.unitAmountMinor, quantity: l.quantity })),
  );
  return { lines, totalAmountMinor: total.amountMinor, currency: "XOF" as const };
}

import { generateOpaqueToken, hashToken } from "@repo/shared";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Env } from "../config/env.js";
import type { OrderRow, Store } from "../db/store.js";
import { getMailer } from "../lib/email/index.js";
import { orderLinkEmail, orderReadyEmail, orderReviewEmail } from "../lib/email/templates.js";
import { logger } from "../lib/logger.js";
import { revealOrderCodes } from "./fulfilment.js";

const HOUR_MS = 60 * 60 * 1000;

/** Returned at checkout so the buyer's browser can open the order right after paying. */
export const CHECKOUT_ACCESS_TTL_HOURS = 24;
/** Sent in the "codes ready" email. */
export const READY_EMAIL_ACCESS_TTL_DAYS = 7;
/** Sent when the buyer asks for a new link via reference + email. */
export const LOOKUP_ACCESS_TTL_HOURS = 24;

export type OrderAccess = { order: OrderRow; via: "owner" | "token" };

export async function issueOrderAccessToken(
  store: Store,
  env: Env,
  orderId: string,
  ttlMs: number,
): Promise<string> {
  const token = generateOpaqueToken(32);
  await store.createGuestToken({
    id: randomUUID(),
    orderId,
    tokenHash: hashToken(token, env.GUEST_TOKEN_PEPPER),
    expiresAt: new Date(Date.now() + ttlMs),
    usedAt: null,
  });
  return token;
}

/** Fragment (#) keeps the token out of server logs and Referer headers. */
export function orderAccessLink(env: Env, publicReference: string, token: string): string {
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  return `${base}/commande/${encodeURIComponent(publicReference)}#t=${encodeURIComponent(token)}`;
}

/**
 * Grants access when the caller is the signed-in owner of the order, or
 * presents an unexpired access token issued for this exact order.
 */
export async function resolveOrderAccess(
  store: Store,
  env: Env,
  params: { publicReference: string; userId: string | null; token: string | null },
): Promise<OrderAccess | null> {
  const order = await store.getOrderByPublicRef(params.publicReference);
  if (!order) return null;

  if (params.userId && order.userId === params.userId) {
    return { order, via: "owner" };
  }

  if (params.token && params.token.length >= 32 && params.token.length <= 256) {
    const row = await store.findGuestToken(hashToken(params.token, env.GUEST_TOKEN_PEPPER));
    if (row && row.orderId === order.id && row.expiresAt > new Date()) {
      if (!row.usedAt) await store.markGuestTokenUsed(row.id);
      return { order, via: "token" };
    }
  }
  return null;
}

function emailsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a.trim().toLowerCase());
  const y = Buffer.from(b.trim().toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Queues a fresh access link to the order's email when reference and email
 * match. Callers always get the same answer so orders can't be enumerated.
 */
const LINK_EMAILS_PER_ORDER_PER_HOUR = 3;
const recentLinkEmails = new Map<string, number[]>();

/** Caps link emails per order so a known reference + email can't be used to flood an inbox. */
function allowLinkEmail(orderId: string): boolean {
  const now = Date.now();
  const recent = (recentLinkEmails.get(orderId) ?? []).filter((t) => now - t < HOUR_MS);
  if (recent.length >= LINK_EMAILS_PER_ORDER_PER_HOUR) {
    recentLinkEmails.set(orderId, recent);
    return false;
  }
  recent.push(now);
  recentLinkEmails.set(orderId, recent);
  return true;
}

export async function requestOrderLink(store: Store, publicReference: string, email: string): Promise<void> {
  const order = await store.getOrderByPublicRef(publicReference);
  if (!order || !emailsMatch(order.customerEmail, email)) return;
  if (!allowLinkEmail(order.id)) {
    logger.info("order_link_throttled", { orderId: order.id });
    return;
  }
  await store.enqueueOutbox({
    id: randomUUID(),
    jobType: "send_order_link",
    payload: { orderId: order.id },
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    availableAt: new Date(),
    lastError: null,
  });
}

export async function getOrderDetails(store: Store, order: OrderRow) {
  const [items, fulfilments] = await Promise.all([store.listOrderItems(order.id), store.listFulfilments(order.id)]);
  return {
    publicReference: order.publicReference,
    status: order.status,
    customerFullName: order.customerFullName,
    customerEmail: order.customerEmail,
    totalAmountMinor: order.totalAmountMinor,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
    items: items.map((item) => ({
      productPublicId: item.productPublicId,
      name: item.productName,
      platform: item.platform,
      region: item.region,
      faceValue: item.faceValue,
      faceCurrency: item.faceCurrency,
      quantity: item.quantity,
      unitAmountMinor: item.unitAmountMinor,
      totalAmountMinor: item.totalAmountMinor,
    })),
    codesAvailable: order.status === "fulfilled" ? fulfilments.length : 0,
    codesRevealed: fulfilments.some((f) => f.revealCount > 0),
  };
}

export async function revealCodesForOrder(store: Store, env: Env, access: OrderAccess, actorUserId: string | null) {
  const { order } = access;
  const [items, codes] = await Promise.all([
    store.listOrderItems(order.id),
    revealOrderCodes({ store, env, orderId: order.id }),
  ]);
  const fulfilments = await store.listFulfilments(order.id);
  const itemByFulfilment = new Map(
    fulfilments.map((f) => [f.id, items.find((i) => i.id === f.orderItemId)]),
  );
  const instructionsByProduct = new Map<string, string | null>();
  for (const item of items) {
    if (instructionsByProduct.has(item.productPublicId)) continue;
    const product = await store.getProductByPublicId(item.productPublicId);
    instructionsByProduct.set(item.productPublicId, product?.instructions ?? null);
  }

  await store.writeAudit({
    id: randomUUID(),
    actorType: access.via === "owner" ? "customer" : "guest",
    actorId: access.via === "owner" ? actorUserId : null,
    action: "order.codes_revealed",
    targetType: "order",
    targetId: order.id,
    metadataRedacted: { publicReference: order.publicReference, codes: codes.length },
    createdAt: new Date(),
  });

  return codes.map((c) => {
    const item = itemByFulfilment.get(c.fulfilmentId);
    const secret = c.secret as { code?: unknown };
    return {
      fulfilmentId: c.fulfilmentId,
      productName: item?.productName ?? "",
      platform: item?.platform ?? "",
      region: item?.region ?? "",
      code: typeof secret.code === "string" ? secret.code : "",
      maskedCode: c.maskedCode,
      revealCount: c.revealCount,
      instructions: item ? (instructionsByProduct.get(item.productPublicId) ?? null) : null,
    };
  });
}

async function loadOrderForEmail(store: Store, orderId: string) {
  const order = await store.getOrderById(orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const items = await store.listOrderItems(order.id);
  return { order, lines: items.map((i) => ({ name: i.productName, quantity: i.quantity })) };
}

export async function sendOrderReadyEmail(store: Store, env: Env, orderId: string) {
  const { order, lines } = await loadOrderForEmail(store, orderId);
  const token = await issueOrderAccessToken(store, env, order.id, READY_EMAIL_ACCESS_TTL_DAYS * 24 * HOUR_MS);
  await getMailer(env).send(
    orderReadyEmail({
      to: order.customerEmail,
      customerName: order.customerFullName,
      publicReference: order.publicReference,
      totalAmountMinor: order.totalAmountMinor,
      lines,
      link: orderAccessLink(env, order.publicReference, token),
      linkValidDays: READY_EMAIL_ACCESS_TTL_DAYS,
    }),
  );
  logger.info("email_order_ready_sent", { orderId: order.id });
}

export async function sendOrderLinkEmail(store: Store, env: Env, orderId: string) {
  const { order } = await loadOrderForEmail(store, orderId);
  const token = await issueOrderAccessToken(store, env, order.id, LOOKUP_ACCESS_TTL_HOURS * HOUR_MS);
  await getMailer(env).send(
    orderLinkEmail({
      to: order.customerEmail,
      publicReference: order.publicReference,
      link: orderAccessLink(env, order.publicReference, token),
      linkValidHours: LOOKUP_ACCESS_TTL_HOURS,
    }),
  );
  logger.info("email_order_link_sent", { orderId: order.id });
}

export async function sendOrderReviewEmail(store: Store, env: Env, orderId: string) {
  const { order } = await loadOrderForEmail(store, orderId);
  const token = await issueOrderAccessToken(store, env, order.id, READY_EMAIL_ACCESS_TTL_DAYS * 24 * HOUR_MS);
  await getMailer(env).send(
    orderReviewEmail({
      to: order.customerEmail,
      customerName: order.customerFullName,
      publicReference: order.publicReference,
      link: orderAccessLink(env, order.publicReference, token),
    }),
  );
  logger.info("email_order_review_sent", { orderId: order.id });
}

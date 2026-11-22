import {
  decryptCardSecret,
  generateOpaqueToken,
  hashToken,
  GUEST_VERIFICATION_TOKEN_TTL_MINUTES,
} from "@repo/shared";

const GUEST_TOKEN_TTL_MS = GUEST_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000;
import { randomUUID } from "node:crypto";
import type { Env } from "../config/env.js";
import type { Store } from "../db/store.js";
import type { PaymentProvider } from "../payments/types.js";
import { logger } from "../lib/logger.js";

export async function processWaveCompletedEvent(params: {
  store: Store;
  provider: PaymentProvider;
  env: Env;
  sessionId: string;
  eventId: string;
}) {
  const { store, provider, env, sessionId, eventId } = params;

  const inserted = await store.recordWebhookEvent({
    id: randomUUID(),
    provider: "wave",
    providerEventId: eventId,
    eventType: "checkout.session.completed",
    processingStatus: "received",
  });
  if (!inserted) {
    return { duplicate: true };
  }

  await store.enqueueOutbox({
    id: randomUUID(),
    jobType: "fulfil_checkout",
    payload: { sessionId, eventId },
    status: "pending",
    attempts: 0,
    maxAttempts: 10,
    availableAt: new Date(),
    lastError: null,
  });

  return { duplicate: false, queued: true, envProvider: env.PAYMENT_PROVIDER };
}

/**
 * Handles a Wave `checkout.session.payment_failed` event: marks the local
 * payment/order as failed and releases any reserved inventory so it can be
 * sold to another buyer. This never trusts the webhook payload for amounts
 * or status directly — it only uses it as a trigger to re-check state, and
 * safely no-ops if the order has already moved past the pending stage (e.g.
 * a completed-event race, or a replay after manual review).
 */
export async function processWavePaymentFailedEvent(params: {
  store: Store;
  sessionId: string;
  eventId: string;
}) {
  const { store, sessionId, eventId } = params;

  const inserted = await store.recordWebhookEvent({
    id: randomUUID(),
    provider: "wave",
    providerEventId: eventId,
    eventType: "checkout.session.payment_failed",
    processingStatus: "received",
  });
  if (!inserted) {
    return { duplicate: true, updated: false };
  }

  const payment = await store.getPaymentBySessionId(sessionId);
  if (!payment) {
    // Nothing local to update yet (e.g. session created but bundle not
    // persisted); log and ignore rather than throwing on a webhook.
    logger.warn("wave_payment_failed_unknown_session");
    return { duplicate: false, updated: false };
  }

  const order = await store.getOrderById(payment.orderId);
  if (!order) {
    logger.warn("wave_payment_failed_order_missing", { orderId: payment.orderId });
    return { duplicate: false, updated: false };
  }

  // Only move orders that are still awaiting payment into payment_failed;
  // never clobber an order that has already progressed (paid/fulfilled/etc).
  if (order.status !== "pending_payment" && order.status !== "payment_processing") {
    logger.info("wave_payment_failed_ignored_non_pending_order", {
      orderId: order.id,
      status: order.status,
    });
    return { duplicate: false, updated: false };
  }

  await store.markPaymentSession(payment.id, { status: "failed" });
  await store.updateOrderStatus(order.id, "payment_failed");
  await store.releaseReservation(order.id);

  logger.info("wave_payment_failed_processed", { orderId: order.id });
  return { duplicate: false, updated: true };
}

/**
 * Fulfils a checkout session after Wave confirms payment.
 *
 * IMPORTANT: this must only ever be invoked with a `sessionId` whose
 * payment has already been confirmed via a live provider lookup
 * (`provider.getCheckoutSession`) below — never solely from webhook/body
 * fields. The webhook (and reconciliation) only *enqueue* this job; the
 * authoritative "is it actually paid?" check happens right here via a
 * server-to-server GET against the payment provider, which re-validates
 * checkout/payment status, amount, currency, and client reference before
 * any inventory is marked sold. This makes the job idempotent (already
 * fulfilled orders short-circuit via `store.fulfilPaidOrder` returning
 * `"already"`) and safe to re-run/retry from the outbox worker.
 */
export async function runFulfilCheckoutJob(params: {
  store: Store;
  provider: PaymentProvider;
  env: Env;
  sessionId: string;
}) {
  const { store, provider, env, sessionId } = params;
  const session = await provider.getCheckoutSession(sessionId);

  if (session.checkoutStatus !== "complete" || session.paymentStatus !== "succeeded") {
    throw new Error("SESSION_NOT_PAID");
  }
  if (!session.transactionId) {
    throw new Error("MISSING_TRANSACTION_ID");
  }

  const payment = await store.getPaymentBySessionId(sessionId);
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");

  const order = await store.getOrderById(payment.orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");

  if (session.clientReference !== order.publicReference) {
    throw new Error("CLIENT_REFERENCE_MISMATCH");
  }
  if (session.amount !== String(payment.expectedAmountMinor) || session.currency !== payment.expectedCurrency) {
    throw new Error("AMOUNT_MISMATCH");
  }

  const result = await store.fulfilPaidOrder(order.id, session.transactionId);
  logger.info("fulfilment_result", { orderId: order.id, result });

  if (result === "fulfilled" || result === "manual_review") {
    await store.enqueueOutbox({
      id: randomUUID(),
      jobType: result === "fulfilled" ? "notify_order_fulfilled" : "notify_order_manual_review",
      payload: { orderId: order.id, publicReference: order.publicReference },
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
      availableAt: new Date(),
      lastError: null,
    });
  }

  return result;
}

export async function issueGuestAccessToken(store: Store, env: Env, publicReference: string, email: string) {
  const order = await store.getOrderByPublicRef(publicReference);
  if (!order || order.customerEmail.toLowerCase() !== email.toLowerCase()) {
    // Uniform response to avoid enumeration
    return { sent: true };
  }
  const token = generateOpaqueToken(32);
  const tokenHash = hashToken(token, env.GUEST_TOKEN_PEPPER);
  await store.createGuestToken({
    id: randomUUID(),
    orderId: order.id,
    tokenHash,
    expiresAt: new Date(Date.now() + GUEST_TOKEN_TTL_MS),
    usedAt: null,
  });
  // In production: email link without codes. Dev: return token once.
  logger.info("guest_token_issued", { orderId: order.id });
  return { sent: true, devToken: env.NODE_ENV === "production" ? undefined : token };
}

export async function revealOrderCodes(params: {
  store: Store;
  env: Env;
  orderId: string;
}) {
  const { store, env, orderId } = params;
  const fulfilments = await store.listFulfilments(orderId);
  const codes = [];
  for (const f of fulfilments) {
    const inv = await store.getInventory(f.inventoryId);
    if (!inv) continue;
    const secret = decryptCardSecret(
      {
        ciphertext: inv.encryptedPayload,
        iv: inv.encryptionIv,
        authTag: inv.authenticationTag,
        keyVersion: inv.encryptionKeyVersion,
      },
      env.CODE_ENCRYPTION_KEY_v1,
    );
    const revealCount = f.revealCount + 1;
    await store.recordReveal(f.id);
    codes.push({
      fulfilmentId: f.id,
      maskedCode: inv.maskedCode,
      secret,
      revealCount,
    });
  }
  return codes;
}

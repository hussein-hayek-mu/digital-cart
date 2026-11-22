import type { Env } from "../config/env.js";
import type { Store } from "../db/store.js";
import { logger } from "../lib/logger.js";
import type { PaymentProvider } from "../payments/types.js";
import { processWaveCompletedEvent } from "../services/fulfilment.js";

/** Grace before treating createdAt as stale (avoids racing fresh checkouts). */
const CREATED_STALE_GRACE_MS = 60_000;

async function expireStalePayment(store: Store, paymentId: string, orderId: string) {
  await store.updateOrderStatus(orderId, "expired");
  await store.markPaymentSession(paymentId, { status: "expired" });
  await store.releaseReservation(orderId);
}

export async function reconcileOnce(
  store: Store,
  provider: PaymentProvider,
  env: Env,
): Promise<{ checked: number; fulfilled: number; expired: number }> {
  const olderThan = new Date(Date.now() - CREATED_STALE_GRACE_MS);
  const stalePayments = await store.listStaleOpenPayments(olderThan);

  let fulfilled = 0;
  let expired = 0;

  for (const payment of stalePayments) {
    const sessionId = payment.providerCheckoutSessionId;
    try {
      const session = await provider.getCheckoutSession(sessionId);

      if (session.checkoutStatus === "complete" && session.paymentStatus === "succeeded") {
        const transactionId = session.transactionId ?? "unknown";
        const eventId = `reconcile:${sessionId}:${transactionId}`;
        const result = await processWaveCompletedEvent({
          store,
          provider,
          env,
          sessionId,
          eventId,
        });
        if (!result.duplicate) {
          fulfilled += 1;
          logger.info("reconciliation_queued_fulfilment", { sessionId, eventId });
        }
        continue;
      }

      if (session.checkoutStatus === "expired" || session.paymentStatus === "cancelled") {
        await expireStalePayment(store, payment.id, payment.orderId);
        expired += 1;
        logger.info("reconciliation_expired_session", { sessionId });
      }
    } catch (err) {
      // Fake sessions live in memory and vanish on restart; nothing can have been paid.
      const fakeSessionLost =
        provider.name === "fake" &&
        err instanceof Error &&
        err.message === "SESSION_NOT_FOUND" &&
        payment.whenExpires !== null &&
        payment.whenExpires <= new Date();
      if (fakeSessionLost) {
        await expireStalePayment(store, payment.id, payment.orderId);
        expired += 1;
        logger.info("reconciliation_expired_lost_fake_session", { sessionId });
        continue;
      }
      logger.warn("reconciliation_session_check_failed", {
        sessionId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return { checked: stalePayments.length, fulfilled, expired };
}

export function startReconciliationWorker(params: {
  store: Store;
  provider: PaymentProvider;
  env: Env;
  intervalMs?: number;
}): () => void {
  const intervalMs = params.intervalMs ?? 60_000;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await reconcileOnce(params.store, params.provider, params.env);
    } catch (err) {
      logger.error("reconciliation_worker_tick_failed", {
        error: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => clearInterval(handle);
}

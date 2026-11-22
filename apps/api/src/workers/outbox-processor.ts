import type { Env } from "../config/env.js";
import type { Store } from "../db/store.js";
import { logger } from "../lib/logger.js";
import type { PaymentProvider } from "../payments/types.js";
import { runFulfilCheckoutJob } from "../services/fulfilment.js";
import { sendOrderLinkEmail, sendOrderReadyEmail, sendOrderReviewEmail } from "../services/order-access.js";

const DEFAULT_CLAIM_LIMIT = 10;

function requireOrderId(payload: Record<string, unknown>): string {
  const orderId = payload.orderId;
  if (typeof orderId !== "string" || !orderId) throw new Error("INVALID_PAYLOAD: missing orderId");
  return orderId;
}

export async function processOutboxOnce(
  store: Store,
  provider: PaymentProvider,
  env: Env,
): Promise<number> {
  const jobs = await store.claimOutboxJobs(DEFAULT_CLAIM_LIMIT);
  for (const job of jobs) {
    try {
      switch (job.jobType) {
        case "fulfil_checkout": {
          const sessionId = job.payload.sessionId;
          if (typeof sessionId !== "string" || !sessionId) {
            throw new Error("INVALID_PAYLOAD: missing sessionId");
          }
          await runFulfilCheckoutJob({ store, provider, env, sessionId });
          break;
        }
        case "notify_order_fulfilled":
          await sendOrderReadyEmail(store, env, requireOrderId(job.payload));
          break;
        case "notify_order_manual_review":
          await sendOrderReviewEmail(store, env, requireOrderId(job.payload));
          break;
        case "send_order_link":
          await sendOrderLinkEmail(store, env, requireOrderId(job.payload));
          break;
        default:
          throw new Error(`UNKNOWN_JOB_TYPE: ${job.jobType}`);
      }
      await store.completeOutboxJob(job.id, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      logger.warn("outbox_job_failed", { jobId: job.id, jobType: job.jobType, error: message });
      await store.completeOutboxJob(job.id, false, message);
    }
  }
  return jobs.length;
}

export function startOutboxWorker(params: {
  store: Store;
  provider: PaymentProvider;
  env: Env;
  intervalMs?: number;
}): () => void {
  const intervalMs = params.intervalMs ?? 2_000;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processOutboxOnce(params.store, params.provider, params.env);
    } catch (err) {
      logger.error("outbox_worker_tick_failed", {
        error: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  void tick();

  return () => clearInterval(handle);
}

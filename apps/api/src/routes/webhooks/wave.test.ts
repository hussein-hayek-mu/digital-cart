import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { computeWaveSignature } from "@repo/shared";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnv, type Env } from "../../config/env.js";
import { createMemoryStore } from "../../db/memory-store.js";
import type { Store } from "../../db/store.js";
import { createFakePaymentProvider } from "../../payments/fake-provider.js";
import type { PaymentProvider } from "../../payments/types.js";
import { createCheckout } from "../../services/checkout.js";
import { mountWaveWebhookRoutes } from "./wave.js";

const TEST_ENCRYPTION_KEY = "a".repeat(64);
const TEST_FINGERPRINT_PEPPER = "test-fingerprint-pepper";
const WEBHOOK_SECRET = "test-wave-webhook-secret";

function buildStore(): Store {
  return createMemoryStore({
    encryptionKey: TEST_ENCRYPTION_KEY,
    fingerprintPepper: TEST_FINGERPRINT_PEPPER,
  });
}

function buildEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    PAYMENT_PROVIDER: "fake",
    APP_BASE_URL: "http://localhost:3000",
    WAVE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...overrides,
  } as NodeJS.ProcessEnv);
}

function buildProvider(env: Env): PaymentProvider {
  return createFakePaymentProvider(env.APP_BASE_URL);
}

type TestServer = { url: string; close: () => Promise<void> };

async function startServer(store: Store, provider: PaymentProvider, env: Env): Promise<TestServer> {
  const app = express();
  mountWaveWebhookRoutes(app, { store, provider, env });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/api/v1/webhooks/wave`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function signedHeader(
  body: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const signature = computeWaveSignature(String(timestamp), body, secret);
  return `t=${timestamp},v1=${signature}`;
}

async function postWebhook(url: string, body: string, signature?: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "Wave-Signature": signature } : {}),
    },
    body,
  });
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function setupPaidCheckoutSession(store: Store, provider: PaymentProvider, env: Env) {
  const [psn] = await store.listProducts({ categorySlug: "playstation" });
  const checkout = await createCheckout({
    store,
    provider,
    env,
    input: {
      items: [{ productPublicId: psn.publicId, quantity: 1 }],
      customerFullName: "Jane Doe",
      customerEmail: "jane@example.com",
      customerPhoneE164: "+221771234567",
    },
    idempotencyKey: `wave-webhook-test-${randomUUID()}`,
    userId: null,
  });
  const order = await store.getOrderByPublicRef(checkout.publicReference);
  const payment = await store.getPaymentByOrderId(order!.id);
  await provider.completeSessionForTest!(
    payment!.providerCheckoutSessionId,
    `TXN_${randomUUID().slice(0, 8)}`,
  );
  return { order: order!, payment: payment! };
}

describe("POST /api/v1/webhooks/wave", () => {
  let store: Store;
  let env: Env;
  let provider: PaymentProvider;
  let server: TestServer;

  beforeEach(async () => {
    store = buildStore();
    env = buildEnv();
    provider = buildProvider(env);
    server = await startServer(store, provider, env);
  });

  afterEach(async () => {
    await server.close();
  });

  it("accepts a validly signed checkout.session.completed webhook, enqueues fulfilment, and returns 200", async () => {
    const { payment } = await setupPaidCheckoutSession(store, provider, env);
    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "checkout.session.completed",
      data: { id: payment.providerCheckoutSessionId },
    });

    const res = await postWebhook(server.url, body, signedHeader(body, WEBHOOK_SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    // Downstream enqueue happens fire-and-forget after the ack; give it a tick.
    await wait(30);

    const jobs = await store.claimOutboxJobs(10);
    const fulfilJob = jobs.find((j) => j.jobType === "fulfil_checkout");
    expect(fulfilJob).toBeDefined();
    expect(fulfilJob?.payload.sessionId).toBe(payment.providerCheckoutSessionId);
  });

  it("rejects a webhook with a bad signature with 403", async () => {
    const body = JSON.stringify({
      id: "evt_bad_sig",
      type: "checkout.session.completed",
      data: { id: "cos-does-not-matter" },
    });

    const res = await postWebhook(server.url, body, signedHeader(body, "totally-wrong-secret"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "INVALID_SIGNATURE" } });
  });

  it("rejects a webhook with an expired timestamp with 403", async () => {
    const body = JSON.stringify({
      id: "evt_expired",
      type: "checkout.session.completed",
      data: { id: "cos-does-not-matter" },
    });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes old > 5 min skew

    const res = await postWebhook(server.url, body, signedHeader(body, WEBHOOK_SECRET, staleTimestamp));

    expect(res.status).toBe(403);
  });

  it("rejects a webhook whose body was altered after signing with 403", async () => {
    const originalBody = JSON.stringify({
      id: "evt_altered",
      type: "checkout.session.completed",
      data: { id: "cos-original" },
    });
    const signature = signedHeader(originalBody, WEBHOOK_SECRET);
    const tamperedBody = JSON.stringify({
      id: "evt_altered",
      type: "checkout.session.completed",
      data: { id: "cos-hijacked" },
    });

    const res = await postWebhook(server.url, tamperedBody, signature);

    expect(res.status).toBe(403);
  });

  it("dedupes a duplicate event id and does not enqueue fulfilment twice", async () => {
    const { payment } = await setupPaidCheckoutSession(store, provider, env);
    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "checkout.session.completed",
      data: { id: payment.providerCheckoutSessionId },
    });

    const first = await postWebhook(server.url, body, signedHeader(body, WEBHOOK_SECRET));
    expect(first.status).toBe(200);
    await wait(30);

    const jobsAfterFirst = await store.claimOutboxJobs(10);
    const fulfilJobsAfterFirst = jobsAfterFirst.filter((j) => j.jobType === "fulfil_checkout");
    expect(fulfilJobsAfterFirst).toHaveLength(1);
    // Drain the claimed job so a second real job (if wrongly created) would
    // be freely claimable below.
    for (const job of fulfilJobsAfterFirst) {
      await store.completeOutboxJob(job.id, true);
    }

    const second = await postWebhook(server.url, body, signedHeader(body, WEBHOOK_SECRET));
    // Still ack 200 quickly — dedup happens internally, not via a different
    // HTTP status, so Wave doesn't treat this as a delivery failure.
    expect(second.status).toBe(200);
    await wait(30);

    const jobsAfterSecond = await store.claimOutboxJobs(10);
    expect(jobsAfterSecond.filter((j) => j.jobType === "fulfil_checkout")).toHaveLength(0);
  });

  it("accepts an unsigned webhook only when PAYMENT_PROVIDER=fake and not production", async () => {
    const devStore = buildStore();
    const devEnv = buildEnv({ WAVE_WEBHOOK_SECRET: "" });
    const devProvider = buildProvider(devEnv);
    const devServer = await startServer(devStore, devProvider, devEnv);
    try {
      const body = JSON.stringify({
        id: `evt_${randomUUID()}`,
        type: "checkout.session.completed",
        data: { id: "cos-dev-fake" },
      });
      const res = await postWebhook(devServer.url, body);
      expect(res.status).toBe(200);
    } finally {
      await devServer.close();
    }
  });

  it("marks the order payment_failed and releases inventory on checkout.session.payment_failed", async () => {
    const [psn] = await store.listProducts({ categorySlug: "playstation" });
    const availableBefore = await store.countAvailable(psn.id);
    const checkout = await createCheckout({
      store,
      provider,
      env,
      input: {
        items: [{ productPublicId: psn.publicId, quantity: 1 }],
        customerFullName: "Jane Doe",
        customerEmail: "jane@example.com",
        customerPhoneE164: "+221771234567",
      },
      idempotencyKey: `wave-webhook-failed-test-${randomUUID()}`,
      userId: null,
    });
    const order = await store.getOrderByPublicRef(checkout.publicReference);
    const payment = await store.getPaymentByOrderId(order!.id);

    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "checkout.session.payment_failed",
      data: { id: payment!.providerCheckoutSessionId },
    });

    const res = await postWebhook(server.url, body, signedHeader(body, WEBHOOK_SECRET));
    expect(res.status).toBe(200);
    await wait(30);

    const updatedOrder = await store.getOrderByPublicRef(checkout.publicReference);
    expect(updatedOrder?.status).toBe("payment_failed");

    const availableAfter = await store.countAvailable(psn.id);
    expect(availableAfter).toBe(availableBefore);
  });
});

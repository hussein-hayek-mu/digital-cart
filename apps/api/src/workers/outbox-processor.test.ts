import { describe, expect, it } from "vitest";
import { loadEnv, type Env } from "../config/env.js";
import { createMemoryStore } from "../db/memory-store.js";
import { createFakePaymentProvider } from "../payments/fake-provider.js";
import type { PaymentProvider } from "../payments/types.js";
import { createCheckout } from "../services/checkout.js";
import { processWaveCompletedEvent } from "../services/fulfilment.js";
import { processOutboxOnce } from "./outbox-processor.js";

const TEST_ENCRYPTION_KEY = "a".repeat(64);
const TEST_FINGERPRINT_PEPPER = "test-fingerprint-pepper";

function buildStore() {
  return createMemoryStore({
    encryptionKey: TEST_ENCRYPTION_KEY,
    fingerprintPepper: TEST_FINGERPRINT_PEPPER,
  });
}

function buildEnv(): Env {
  return loadEnv({
    NODE_ENV: "test",
    PAYMENT_PROVIDER: "fake",
    APP_BASE_URL: "http://localhost:3000",
  } as NodeJS.ProcessEnv);
}

function buildProvider(env: Env): PaymentProvider {
  return createFakePaymentProvider(env.APP_BASE_URL);
}

describe("outbox processor", () => {
  it("processes a fulfil_checkout job and fulfils the order", async () => {
    const store = buildStore();
    const env = buildEnv();
    const provider = buildProvider(env);
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
      idempotencyKey: "test-outbox-fulfil-key-001",
      userId: null,
    });

    const order = await store.getOrderByPublicRef(checkout.publicReference);
    const payment = await store.getPaymentByOrderId(order!.id);
    expect(payment).not.toBeNull();

    await provider.completeSessionForTest!(payment!.providerCheckoutSessionId, "TXN_OUTBOX_1");

    await processWaveCompletedEvent({
      store,
      provider,
      env,
      sessionId: payment!.providerCheckoutSessionId,
      eventId: "evt_outbox_test_1",
    });

    const processed = await processOutboxOnce(store, provider, env);
    expect(processed).toBeGreaterThanOrEqual(1);

    const fulfilledOrder = await store.getOrderByPublicRef(checkout.publicReference);
    expect(fulfilledOrder?.status).toBe("fulfilled");
    expect(fulfilledOrder?.paidAt).not.toBeNull();
    expect(fulfilledOrder?.fulfilledAt).not.toBeNull();

    const fulfilments = await store.listFulfilments(order!.id);
    expect(fulfilments).toHaveLength(1);
  });
});

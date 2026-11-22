import { describe, expect, it } from "vitest";
import { loadEnv, type Env } from "../config/env.js";
import { createMemoryStore } from "../db/memory-store.js";
import { createFakePaymentProvider } from "../payments/fake-provider.js";
import type { PaymentProvider } from "../payments/types.js";
import { createCheckout } from "./checkout.js";
import { runFulfilCheckoutJob } from "./fulfilment.js";

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

function customerFields(overrides: Partial<{
  customerFullName: string;
  customerEmail: string;
  customerPhoneE164: string;
}> = {}) {
  return {
    customerFullName: "Jane Doe",
    customerEmail: "jane@example.com",
    customerPhoneE164: "+221771234567",
    ...overrides,
  };
}

function idemKey(suffix: string): string {
  return `test-idempotency-key-${suffix}`;
}

describe("checkout service", () => {
  it("reserves inventory for a successful checkout", async () => {
    const store = buildStore();
    const env = buildEnv();
    const provider = buildProvider(env);
    const [psn] = await store.listProducts({ categorySlug: "playstation" });
    const availableBefore = await store.countAvailable(psn.id);

    const result = await createCheckout({
      store,
      provider,
      env,
      input: {
        items: [{ productPublicId: psn.publicId, quantity: 1 }],
        ...customerFields(),
      },
      idempotencyKey: idemKey("basic"),
      userId: null,
    });

    expect(result.status).toBe("pending_payment");
    expect(result.reused).toBe(false);
    expect(result.totalAmountMinor).toBe(psn.saleAmountMinor);
    expect(result.currency).toBe("XOF");
    expect(result.waveLaunchUrl).toContain("paiement/fake");

    const availableAfter = await store.countAvailable(psn.id);
    expect(availableAfter).toBe(availableBefore - 1);

    const order = await store.getOrderByPublicRef(result.publicReference);
    expect(order?.status).toBe("pending_payment");
    expect(order?.totalAmountMinor).toBe(psn.saleAmountMinor);

    const payment = await store.getPaymentByOrderId(order!.id);
    expect(payment?.status).toBe("session_open");
    expect(payment?.expectedAmountMinor).toBe(psn.saleAmountMinor);
  });

  it("returns the same order when the same Idempotency-Key is reused", async () => {
    const store = buildStore();
    const env = buildEnv();
    const provider = buildProvider(env);
    const [psn] = await store.listProducts({ categorySlug: "playstation" });
    const key = idemKey("dup");
    const input = {
      items: [{ productPublicId: psn.publicId, quantity: 1 }],
      ...customerFields(),
    };

    const first = await createCheckout({ store, provider, env, input, idempotencyKey: key, userId: null });
    const availableAfterFirst = await store.countAvailable(psn.id);

    const second = await createCheckout({ store, provider, env, input, idempotencyKey: key, userId: null });

    expect(second.publicReference).toBe(first.publicReference);
    expect(second.reused).toBe(true);
    expect(second.totalAmountMinor).toBe(first.totalAmountMinor);

    // No additional inventory should be consumed on the replayed request.
    const availableAfterSecond = await store.countAvailable(psn.id);
    expect(availableAfterSecond).toBe(availableAfterFirst);
  });

  it("rejects checkout with INSUFFICIENT_STOCK when stock cannot cover the order", async () => {
    const store = buildStore();
    const env = buildEnv();
    const provider = buildProvider(env);
    const [steam] = await store.listProducts({ categorySlug: "steam" });
    const availableBefore = await store.countAvailable(steam.id);

    await expect(
      createCheckout({
        store,
        provider,
        env,
        input: {
          items: [{ productPublicId: steam.publicId, quantity: availableBefore + 1 }],
          ...customerFields(),
        },
        idempotencyKey: idemKey("oos"),
        userId: null,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    // The failed attempt must not leak a partial reservation.
    const availableAfter = await store.countAvailable(steam.id);
    expect(availableAfter).toBe(availableBefore);
  });

  it("fulfils the order and marks inventory sold after a fake payment completes", async () => {
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
        ...customerFields(),
      },
      idempotencyKey: idemKey("fulfil"),
      userId: null,
    });

    const order = await store.getOrderByPublicRef(checkout.publicReference);
    const payment = await store.getPaymentByOrderId(order!.id);
    expect(payment).not.toBeNull();

    await provider.completeSessionForTest!(payment!.providerCheckoutSessionId, "TXN_TEST_1");

    const result = await runFulfilCheckoutJob({
      store,
      provider,
      env,
      sessionId: payment!.providerCheckoutSessionId,
    });

    expect(result).toBe("fulfilled");

    const fulfilledOrder = await store.getOrderByPublicRef(checkout.publicReference);
    expect(fulfilledOrder?.status).toBe("fulfilled");
    expect(fulfilledOrder?.paidAt).not.toBeNull();
    expect(fulfilledOrder?.fulfilledAt).not.toBeNull();

    const fulfilments = await store.listFulfilments(order!.id);
    expect(fulfilments).toHaveLength(1);

    const inv = await store.getInventory(fulfilments[0].inventoryId);
    expect(inv?.status).toBe("sold");
    expect(inv?.soldOrderItemId).not.toBeNull();
  });

  it("only allows one of two concurrent buyers to reserve the last unit(s)", async () => {
    const store = buildStore();
    const env = buildEnv();
    const provider = buildProvider(env);
    const [steam] = await store.listProducts({ categorySlug: "steam" });
    const totalAvailable = await store.countAvailable(steam.id);
    expect(totalAvailable).toBeGreaterThan(0);

    const makeRequest = (suffix: string) =>
      createCheckout({
        store,
        provider,
        env,
        input: {
          items: [{ productPublicId: steam.publicId, quantity: totalAvailable }],
          ...customerFields({ customerEmail: `buyer-${suffix}@example.com` }),
        },
        idempotencyKey: idemKey(`race-${suffix}`),
        userId: null,
      });

    const results = await Promise.allSettled([makeRequest("a"), makeRequest("b")]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one of the two concurrent last-item buyers wins the race; the
    // other must be turned away rather than allowed to oversell inventory.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });

    const availableAfter = await store.countAvailable(steam.id);
    expect(availableAfter).toBe(0);
  });
});

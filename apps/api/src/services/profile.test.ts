import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../db/memory-store.js";
import {
  getOrCreateProfile,
  listUserOrderSummaries,
  updateProfile,
} from "./profile.js";

const TEST_ENCRYPTION_KEY = "a".repeat(64);
const TEST_FINGERPRINT_PEPPER = "test-fingerprint-pepper";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function buildStore() {
  return createMemoryStore({
    encryptionKey: TEST_ENCRYPTION_KEY,
    fingerprintPepper: TEST_FINGERPRINT_PEPPER,
  });
}

describe("profile service", () => {
  it("creates a profile from userId and email when missing", async () => {
    const store = buildStore();
    const profile = await getOrCreateProfile(store, USER_ID, "user@example.com");

    expect(profile).toEqual({
      id: USER_ID,
      fullName: null,
      email: "user@example.com",
      phoneE164: null,
    });
  });

  it("returns an existing profile without overwriting email", async () => {
    const store = buildStore();
    await store.upsertProfile({
      id: USER_ID,
      fullName: "Mahdi",
      email: "stored@example.com",
      phoneE164: "+221771234567",
    });

    const profile = await getOrCreateProfile(store, USER_ID, "jwt@example.com");
    expect(profile.email).toBe("stored@example.com");
    expect(profile.fullName).toBe("Mahdi");
  });

  it("updates only fullName and phoneE164", async () => {
    const store = buildStore();
    await store.upsertProfile({
      id: USER_ID,
      fullName: null,
      email: "stored@example.com",
      phoneE164: null,
    });

    const updated = await updateProfile(store, USER_ID, {
      fullName: "Mahdi Store",
      phoneE164: "+221771234567",
    });

    expect(updated).toEqual({
      id: USER_ID,
      fullName: "Mahdi Store",
      email: "stored@example.com",
      phoneE164: "+221771234567",
    });
  });

  it("lists order summaries for the authenticated user", async () => {
    const store = buildStore();
    const createdAt = new Date("2026-03-22T10:00:00.000Z");

    await store.createCheckoutBundle({
      order: {
        id: "22222222-2222-4222-8222-222222222222",
        publicReference: "ORD-TEST-001",
        userId: USER_ID,
        customerFullName: "Mahdi",
        customerEmail: "user@example.com",
        customerPhoneE164: "+221771234567",
        subtotalAmountMinor: 8500,
        totalAmountMinor: 8500,
        currency: "XOF",
        status: "pending_payment",
        idempotencyKey: "idem-profile-test-001",
        reservationExpiresAt: null,
        paidAt: null,
        fulfilledAt: null,
        createdAt,
      },
      items: [],
      payment: {
        id: "33333333-3333-4333-8333-333333333333",
        orderId: "22222222-2222-4222-8222-222222222222",
        provider: "fake",
        providerCheckoutSessionId: "sess_test",
        providerTransactionId: null,
        clientReference: "ORD-TEST-001",
        expectedAmountMinor: 8500,
        expectedCurrency: "XOF",
        status: "created",
        whenExpires: null,
        waveLaunchUrl: null,
      },
      reservedInventoryIds: [],
    });

    const orders = await listUserOrderSummaries(store, USER_ID);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.publicReference).toBe("ORD-TEST-001");
    expect(orders[0]?.createdAt).toBe(createdAt.toISOString());
  });
});

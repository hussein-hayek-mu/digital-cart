import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../db/memory-store.js";
import { CatalogError, getProductBySlug, listCategories, listProducts, validateCart } from "./catalog.js";

const TEST_ENCRYPTION_KEY = "a".repeat(64);
const TEST_FINGERPRINT_PEPPER = "test-fingerprint-pepper";

function buildStore() {
  return createMemoryStore({
    encryptionKey: TEST_ENCRYPTION_KEY,
    fingerprintPepper: TEST_FINGERPRINT_PEPPER,
  });
}

describe("catalog service", () => {
  it("lists active categories in sort order without leaking internal ids", async () => {
    const store = buildStore();
    const categories = await listCategories(store);

    expect(categories.length).toBeGreaterThanOrEqual(2);
    expect(categories.map((c) => c.slug)).toEqual([
      "playstation",
      "steam",
      "roblox",
      "nintendo",
      "xbox",
    ]);
    for (const category of categories) {
      expect(category).not.toHaveProperty("id");
      expect(typeof category.publicId).toBe("string");
    }
  });

  it("lists products with a stock label and never a raw count or codes", async () => {
    const store = buildStore();
    const products = await listProducts(store);

    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      expect(["in_stock", "low_stock", "out_of_stock"]).toContain(product.stockLabel);
      expect(product).not.toHaveProperty("id");
      expect(product).not.toHaveProperty("categoryId");
      expect(product).not.toHaveProperty("isActive");

      const serialized = JSON.stringify(product);
      expect(serialized).not.toMatch(/PSNDEMO|STEAMDEMO/);
      expect(product).not.toHaveProperty("encryptedPayload");
      expect(product).not.toHaveProperty("codeFingerprint");
    }
  });

  it("filters products by categorySlug", async () => {
    const store = buildStore();
    const steamProducts = await listProducts(store, { categorySlug: "steam" });

    expect(steamProducts.length).toBeGreaterThan(0);
    for (const product of steamProducts) {
      expect(product.categorySlug).toBe("steam");
    }
  });

  it("filters products by free-text search", async () => {
    const store = buildStore();
    const results = await listProducts(store, { q: "steam" });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.platform.toLowerCase().includes("steam"))).toBe(true);
  });

  it("gets a single product by slug with full public fields", async () => {
    const store = buildStore();
    const product = await getProductBySlug(store, "psn-20-us");

    expect(product).not.toBeNull();
    expect(product?.platform).toBe("PlayStation");
    expect(product?.saleCurrency).toBe("XOF");
    expect(product?.stockLabel).toBe("low_stock");
  });

  it("returns null for an unknown product slug", async () => {
    const store = buildStore();
    const product = await getProductBySlug(store, "does-not-exist");
    expect(product).toBeNull();
  });

  it("validates a cart using server-side prices, ignoring any client-side amount", async () => {
    const store = buildStore();
    const psn = await getProductBySlug(store, "psn-20-us");
    expect(psn).not.toBeNull();

    const result = await validateCart(store, [
      { productPublicId: psn!.publicId, quantity: 2 },
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].unitAmountMinor).toBe(14500);
    expect(result.items[0].totalAmountMinor).toBe(29000);
    expect(result.items[0].currency).toBe("XOF");
    expect(result.subtotalAmountMinor).toBe(29000);
    expect(result.totalAmountMinor).toBe(29000);
    expect(JSON.stringify(result)).not.toMatch(/PSNDEMO|STEAMDEMO/);
  });

  it("rejects a cart line for an unknown product", async () => {
    const store = buildStore();
    await expect(
      validateCart(store, [{ productPublicId: "prd_unknown", quantity: 1 }]),
    ).rejects.toThrow(CatalogError);
  });

  it("flags lines that cannot be fully fulfilled from available stock", async () => {
    const store = buildStore();
    const products = await listProducts(store, { categorySlug: "steam" });
    const steam = products[0];

    // Seeded with only 2 codes available.
    const result = await validateCart(store, [
      { productPublicId: steam.publicId, quantity: 10 },
    ]);

    expect(result.items[0].canFulfill).toBe(false);
  });
});

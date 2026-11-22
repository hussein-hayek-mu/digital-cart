import { sumLineTotals, type StockLabel } from "@repo/shared";
import type { CategoryRow, ProductRow, Store } from "../db/store.js";

/**
 * Public catalog service (Phase 2).
 *
 * All DTOs here are the *public* shape of catalog data: internal database
 * ids are never exposed (only `publicId`/`publicId`-derived slugs), and
 * inventory is only ever surfaced as a coarse `StockLabel` — never an exact
 * count, and never actual codes/secrets.
 */

export type PublicCategory = {
  publicId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
};

export type PublicProduct = {
  publicId: string;
  slug: string;
  name: string;
  platform: string;
  region: string;
  faceValue: string;
  faceCurrency: string;
  saleAmountMinor: number;
  saleCurrency: "XOF";
  description: string | null;
  instructions: string | null;
  imageUrl: string | null;
  stockLabel: StockLabel;
  categorySlug: string;
  categoryName: string;
};

export type CartValidateLine = {
  productPublicId: string;
  productName: string;
  productSlug: string;
  quantity: number;
  unitAmountMinor: number;
  totalAmountMinor: number;
  currency: "XOF";
  stockLabel: StockLabel;
  canFulfill: boolean;
};

export type CartValidateResult = {
  items: CartValidateLine[];
  subtotalAmountMinor: number;
  totalAmountMinor: number;
  currency: "XOF";
};

export class CatalogError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
  }
}

function toPublicCategory(row: CategoryRow): PublicCategory {
  return {
    publicId: row.publicId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl,
    sortOrder: row.sortOrder,
  };
}

async function toPublicProduct(
  store: Store,
  product: ProductRow,
  categoriesById: Map<string, CategoryRow>,
): Promise<PublicProduct> {
  const category = categoriesById.get(product.categoryId);
  return {
    publicId: product.publicId,
    slug: product.slug,
    name: product.name,
    platform: product.platform,
    region: product.region,
    faceValue: product.faceValue,
    faceCurrency: product.faceCurrency,
    saleAmountMinor: product.saleAmountMinor,
    saleCurrency: product.saleCurrency,
    description: product.description,
    instructions: product.instructions,
    imageUrl: product.imageUrl,
    stockLabel: await store.stockLabelFor(product),
    categorySlug: category?.slug ?? "",
    categoryName: category?.name ?? "",
  };
}

async function categoriesById(store: Store): Promise<Map<string, CategoryRow>> {
  const categories = await store.listCategories();
  return new Map(categories.map((c) => [c.id, c]));
}

export async function listCategories(store: Store): Promise<PublicCategory[]> {
  const categories = await store.listCategories();
  return categories.map(toPublicCategory);
}

export async function getCategoryBySlug(
  store: Store,
  slug: string,
): Promise<PublicCategory | null> {
  const category = await store.getCategoryBySlug(slug);
  return category ? toPublicCategory(category) : null;
}

export async function listProducts(
  store: Store,
  filters?: { categorySlug?: string; q?: string },
): Promise<PublicProduct[]> {
  const [products, catMap] = await Promise.all([
    store.listProducts(filters),
    categoriesById(store),
  ]);
  return Promise.all(products.map((p) => toPublicProduct(store, p, catMap)));
}

export async function getProductBySlug(
  store: Store,
  slug: string,
): Promise<PublicProduct | null> {
  const product = await store.getProductBySlug(slug);
  if (!product) return null;
  const catMap = await categoriesById(store);
  return toPublicProduct(store, product, catMap);
}

/**
 * Validate a cart against server-side product data.
 * Never trusts client-supplied prices — always re-prices from the store.
 */
export async function validateCart(
  store: Store,
  items: Array<{ productPublicId: string; quantity: number }>,
): Promise<CartValidateResult> {
  const lines: CartValidateLine[] = [];

  for (const item of items) {
    const product = await store.getProductByPublicId(item.productPublicId);
    if (!product || !product.isActive) {
      throw new CatalogError("PRODUCT_NOT_FOUND", `Unknown product: ${item.productPublicId}`);
    }
    const [available, label] = await Promise.all([
      store.countAvailable(product.id),
      store.stockLabelFor(product),
    ]);
    const unitAmountMinor = product.saleAmountMinor;
    lines.push({
      productPublicId: product.publicId,
      productName: product.name,
      productSlug: product.slug,
      quantity: item.quantity,
      unitAmountMinor,
      totalAmountMinor: unitAmountMinor * item.quantity,
      currency: "XOF",
      stockLabel: label,
      canFulfill: available >= item.quantity,
    });
  }

  const total = sumLineTotals(
    lines.map((l) => ({ unitAmountMinor: l.unitAmountMinor, quantity: l.quantity })),
  );

  return {
    items: lines,
    subtotalAmountMinor: total.amountMinor,
    totalAmountMinor: total.amountMinor,
    currency: "XOF",
  };
}

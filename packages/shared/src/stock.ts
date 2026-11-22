import { LOW_STOCK_THRESHOLD } from "./constants.js";

export const STOCK_LABELS = ["in_stock", "low_stock", "out_of_stock"] as const;

export type StockLabel = (typeof STOCK_LABELS)[number];

/**
 * Map available inventory count to a public stock label.
 * Exact counts are not exposed to storefront clients by default.
 */
export function stockLabel(availableCount: number): StockLabel {
  if (!Number.isInteger(availableCount) || availableCount < 0) {
    throw new Error("Available count must be a non-negative integer");
  }
  if (availableCount === 0) {
    return "out_of_stock";
  }
  if (availableCount <= LOW_STOCK_THRESHOLD) {
    return "low_stock";
  }
  return "in_stock";
}

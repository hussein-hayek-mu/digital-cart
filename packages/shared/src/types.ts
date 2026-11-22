export { ORDER_STATUSES, type OrderStatus } from "./order-states.js";
export { PAYMENT_STATUSES, type PaymentStatus } from "./payment-states.js";
export { INVENTORY_STATUSES, type InventoryStatus } from "./inventory-status.js";
export { STOCK_LABELS, type StockLabel } from "./stock.js";

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
  stockLabel: import("./stock.js").StockLabel;
  categorySlug: string;
};

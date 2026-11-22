export const ORDER_STATUSES = [
  "pending_payment",
  "payment_processing",
  "paid",
  "fulfilled",
  "payment_failed",
  "expired",
  "manual_review",
  "refund_pending",
  "refunded",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Legal order status transitions (mirrors DB trigger). */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: [
    "payment_processing",
    "expired",
    "payment_failed",
    "cancelled",
  ],
  payment_processing: ["paid", "manual_review", "payment_failed"],
  paid: ["fulfilled", "manual_review", "refund_pending"],
  fulfilled: ["refund_pending"],
  payment_failed: [],
  expired: [],
  manual_review: ["fulfilled", "refund_pending"],
  refund_pending: ["refunded"],
  refunded: [],
  cancelled: [],
};

export class InvalidOrderTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Invalid order status transition from ${from} to ${to}`);
    this.name = "InvalidOrderTransitionError";
  }
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) {
    return true;
  }
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[status].length === 0;
}

export function isPaidOrderStatus(status: OrderStatus): boolean {
  return (
    status === "paid" ||
    status === "fulfilled" ||
    status === "manual_review" ||
    status === "refund_pending" ||
    status === "refunded"
  );
}

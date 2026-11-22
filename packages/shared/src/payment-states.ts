export const PAYMENT_STATUSES = [
  "created",
  "session_open",
  "succeeded",
  "failed",
  "expired",
  "refund_pending",
  "refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_TRANSITIONS: Record<
  PaymentStatus,
  readonly PaymentStatus[]
> = {
  created: ["session_open", "failed", "expired"],
  session_open: ["succeeded", "failed", "expired"],
  succeeded: ["refund_pending"],
  failed: [],
  expired: [],
  refund_pending: ["refunded"],
  refunded: [],
};

export class InvalidPaymentTransitionError extends Error {
  constructor(
    public readonly from: PaymentStatus,
    public readonly to: PaymentStatus,
  ) {
    super(`Invalid payment status transition from ${from} to ${to}`);
    this.name = "InvalidPaymentTransitionError";
  }
}

export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  if (from === to) {
    return true;
  }
  return PAYMENT_STATUS_TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): void {
  if (!canTransitionPayment(from, to)) {
    throw new InvalidPaymentTransitionError(from, to);
  }
}

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return PAYMENT_STATUS_TRANSITIONS[status].length === 0;
}

export function isSuccessfulPaymentStatus(status: PaymentStatus): boolean {
  return (
    status === "succeeded" ||
    status === "refund_pending" ||
    status === "refunded"
  );
}

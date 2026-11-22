export type CheckoutSessionInput = {
  amount: string;
  currency: string;
  successUrl: string;
  errorUrl: string;
  clientReference: string;
  restrictPayerMobile: string;
};

export type CheckoutSession = {
  id: string;
  amount: string;
  currency: string;
  checkoutStatus: "open" | "complete" | "expired";
  paymentStatus: "processing" | "cancelled" | "succeeded";
  clientReference: string;
  waveLaunchUrl: string;
  transactionId: string | null;
  whenExpires: string;
  successUrl: string;
  errorUrl: string;
};

export interface PaymentProvider {
  readonly name: string;
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession>;
  getCheckoutSession(id: string): Promise<CheckoutSession>;
  expireCheckoutSession(id: string): Promise<void>;
  refundCheckoutSession(id: string): Promise<void>;
  /** Test helper for fake provider */
  completeSessionForTest?(id: string, transactionId: string): Promise<void>;
}

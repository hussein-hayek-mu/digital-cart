import { randomBytes } from "node:crypto";
import type { CheckoutSession, CheckoutSessionInput, PaymentProvider } from "./types.js";

export function createFakePaymentProvider(appBaseUrl: string): PaymentProvider {
  const sessions = new Map<string, CheckoutSession>();

  return {
    name: "fake",
    async createCheckoutSession(input: CheckoutSessionInput) {
      const id = `cos-fake-${randomBytes(6).toString("hex")}`;
      const whenExpires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const session: CheckoutSession = {
        id,
        amount: input.amount,
        currency: input.currency,
        checkoutStatus: "open",
        paymentStatus: "processing",
        clientReference: input.clientReference,
        waveLaunchUrl: `${appBaseUrl}/paiement/fake?session=${id}&ref=${encodeURIComponent(input.clientReference)}`,
        transactionId: null,
        whenExpires,
        successUrl: input.successUrl,
        errorUrl: input.errorUrl,
      };
      sessions.set(id, session);
      return session;
    },
    async getCheckoutSession(id: string) {
      const s = sessions.get(id);
      if (!s) throw new Error("SESSION_NOT_FOUND");
      return s;
    },
    async expireCheckoutSession(id: string) {
      const s = sessions.get(id);
      if (!s) return;
      if (s.checkoutStatus === "complete") throw new Error("CONFLICT");
      s.checkoutStatus = "expired";
      s.paymentStatus = "cancelled";
    },
    async refundCheckoutSession(id: string) {
      const s = sessions.get(id);
      if (!s) throw new Error("SESSION_NOT_FOUND");
      // idempotent success
    },
    async completeSessionForTest(id: string, transactionId: string) {
      const s = sessions.get(id);
      if (!s) throw new Error("SESSION_NOT_FOUND");
      s.checkoutStatus = "complete";
      s.paymentStatus = "succeeded";
      s.transactionId = transactionId;
    },
  };
}

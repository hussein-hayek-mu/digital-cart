import { createHmac } from "node:crypto";
import type { Env } from "../config/env.js";
import type { CheckoutSession, CheckoutSessionInput, PaymentProvider } from "./types.js";

/**
 * Official Wave Checkout API adapter.
 * Docs: https://docs.wave.com/checkout
 * Base: https://api.wave.com
 *
 * Do not enable PAYMENT_PROVIDER=wave until merchant eligibility,
 * credentials, currency, and static egress IP are confirmed.
 */
export function createWavePaymentProvider(env: Env): PaymentProvider {
  if (!env.WAVE_API_KEY) {
    throw new Error("WAVE_API_KEY required when PAYMENT_PROVIDER=wave");
  }

  const base = env.WAVE_API_BASE_URL.replace(/\/$/, "");
  const apiKey = env.WAVE_API_KEY;
  const signingSecret = env.WAVE_SIGNING_SECRET;

  async function waveFetch(path: string, init: RequestInit & { rawBody?: string } = {}) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    const body = init.rawBody ?? (typeof init.body === "string" ? init.body : undefined);
    if (body !== undefined && signingSecret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", signingSecret)
        .update(String(timestamp) + body, "utf8")
        .digest("hex");
      headers["Wave-Signature"] = `t=${timestamp},v1=${signature}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(`${base}${path}`, { ...init, headers, body });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Wave API ${res.status}: ${text.slice(0, 200)}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function mapSession(raw: Record<string, unknown>): CheckoutSession {
    return {
      id: String(raw.id),
      amount: String(raw.amount),
      currency: String(raw.currency),
      checkoutStatus: raw.checkout_status as CheckoutSession["checkoutStatus"],
      paymentStatus: raw.payment_status as CheckoutSession["paymentStatus"],
      clientReference: String(raw.client_reference ?? ""),
      waveLaunchUrl: String(raw.wave_launch_url),
      transactionId: raw.transaction_id ? String(raw.transaction_id) : null,
      whenExpires: String(raw.when_expires),
      successUrl: String(raw.success_url),
      errorUrl: String(raw.error_url),
    };
  }

  return {
    name: "wave",
    async createCheckoutSession(input: CheckoutSessionInput) {
      const payload = {
        amount: input.amount,
        currency: input.currency,
        success_url: input.successUrl,
        error_url: input.errorUrl,
        client_reference: input.clientReference,
        restrict_payer_mobile: input.restrictPayerMobile,
      };
      const rawBody = JSON.stringify(payload);
      const raw = (await waveFetch("/v1/checkout/sessions", {
        method: "POST",
        rawBody,
        body: rawBody,
      })) as Record<string, unknown>;
      return mapSession(raw);
    },
    async getCheckoutSession(id: string) {
      const raw = (await waveFetch(`/v1/checkout/sessions/${id}`, {
        method: "GET",
      })) as Record<string, unknown>;
      return mapSession(raw);
    },
    async expireCheckoutSession(id: string) {
      await waveFetch(`/v1/checkout/sessions/${id}/expire`, { method: "POST", rawBody: "" });
    },
    async refundCheckoutSession(id: string) {
      // Prefer separate refund credential when available
      const refundKey = env.WAVE_REFUND_API_KEY ?? apiKey;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${refundKey}`,
        Accept: "application/json",
      };
      const res = await fetch(`${base}/v1/checkout/sessions/${id}/refund`, {
        method: "POST",
        headers,
      });
      if (!res.ok && res.status !== 200) {
        const text = await res.text();
        throw new Error(`Wave refund failed: ${res.status} ${text.slice(0, 200)}`);
      }
    },
  };
}

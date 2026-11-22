import type { Env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { createFakePaymentProvider } from "./fake-provider.js";
import { createWavePaymentProvider } from "./wave-provider.js";
import type { PaymentProvider } from "./types.js";

export function createPaymentProvider(env: Env): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "wave") {
    if (!env.WAVE_API_KEY) {
      logger.error("wave_api_key_missing", { nodeEnv: env.NODE_ENV });
      if (env.NODE_ENV === "production") {
        throw new Error("WAVE_API_KEY required when PAYMENT_PROVIDER=wave");
      }
      logger.warn("payment_provider_fallback_to_fake");
      return createFakePaymentProvider(env.APP_BASE_URL);
    }
    return createWavePaymentProvider(env);
  }
  return createFakePaymentProvider(env.APP_BASE_URL);
}

export type { PaymentProvider, CheckoutSession } from "./types.js";

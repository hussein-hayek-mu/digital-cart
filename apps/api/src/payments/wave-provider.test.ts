import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv, type Env } from "../config/env.js";
import { createWavePaymentProvider } from "./wave-provider.js";

function buildEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    PAYMENT_PROVIDER: "wave",
    WAVE_API_KEY: "test-wave-api-key",
    WAVE_API_BASE_URL: "https://api.wave.test",
    APP_BASE_URL: "http://localhost:3000",
    ...overrides,
  } as NodeJS.ProcessEnv);
}

function mockFetchOnce(response: Record<string, unknown>, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("wave payment provider (mocked fetch, no live Wave calls)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps createCheckoutSession response fields correctly and sends the expected request", async () => {
    const rawResponse = {
      id: "cos-1abcd2345",
      amount: "1000",
      currency: "XOF",
      checkout_status: "open",
      payment_status: "processing",
      client_reference: "ORDER-REF-1",
      wave_launch_url: "https://pay.wave.com/c/cos-1abcd2345",
      transaction_id: null,
      when_expires: "2026-01-01T00:00:00Z",
      success_url: "https://example.com/success",
      error_url: "https://example.com/error",
    };
    const fetchMock = mockFetchOnce(rawResponse);

    const env = buildEnv();
    const provider = createWavePaymentProvider(env);

    const session = await provider.createCheckoutSession({
      amount: "1000",
      currency: "XOF",
      successUrl: "https://example.com/success",
      errorUrl: "https://example.com/error",
      clientReference: "ORDER-REF-1",
      restrictPayerMobile: "+221771234567",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://api.wave.test/v1/checkout/sessions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-wave-api-key");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toMatchObject({
      amount: "1000",
      currency: "XOF",
      success_url: "https://example.com/success",
      error_url: "https://example.com/error",
      client_reference: "ORDER-REF-1",
      restrict_payer_mobile: "+221771234567",
    });

    expect(session).toEqual({
      id: "cos-1abcd2345",
      amount: "1000",
      currency: "XOF",
      checkoutStatus: "open",
      paymentStatus: "processing",
      clientReference: "ORDER-REF-1",
      waveLaunchUrl: "https://pay.wave.com/c/cos-1abcd2345",
      transactionId: null,
      whenExpires: "2026-01-01T00:00:00Z",
      successUrl: "https://example.com/success",
      errorUrl: "https://example.com/error",
    });
  });

  it("maps getCheckoutSession response fields correctly, including a completed transaction id", async () => {
    const rawResponse = {
      id: "cos-completed-1",
      amount: "500",
      currency: "XOF",
      checkout_status: "complete",
      payment_status: "succeeded",
      client_reference: "ORDER-REF-2",
      wave_launch_url: "https://pay.wave.com/c/cos-completed-1",
      transaction_id: "TXN_ABC123",
      when_expires: "2026-01-01T00:00:00Z",
      success_url: "https://example.com/success",
      error_url: "https://example.com/error",
    };
    mockFetchOnce(rawResponse);

    const env = buildEnv();
    const provider = createWavePaymentProvider(env);

    const session = await provider.getCheckoutSession("cos-completed-1");

    expect(session.checkoutStatus).toBe("complete");
    expect(session.paymentStatus).toBe("succeeded");
    expect(session.transactionId).toBe("TXN_ABC123");
    expect(session.clientReference).toBe("ORDER-REF-2");
  });

  it("throws when WAVE_API_KEY is missing", () => {
    const env = buildEnv({ WAVE_API_KEY: "" });
    expect(() => createWavePaymentProvider(env)).toThrow(/WAVE_API_KEY required/);
  });
});

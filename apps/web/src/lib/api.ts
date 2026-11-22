/**
 * Thin fetch client for the Phase 2 public catalog API.
 * Talks to NEXT_PUBLIC_API_URL (defaults to http://localhost:3001).
 */

export type StockLabel = "in_stock" | "low_stock" | "out_of_stock";

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

export type ApiErrorBody = {
  error: { code: string; message?: string; details?: unknown };
};

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

async function request<T>(
  path: string,
  init?: RequestInit & { cache?: RequestCache },
): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    let message: string | undefined;
    try {
      const body = (await res.json()) as Partial<ApiErrorBody>;
      code = body.error?.code ?? code;
      message = body.error?.message;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(code, res.status, message);
  }

  const body = (await res.json()) as { data: T };
  return body.data;
}

export function getCategories(): Promise<PublicCategory[]> {
  return request<PublicCategory[]>("/api/v1/categories", {
    cache: "no-store",
  });
}

export function getCategoryBySlug(
  slug: string,
): Promise<{ category: PublicCategory; products: PublicProduct[] } | null> {
  return request<{ category: PublicCategory; products: PublicProduct[] }>(
    `/api/v1/categories/${encodeURIComponent(slug)}`,
    { cache: "no-store" },
  ).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });
}

export function getProducts(filters?: {
  category?: string;
  q?: string;
}): Promise<PublicProduct[]> {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.q) params.set("q", filters.q);
  const qs = params.toString();
  return request<PublicProduct[]>(`/api/v1/products${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
  });
}

export function getProductBySlug(slug: string): Promise<PublicProduct | null> {
  return request<PublicProduct>(`/api/v1/products/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  }).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });
}

export function validateCart(
  items: Array<{ productPublicId: string; quantity: number }>,
): Promise<CartValidateResult> {
  return request<CartValidateResult>("/api/v1/cart/validate", {
    method: "POST",
    body: JSON.stringify({ items }),
    cache: "no-store",
  });
}

export type CheckoutSessionResult = {
  publicReference: string;
  status: string;
  waveLaunchUrl: string | null;
  totalAmountMinor: number;
  currency: "XOF";
  /** Lets this browser open the order (and its codes) without an account. */
  accessToken: string;
  reused: boolean;
};

export type OrderStatusResult = {
  publicReference: string;
  status: string;
  totalAmountMinor: number;
  currency: "XOF";
  paidAt: string | null;
  fulfilledAt: string | null;
};

export type CompleteFakePaymentResult = {
  ok: boolean;
  transactionId?: string;
  publicReference?: string;
  status?: string;
};

export type CheckoutCustomerInput = {
  customerFullName: string;
  customerEmail: string;
  customerPhoneE164: string;
};

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createCheckoutSession(
  items: Array<{ productPublicId: string; quantity: number }>,
  customer: CheckoutCustomerInput,
  options?: { accessToken?: string | null },
): Promise<CheckoutSessionResult> {
  const idempotencyKey = generateIdempotencyKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  };
  if (options?.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  return request<CheckoutSessionResult>("/api/v1/checkout/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      items,
      customerFullName: customer.customerFullName,
      customerEmail: customer.customerEmail,
      customerPhoneE164: customer.customerPhoneE164,
    }),
    cache: "no-store",
  });
}

export function getOrderStatus(publicRef: string): Promise<OrderStatusResult> {
  return request<OrderStatusResult>(
    `/api/v1/orders/${encodeURIComponent(publicRef)}/status`,
    { cache: "no-store" },
  );
}

export type OrderDetails = {
  publicReference: string;
  status: string;
  customerFullName: string;
  customerEmail: string;
  totalAmountMinor: number;
  currency: "XOF";
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  items: Array<{
    productPublicId: string;
    name: string;
    platform: string;
    region: string;
    faceValue: string;
    faceCurrency: string;
    quantity: number;
    unitAmountMinor: number;
    totalAmountMinor: number;
  }>;
  codesAvailable: number;
  codesRevealed: boolean;
};

export type RevealedCode = {
  fulfilmentId: string;
  productName: string;
  platform: string;
  region: string;
  code: string;
  maskedCode: string;
  revealCount: number;
  instructions: string | null;
};

export type OrderCredentials = { accessToken?: string | null; bearerToken?: string | null };

function orderHeaders(credentials: OrderCredentials): Record<string, string> {
  const headers: Record<string, string> = {};
  if (credentials.accessToken) headers["X-Order-Access-Token"] = credentials.accessToken;
  if (credentials.bearerToken) headers.Authorization = `Bearer ${credentials.bearerToken}`;
  return headers;
}

export function getOrderDetails(publicRef: string, credentials: OrderCredentials): Promise<OrderDetails> {
  return request<OrderDetails>(`/api/v1/orders/${encodeURIComponent(publicRef)}`, {
    headers: orderHeaders(credentials),
    cache: "no-store",
  });
}

export function revealOrderCodes(
  publicRef: string,
  credentials: OrderCredentials,
): Promise<{ publicReference: string; codes: RevealedCode[] }> {
  return request(`/api/v1/orders/${encodeURIComponent(publicRef)}/codes`, {
    method: "POST",
    headers: orderHeaders(credentials),
    cache: "no-store",
  });
}

export function requestOrderLink(publicReference: string, email: string): Promise<{ sent: boolean }> {
  return request<{ sent: boolean }>("/api/v1/orders/lookup", {
    method: "POST",
    body: JSON.stringify({ publicReference, email }),
    cache: "no-store",
  });
}

export function completeFakePayment(sessionId: string): Promise<CompleteFakePaymentResult> {
  return request<CompleteFakePaymentResult>("/api/v1/dev/complete-payment", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
    cache: "no-store",
  });
}

/** West African CFA franc — stored as integer minor units (no decimals). */
export const CURRENCY_CODE = "XOF" as const;

export const CURRENCY_SYMBOL = "CFA";

/** XOF has no decimal subdivision; 1 unit = 1 franc. */
export const MINOR_UNITS_PER_MAJOR = 1;

/** Public stock label threshold (inclusive). */
export const LOW_STOCK_THRESHOLD = 5;

/** How long a checkout reservation holds inventory before it is released. */
export const RESERVATION_TTL_MINUTES = 15;

/** Extra buffer added on top of the payment provider's own session expiry
 * before a reservation is considered released, to absorb clock drift and
 * webhook/job processing delays. */
export const RESERVATION_GRACE_MS = 5 * 60 * 1000;

/** How long a guest email-verification token is valid before it must be re-requested. */
export const GUEST_VERIFICATION_TOKEN_TTL_MINUTES = 15;

/** How long an authenticated guest session (post-verification) may reveal codes. */
export const GUEST_SESSION_TOKEN_TTL_MINUTES = 60;

export const API_V1_PREFIX = "/api/v1" as const;

export const API_ROUTES = {
  HEALTH: `${API_V1_PREFIX}/health`,
  READY: `${API_V1_PREFIX}/ready`,

  // Public catalog
  CATEGORIES: `${API_V1_PREFIX}/categories`,
  CATEGORY_BY_SLUG: `${API_V1_PREFIX}/categories/:slug`,
  PRODUCTS: `${API_V1_PREFIX}/products`,
  PRODUCT_BY_SLUG: `${API_V1_PREFIX}/products/:slug`,

  // Cart & checkout
  CART_VALIDATE: `${API_V1_PREFIX}/cart/validate`,
  CHECKOUT_SESSIONS: `${API_V1_PREFIX}/checkout/sessions`,

  // Orders
  ORDER_STATUS: `${API_V1_PREFIX}/orders/:publicRef/status`,

  // Guest retrieval
  GUEST_ORDER_LOOKUP: `${API_V1_PREFIX}/guest/orders/lookup`,
  GUEST_ORDER_VERIFY: `${API_V1_PREFIX}/guest/orders/verify`,
  GUEST_ORDER_CODES: `${API_V1_PREFIX}/guest/orders/:publicRef/codes`,

  // Registered customer
  ME: `${API_V1_PREFIX}/me`,
  MY_ORDERS: `${API_V1_PREFIX}/me/orders`,
  MY_ORDER_CODES: `${API_V1_PREFIX}/me/orders/:publicRef/codes`,

  // Webhooks
  WAVE_WEBHOOK: `${API_V1_PREFIX}/webhooks/wave`,

  // Admin
  ADMIN_CATEGORIES: `${API_V1_PREFIX}/admin/categories`,
  ADMIN_CATEGORY: `${API_V1_PREFIX}/admin/categories/:id`,
  ADMIN_PRODUCTS: `${API_V1_PREFIX}/admin/products`,
  ADMIN_PRODUCT: `${API_V1_PREFIX}/admin/products/:id`,
  ADMIN_INVENTORY_UPLOAD: `${API_V1_PREFIX}/admin/inventory/upload`,
  ADMIN_INVENTORY: `${API_V1_PREFIX}/admin/inventory`,
  ADMIN_ORDERS: `${API_V1_PREFIX}/admin/orders`,
  ADMIN_ORDER: `${API_V1_PREFIX}/admin/orders/:id`,
  ADMIN_ORDER_REVEAL: `${API_V1_PREFIX}/admin/orders/:id/reveal`,
  ADMIN_PAYMENTS: `${API_V1_PREFIX}/admin/payments`,
  ADMIN_REFUNDS: `${API_V1_PREFIX}/admin/refunds`,
  ADMIN_AUDIT_LOGS: `${API_V1_PREFIX}/admin/audit-logs`,
  ADMIN_MANUAL_REVIEW: `${API_V1_PREFIX}/admin/orders/:id/manual-review`,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const PAYMENT_PROVIDER = {
  WAVE: "wave",
} as const;

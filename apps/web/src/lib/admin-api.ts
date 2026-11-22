import { authRequest } from "./auth-api";

export type AdminSummary = {
  ordersToday: number;
  revenueTodayMinor: number;
  revenue30dMinor: number;
  manualReview: number;
  refundPending: number;
  lowStock: { publicId: string; name: string; available: number; threshold: number }[];
};

export type AdminCategory = { id: string; name: string; slug: string };

export type AdminProduct = {
  id: string;
  publicId: string;
  name: string;
  slug: string;
  categoryId: string;
  categoryName: string;
  platform: string;
  region: string;
  faceValue: string;
  faceCurrency: string;
  saleAmountMinor: number;
  description: string | null;
  instructions: string | null;
  isActive: boolean;
  lowStockThreshold: number;
  stock: { available: number; reserved: number; sold: number; disabled: number };
};

export type ProductInput = {
  name: string;
  categoryId: string;
  platform: string;
  region: string;
  faceValue: string;
  faceCurrency: string;
  saleAmountMinor: number;
  description: string | null;
  instructions: string | null;
  isActive: boolean;
  lowStockThreshold: number;
};

export type AdminCode = {
  id: string;
  maskedCode: string;
  status: string;
  orderReference: string | null;
  createdAt: string;
};

export type AddCodesResult = {
  added: number;
  alreadyInStock: number;
  duplicatesInInput: number;
  invalid: number;
};

export type AdminOrderSummary = {
  publicReference: string;
  status: string;
  customerFullName: string;
  customerEmail: string;
  totalAmountMinor: number;
  hasAccount: boolean;
  createdAt: string;
};

export type AdminOrderDetails = {
  order: AdminOrderSummary & { customerPhone: string; paidAt: string | null; fulfilledAt: string | null };
  items: { name: string; quantity: number; unitAmountMinor: number; totalAmountMinor: number }[];
  payment: { provider: string; status: string; transactionId: string | null; amountMinor: number } | null;
  codes: { productName: string; maskedCode: string; revealCount: number; firstRevealedAt: string | null }[];
  history: ActivityEntry[];
};

export type ActivityEntry = {
  id?: string;
  action: string;
  actorType: string;
  actorEmail: string | null;
  targetType?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const BASE = "/api/v1/admin";
const post = (body?: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export const adminApi = {
  me: (t: string) => authRequest<{ isAdmin: true; email: string | null }>(`${BASE}/me`, t),
  summary: (t: string) => authRequest<AdminSummary>(`${BASE}/summary`, t),
  categories: (t: string) => authRequest<AdminCategory[]>(`${BASE}/categories`, t),
  products: (t: string) => authRequest<AdminProduct[]>(`${BASE}/products`, t),
  product: (t: string, id: string) => authRequest<AdminProduct>(`${BASE}/products/${encodeURIComponent(id)}`, t),
  createProduct: (t: string, input: ProductInput) => authRequest<AdminProduct>(`${BASE}/products`, t, post(input)),
  updateProduct: (t: string, id: string, input: Partial<ProductInput>) =>
    authRequest<AdminProduct>(`${BASE}/products/${encodeURIComponent(id)}`, t, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  codes: (t: string, id: string) =>
    authRequest<{ product: AdminProduct; codes: AdminCode[] }>(`${BASE}/products/${encodeURIComponent(id)}/codes`, t),
  addCodes: (t: string, id: string, codes: string) =>
    authRequest<AddCodesResult>(`${BASE}/products/${encodeURIComponent(id)}/codes`, t, post({ codes })),
  setCodeDisabled: (t: string, codeId: string, disabled: boolean) =>
    authRequest<{ ok: true }>(`${BASE}/codes/${codeId}/${disabled ? "disable" : "enable"}`, t, post()),
  orders: (t: string, q: string, status: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    return authRequest<AdminOrderSummary[]>(`${BASE}/orders?${params}`, t);
  },
  order: (t: string, ref: string) => authRequest<AdminOrderDetails>(`${BASE}/orders/${encodeURIComponent(ref)}`, t),
  fulfil: (t: string, ref: string) =>
    authRequest<{ ok: true }>(`${BASE}/orders/${encodeURIComponent(ref)}/fulfil`, t, post()),
  resendLink: (t: string, ref: string) =>
    authRequest<{ ok: true }>(`${BASE}/orders/${encodeURIComponent(ref)}/resend-link`, t, post()),
  refund: (t: string, ref: string, step: "start" | "complete", note: string) =>
    authRequest<{ ok: true }>(`${BASE}/orders/${encodeURIComponent(ref)}/refund`, t, post({ step, note })),
  activity: (t: string, all: boolean) => authRequest<ActivityEntry[]>(`${BASE}/activity${all ? "?all=1" : ""}`, t),
};

const ACTION_LABELS: Record<string, string> = {
  "product.created": "Produit créé",
  "product.updated": "Produit modifié",
  "inventory.added": "Codes ajoutés",
  "inventory.disabled": "Code désactivé",
  "inventory.enabled": "Code réactivé",
  "order.codes_revealed": "Codes affichés",
  "order.fulfilled_by_admin": "Commande livrée manuellement",
  "order.link_resent": "Lien de commande renvoyé",
  "order.refund_started": "Remboursement démarré",
  "order.refunded": "Remboursement terminé",
};

export function activityLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const ACTOR_LABELS: Record<string, string> = {
  admin: "Admin",
  customer: "Client",
  guest: "Invité",
  system: "Système",
  webhook: "Paiement",
};

export function actorLabel(entry: Pick<ActivityEntry, "actorType" | "actorEmail">): string {
  return entry.actorEmail ?? ACTOR_LABELS[entry.actorType] ?? entry.actorType;
}

const ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Ce compte n’a pas accès à l’espace admin.",
  NOT_FOUND: "Élément introuvable.",
  NO_CODES: "Aucun code valide trouvé dans le texte collé.",
  TOO_MANY_CODES: "Maximum 500 codes par envoi.",
  CODE_NOT_CHANGEABLE: "Ce code ne peut plus être modifié (déjà réservé ou vendu).",
  INSUFFICIENT_STOCK: "Stock insuffisant pour livrer cette commande. Ajoutez des codes puis réessayez.",
  ORDER_NOT_IN_REVIEW: "Cette commande n’est plus en vérification.",
  INVALID_ORDER_STATUS: "Action impossible pour le statut actuel de la commande.",
  VALIDATION_ERROR: "Vérifiez les champs du formulaire.",
  CATEGORY_NOT_FOUND: "Catégorie introuvable.",
  ADMIN_REQUIRES_DATABASE: "L’espace admin nécessite la base de données.",
};

export function adminErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  return (code && ERROR_MESSAGES[code]) || "Une erreur est survenue. Réessayez.";
}

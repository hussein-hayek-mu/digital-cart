import type { StockLabel } from "./api";

/** Format integer XOF minor units for display (e.g. 14500 → "14 500 FCFA"). */
export function formatXOF(amountMinor: number): string {
  return `${amountMinor.toLocaleString("fr-FR")} FCFA`;
}

export function stockLabelText(label: StockLabel): string {
  switch (label) {
    case "in_stock":
      return "En stock";
    case "low_stock":
      return "Stock limité";
    case "out_of_stock":
      return "Épuisé";
    default:
      return "";
  }
}

export function stockLabelTone(label: StockLabel): "ok" | "warn" | "danger" {
  switch (label) {
    case "in_stock":
      return "ok";
    case "low_stock":
      return "warn";
    case "out_of_stock":
      return "danger";
    default:
      return "ok";
  }
}

/** Face value + currency for display (e.g. "20 USD"). */
export function formatFaceValue(faceValue: string, faceCurrency: string): string {
  return `${faceValue} ${faceCurrency}`;
}

const REGION_LABELS: Record<string, string> = {
  US: "États-Unis",
  USA: "États-Unis",
  UK: "Royaume-Uni",
  EU: "Europe",
  Europe: "Europe",
  Global: "Monde",
  FR: "France",
  CI: "Côte d'Ivoire",
};

const ORDER_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  pending_payment: { label: "En attente de paiement", tone: "warn" },
  payment_processing: { label: "Paiement en cours", tone: "warn" },
  paid: { label: "Payée", tone: "ok" },
  fulfilled: { label: "Livrée", tone: "ok" },
  manual_review: { label: "En vérification", tone: "warn" },
  payment_failed: { label: "Paiement échoué", tone: "danger" },
  expired: { label: "Expirée", tone: "neutral" },
  cancelled: { label: "Annulée", tone: "neutral" },
  refund_pending: { label: "Remboursement en cours", tone: "warn" },
  refunded: { label: "Remboursée", tone: "neutral" },
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS[status]?.label ?? status;
}

export function orderStatusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  return ORDER_STATUS[status]?.tone ?? "neutral";
}

export function regionLabel(region: string): string {
  return REGION_LABELS[region] ?? region;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/** Short denomination shown on card artwork (e.g. "20 $", "800 Robux"). */
export function shortDenomination(faceValue: string, faceCurrency: string): {
  value: string;
  unit: string;
} {
  return { value: faceValue, unit: CURRENCY_SYMBOLS[faceCurrency] ?? faceCurrency };
}

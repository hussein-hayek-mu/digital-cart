import { randomBytes } from "node:crypto";

export function generatePublicReference(prefix = "ORD"): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export function generatePublicId(prefix = "prd"): string {
  return `${prefix}_${randomBytes(10).toString("base64url")}`;
}

export function generateIdempotencyFallback(): string {
  return `idem_${randomBytes(16).toString("base64url")}`;
}

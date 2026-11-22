/**
 * API-layer crypto re-exports.
 * Node-only — not imported by Next.js edge routes.
 */
export {
  computeWaveSignature,
  decryptCardSecret,
  encryptCardSecret,
  fingerprintCode,
  generateOpaqueToken,
  hashToken,
  loadCryptoKeyMaterial,
  maskCode,
  normalizeCode,
  timingSafeStringEqual,
  verifyWaveSignatureHeader,
  type CardSecret,
  type EncryptedCardPayload,
} from "@repo/shared";

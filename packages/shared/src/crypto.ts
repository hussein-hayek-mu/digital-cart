import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export type EncryptedCardPayload = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
};

export type CardSecret = {
  code?: string;
  serial?: string;
  pin?: string;
};

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

function parseEncryptionKey(keyMaterial: string): Buffer {
  const trimmed = keyMaterial.trim();
  const key = trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (key.length !== 32) {
    throw new CryptoError("Encryption key must be 32 bytes (AES-256)");
  }
  return key;
}

export function normalizeCode(raw: string): string {
  return raw.trim().replace(/[\s-]+/g, "").toUpperCase();
}

export function maskCode(raw: string): string {
  const normalized = raw.trim();
  if (normalized.length <= 4) {
    return "*".repeat(normalized.length || 4);
  }
  return `${"*".repeat(Math.max(4, normalized.length - 4))}${normalized.slice(-4)}`;
}

export function fingerprintCode(normalized: string, pepper: string): string {
  const pepperBuf = Buffer.from(pepper, "base64");
  const pepperKey = pepperBuf.length >= 16 ? pepperBuf : Buffer.from(pepper, "utf8");
  return createHmac("sha256", pepperKey).update(normalized, "utf8").digest("hex");
}

export function encryptCardSecret(
  secret: CardSecret,
  keyMaterial: string,
  keyVersion = 1,
): EncryptedCardPayload {
  const key = parseEncryptionKey(keyMaterial);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(secret), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new CryptoError("Unexpected GCM auth tag length");
  }
  return { ciphertext, iv, authTag, keyVersion };
}

export function decryptCardSecret(
  payload: EncryptedCardPayload,
  keyMaterial: string,
): CardSecret {
  const key = parseEncryptionKey(keyMaterial);
  const decipher = createDecipheriv(ALGO, key, payload.iv);
  decipher.setAuthTag(payload.authTag);
  const plaintext = Buffer.concat([
    decipher.update(payload.ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as CardSecret;
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** Wave webhook / request signature: HMAC-SHA256 of timestamp + rawBody */
export function computeWaveSignature(
  timestamp: string,
  rawBody: string,
  secret: string,
): string {
  return createHmac("sha256", secret).update(timestamp + rawBody, "utf8").digest("hex");
}

export function verifyWaveSignatureHeader(
  header: string,
  rawBody: string,
  secrets: string[],
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 300,
): boolean {
  const parts = header.split(",").map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith("t="));
  if (!tPart) return false;
  const timestamp = tPart.slice(2);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > maxAgeSeconds) {
    return false;
  }
  const signatures = parts
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (signatures.length === 0) return false;

  for (const secret of secrets) {
    const expected = computeWaveSignature(timestamp, rawBody, secret);
    for (const sig of signatures) {
      if (timingSafeStringEqual(expected, sig)) {
        return true;
      }
    }
  }
  return false;
}

export function hashToken(token: string, pepper: string): string {
  return fingerprintCode(token, pepper);
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Load encryption key and pepper from versioned environment variables. */
export function loadCryptoKeyMaterial(env: NodeJS.ProcessEnv = process.env): {
  encryptionKey: string;
  fingerprintPepper: string;
  keyVersion: number;
} {
  const keyVersion = Number(env.CODE_ENCRYPTION_KEY_VERSION ?? 1);
  const keyEnvName = `CODE_ENCRYPTION_KEY_v${keyVersion}`;
  const encryptionKey = env[keyEnvName];
  const fingerprintPepper = env.CODE_FINGERPRINT_PEPPER;

  if (!encryptionKey) {
    throw new CryptoError(`Missing environment variable: ${keyEnvName}`);
  }
  if (!fingerprintPepper) {
    throw new CryptoError("Missing environment variable: CODE_FINGERPRINT_PEPPER");
  }

  parseEncryptionKey(encryptionKey);
  return { encryptionKey, fingerprintPepper, keyVersion };
}

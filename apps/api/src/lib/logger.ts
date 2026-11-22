const SECRET_KEYS = [
  "code",
  "pin",
  "serial",
  "authorization",
  "password",
  "secret",
  "token",
  "ciphertext",
  "encrypted",
];

function redactValue(key: string, value: unknown): unknown {
  const lower = key.toLowerCase();
  if (SECRET_KEYS.some((s) => lower.includes(s))) {
    return "[REDACTED]";
  }
  return value;
}

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redact(v as Record<string, unknown>);
    } else {
      out[k] = redactValue(k, v);
    }
  }
  return out;
}

export const logger = {
  info(message: string, meta: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ level: "info", message, ...redact(meta) }));
  },
  warn(message: string, meta: Record<string, unknown> = {}) {
    console.warn(JSON.stringify({ level: "warn", message, ...redact(meta) }));
  },
  error(message: string, meta: Record<string, unknown> = {}) {
    console.error(JSON.stringify({ level: "error", message, ...redact(meta) }));
  },
};

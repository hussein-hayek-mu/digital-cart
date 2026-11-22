import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().optional(),
  USE_MEMORY_STORE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true" || !process.env.DATABASE_URL),
  API_PORT: z.coerce.number().default(3001),
  API_HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  API_BASE_URL: z.string().default("http://localhost:3001"),
  PAYMENT_PROVIDER: z.enum(["fake", "wave"]).default("fake"),
  WAVE_API_BASE_URL: z.string().default("https://api.wave.com"),
  WAVE_API_KEY: z.string().optional(),
  WAVE_SIGNING_SECRET: z.string().optional(),
  WAVE_WEBHOOK_SECRET: z.string().optional(),
  WAVE_WEBHOOK_SECRET_PREVIOUS: z.string().optional(),
  WAVE_REFUND_API_KEY: z.string().optional(),
  CODE_ENCRYPTION_KEY_v1: z.string().default("a".repeat(64)),
  CODE_FINGERPRINT_PEPPER: z.string().default("dev-fingerprint-pepper"),
  GUEST_TOKEN_PEPPER: z.string().default("dev-guest-pepper"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_JWT_JWKS_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  ADMIN_BOOTSTRAP_USER_ID: z.string().optional(),
  AUTH_DEV_BYPASS: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  SUPABASE_JWT_ISSUER: z.string().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["log", "resend"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Carte PSN Abidjan <onboarding@resend.dev>"),
  EMAIL_REPLY_TO: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & { USE_MEMORY_STORE: boolean };

function isValidUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Uses SUPABASE_JWT_JWKS_URL when it is a valid URL, else `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. */
function resolveJwksUrl(explicit: string | undefined, supabaseUrl: string | undefined): string | undefined {
  const trimmed = explicit?.trim();
  if (trimmed && isValidUrl(trimmed)) return trimmed;
  if (supabaseUrl && isValidUrl(supabaseUrl.trim())) {
    return `${supabaseUrl.trim().replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`;
  }
  return undefined;
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.parse(raw);
  const useMemory =
    raw.USE_MEMORY_STORE === "true" ||
    !raw.DATABASE_URL ||
    parsed.NODE_ENV === "test";
  // Supabase issues access tokens with `iss` = `${SUPABASE_URL}/auth/v1`;
  // default to that when an explicit issuer isn't configured.
  const jwtIssuer =
    parsed.SUPABASE_JWT_ISSUER ??
    (parsed.SUPABASE_URL ? `${parsed.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1` : undefined);
  // Supabase's default audience claim for authenticated users.
  const jwtAudience = parsed.SUPABASE_JWT_AUDIENCE ?? "authenticated";
  return {
    ...parsed,
    USE_MEMORY_STORE: useMemory,
    SUPABASE_JWT_JWKS_URL: resolveJwksUrl(parsed.SUPABASE_JWT_JWKS_URL, parsed.SUPABASE_URL),
    SUPABASE_JWT_ISSUER: jwtIssuer,
    SUPABASE_JWT_AUDIENCE: jwtAudience,
  };
}

/**
 * DEV/TEST-ONLY authentication bypass.
 *
 * This lets local development and automated tests exercise authenticated
 * routes without a live Supabase project by trusting a plain
 * `X-Dev-User-Id: <uuid>` header instead of verifying a real JWT.
 *
 * THIS MUST NEVER ACTIVATE IN PRODUCTION:
 *   - It is refused whenever `NODE_ENV === "production"`, even if
 *     `AUTH_DEV_BYPASS=true` is (mis)configured in that environment.
 *   - It also requires `NODE_ENV` to be exactly "development" or "test" —
 *     any other value refuses the bypass by default (fail closed).
 *
 * Do not import this module's bypass into any code path that could run
 * against production traffic.
 */
import type { Request } from "express";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DevBypassEnv = {
  NODE_ENV: string;
  AUTH_DEV_BYPASS?: boolean;
};

export type DevIdentity = {
  userId: string;
  email?: string;
};

/**
 * Returns a dev identity if — and only if — the dev bypass is explicitly
 * enabled, the environment is non-production, and the request carries a
 * well-formed `X-Dev-User-Id` header. Returns `null` in every other case,
 * including a malformed header value (fail closed rather than guessing).
 */
export function tryDevBypass(req: Request, env: DevBypassEnv): DevIdentity | null {
  // Hard stop: never allow this in production, regardless of any flag.
  if (env.NODE_ENV === "production") {
    return null;
  }
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
    return null;
  }
  if (!env.AUTH_DEV_BYPASS) {
    return null;
  }

  const devUserId = req.header("X-Dev-User-Id");
  if (!devUserId || !UUID_RE.test(devUserId.trim())) {
    return null;
  }

  const email = req.header("X-Dev-User-Email")?.trim();
  return { userId: devUserId.trim(), email: email || undefined };
}

/** True when the dev bypass could ever be reachable for this environment/config (used for logging/diagnostics only). */
export function isDevBypassConfigured(env: DevBypassEnv): boolean {
  return (
    env.NODE_ENV !== "production" &&
    (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
    Boolean(env.AUTH_DEV_BYPASS)
  );
}

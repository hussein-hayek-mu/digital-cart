/**
 * Express middleware for Supabase-authenticated routes.
 *
 * - `requireAuth`  — 401s the request unless a valid identity is
 *   established (via a verified Supabase JWT, or the dev-only bypass).
 * - `optionalAuth` — establishes an identity when possible but always
 *   calls `next()`, so anonymous/invalid-token requests still proceed.
 *
 * Neither middleware ever trusts client-supplied role/identity headers
 * directly (e.g. `X-User-Id`, `X-Role`) — the ONLY sources of identity are
 * a cryptographically verified JWT (see ./jwt.ts) or the explicit,
 * non-production dev bypass (see ./dev-auth.ts). Tokens are never logged.
 */
import { HTTP_STATUS } from "@repo/shared";
import type { NextFunction, Request, Response } from "express";
import { loadEnv } from "../../config/env.js";
import { tryDevBypass, type DevBypassEnv } from "./dev-auth.js";
import { AuthTokenError, createJwtVerifier, extractBearerToken, InvalidTokenError, type JwtVerifyFn } from "./jwt.js";
import "./types.js";

/**
 * @deprecated `Request` itself now carries `userId`/`userEmail` (see
 * ./types.ts). Kept as an alias so existing imports keep working.
 */
export type AuthenticatedRequest = Request;

/** Env slice needed to build the auth middleware; a superset of config/env.ts's `Env`. */
export type AuthEnv = {
  NODE_ENV: string;
  AUTH_DEV_BYPASS?: boolean;
  SUPABASE_JWT_JWKS_URL?: string;
  SUPABASE_JWT_ISSUER?: string;
  SUPABASE_JWT_AUDIENCE?: string;
};

export type AuthMiddlewareDeps = {
  /** Verifies a raw bearer token and returns the identity it encodes, or `null` if not configured. */
  verifyToken: JwtVerifyFn | null;
  /** Env slice that controls the dev bypass; never wire real prod env with the flag on. */
  devBypassEnv: DevBypassEnv;
};

export type AuthMiddleware = {
  requireAuth: (req: Request, res: Response, next: NextFunction) => void;
  optionalAuth: (req: Request, res: Response, next: NextFunction) => void;
};

function applyIdentity(req: Request, identity: { userId: string; email?: string }): void {
  req.userId = identity.userId;
  req.userEmail = identity.email;
}

function respondUnauthorized(res: Response, code: string): void {
  res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: { code } });
}

/** Resolves the identity for a request, or throws an `AuthTokenError` subclass. Never logs the token. */
async function authenticate(
  req: Request,
  deps: AuthMiddlewareDeps,
): Promise<{ userId: string; email?: string }> {
  const devIdentity = tryDevBypass(req, deps.devBypassEnv);
  if (devIdentity) {
    return devIdentity;
  }

  const token = extractBearerToken(req.headers.authorization);

  if (!deps.verifyToken) {
    throw new InvalidTokenError(
      "Supabase JWT verification is not configured (missing SUPABASE_JWT_JWKS_URL)",
    );
  }

  return deps.verifyToken(token);
}

/**
 * Builds a `{ requireAuth, optionalAuth }` pair from explicit dependencies.
 * Use this in tests (with a `createLocalJWKSet`-backed `verifyToken`) or
 * anywhere a route needs a differently configured verifier than the
 * process-wide default built by `configureAuth`.
 */
export function createAuthMiddleware(deps: AuthMiddlewareDeps): AuthMiddleware {
  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    authenticate(req, deps)
      .then((identity) => {
        applyIdentity(req, identity);
        next();
      })
      .catch((err: unknown) => {
        if (err instanceof AuthTokenError) {
          respondUnauthorized(res, err.code);
          return;
        }
        next(err);
      });
  };

  const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
    authenticate(req, deps)
      .then((identity) => {
        applyIdentity(req, identity);
      })
      .catch((err: unknown) => {
        if (err instanceof AuthTokenError) {
          // No/invalid/expired token is fine for optional auth — proceed anonymously.
          return;
        }
        throw err;
      })
      .then(() => next())
      .catch(next);
  };

  return { requireAuth, optionalAuth };
}

function buildMiddleware(env: AuthEnv): AuthMiddleware {
  const verifyToken = env.SUPABASE_JWT_JWKS_URL
    ? createJwtVerifier({
        jwksUrl: env.SUPABASE_JWT_JWKS_URL,
        issuer: env.SUPABASE_JWT_ISSUER,
        audience: env.SUPABASE_JWT_AUDIENCE,
      })
    : null;
  return createAuthMiddleware({
    verifyToken,
    devBypassEnv: { NODE_ENV: env.NODE_ENV, AUTH_DEV_BYPASS: env.AUTH_DEV_BYPASS },
  });
}

let singleton: AuthMiddleware | undefined;

/**
 * Call once at API startup (see index.ts) so `requireAuth`/`optionalAuth`
 * verify against the right Supabase project. Safe to skip in tests that
 * import `createAuthMiddleware` directly instead.
 */
export function configureAuth(env: AuthEnv): void {
  singleton = buildMiddleware(env);
}

function getSingleton(): AuthMiddleware {
  if (!singleton) {
    // Fall back to env-derived config so requireAuth/optionalAuth work even
    // if a call site forgot to invoke configureAuth() explicitly.
    singleton = buildMiddleware(loadEnv());
  }
  return singleton;
}

/** 401s unless the request carries a valid Supabase JWT (or a non-production dev bypass header). */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  getSingleton().requireAuth(req, res, next);
};

/** Populates `req.userId`/`req.userEmail` when possible, otherwise proceeds unauthenticated. */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  getSingleton().optionalAuth(req, res, next);
};

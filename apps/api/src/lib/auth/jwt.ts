/**
 * Supabase-issued JWT verification.
 *
 * This module ONLY ever verifies signed tokens against the Supabase JWKS
 * (via `jose`'s `createRemoteJWKSet`, which handles caching/rotation).
 * It never decodes a token without verifying its signature, expiry,
 * issuer, and (when configured) audience.
 */
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";

export type VerifiedIdentity = {
  userId: string;
  email?: string;
};

export type JwtVerifierConfig = {
  /** Supabase project JWKS endpoint, e.g. `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. */
  jwksUrl: string;
  /** Expected `iss` claim. Derived from `SUPABASE_URL` by default (see config/env.ts). */
  issuer?: string;
  /** Expected `aud` claim. Supabase defaults to `authenticated` for logged-in users. */
  audience?: string;
};

/** Base class for all auth-token errors so callers can `instanceof` narrow, or check `.code`. */
export abstract class AuthTokenError extends Error {
  abstract readonly code: "MISSING_TOKEN" | "INVALID_TOKEN" | "EXPIRED_TOKEN";
}

export class MissingTokenError extends AuthTokenError {
  readonly code = "MISSING_TOKEN" as const;
  constructor(message = "Missing bearer token") {
    super(message);
    this.name = "MissingTokenError";
  }
}

export class InvalidTokenError extends AuthTokenError {
  readonly code = "INVALID_TOKEN" as const;
  constructor(message = "Invalid token") {
    super(message);
    this.name = "InvalidTokenError";
  }
}

export class ExpiredTokenError extends AuthTokenError {
  readonly code = "EXPIRED_TOKEN" as const;
  constructor(message = "Token expired") {
    super(message);
    this.name = "ExpiredTokenError";
  }
}

/**
 * Extracts the raw JWT from an `Authorization: Bearer <token>` header.
 * Throws `MissingTokenError` for any missing/malformed/empty header —
 * never silently falls back to an unauthenticated state here so callers
 * (requireAuth vs optionalAuth) make that decision explicitly.
 */
export function extractBearerToken(authorizationHeader: string | undefined | null): string {
  if (!authorizationHeader) {
    throw new MissingTokenError();
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  const token = match?.[1]?.trim();
  if (!token) {
    throw new MissingTokenError();
  }
  return token;
}

export type JwtVerifyFn = (token: string) => Promise<VerifiedIdentity>;

/**
 * Builds a verifier function bound to a JWKS key source and expected
 * issuer/audience. Pass an explicit `getKey` (e.g. `createLocalJWKSet`) in
 * tests to avoid any network call to a real Supabase project; production
 * code should omit it so a `createRemoteJWKSet` is built from `jwksUrl`.
 */
export function createJwtVerifier(
  config: JwtVerifierConfig,
  getKey?: JWTVerifyGetKey,
): JwtVerifyFn {
  const resolvedGetKey = getKey ?? createRemoteJWKSet(new URL(config.jwksUrl));

  return async function verifyAccessToken(token: string): Promise<VerifiedIdentity> {
    if (!token) {
      throw new MissingTokenError();
    }

    try {
      const { payload } = await jwtVerify(token, resolvedGetKey, {
        issuer: config.issuer,
        audience: config.audience,
      });

      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        throw new InvalidTokenError("Token is missing a subject (sub) claim");
      }

      const email = typeof payload.email === "string" ? payload.email : undefined;

      return { userId: payload.sub, email };
    } catch (err) {
      if (err instanceof AuthTokenError) {
        throw err;
      }
      if (err instanceof joseErrors.JWTExpired) {
        throw new ExpiredTokenError();
      }
      if (err instanceof joseErrors.JOSEError) {
        // Signature mismatch, malformed token, bad issuer/audience, etc.
        // Deliberately do not include the raw token or err internals that
        // might echo attacker-controlled input; jose's message is safe
        // (claim names / reasons only).
        throw new InvalidTokenError(err.message);
      }
      throw new InvalidTokenError("Token verification failed");
    }
  };
}

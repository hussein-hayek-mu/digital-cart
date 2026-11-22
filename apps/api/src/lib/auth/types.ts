/**
 * Express `Request` augmentation for authenticated routes.
 *
 * `requireAuth` / `optionalAuth` (see ./middleware.ts) populate these fields
 * from a verified Supabase JWT (see ./jwt.ts) or, outside of production,
 * from the local dev bypass (see ./dev-auth.ts). Never set these fields from
 * any other client-supplied input (e.g. request body/query/headers) — doing
 * so would let a client impersonate another user.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Supabase auth user id (JWT `sub` claim), set once the request is authenticated. */
      userId?: string;
      /** Best-effort email claim from the JWT. Never authoritative for authorization decisions. */
      userEmail?: string;
    }
  }
}

/** Minimal shape of an authenticated identity, independent of the transport that produced it. */
export type AuthenticatedIdentity = {
  userId: string;
  userEmail?: string;
};

export {};

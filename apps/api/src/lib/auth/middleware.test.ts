import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JSONWebKeySet,
  type JWK,
} from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { createJwtVerifier, type JwtVerifyFn } from "./jwt.js";
import { createAuthMiddleware } from "./middleware.js";

const ISSUER = "https://project-ref.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const VALID_DEV_UUID = "44444444-4444-4444-8444-444444444444";

async function buildVerifier(): Promise<{
  verifyToken: JwtVerifyFn;
  privateKey: CryptoKey;
  kid: string;
}> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = (await exportJWK(publicKey)) as JWK;
  const kid = "mw-test-key";
  const jwkSet: JSONWebKeySet = { keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] };
  const jwks = createLocalJWKSet(jwkSet);
  const verifyToken = createJwtVerifier(
    { jwksUrl: "https://unused.invalid/jwks.json", issuer: ISSUER, audience: AUDIENCE },
    jwks,
  );
  return { verifyToken, privateKey, kid };
}

function signToken(
  privateKey: CryptoKey,
  kid: string,
  claims: Record<string, unknown>,
  expiresIn = "1h",
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject((claims.sub as string) ?? USER_ID)
    .setExpirationTime(expiresIn)
    .sign(privateKey);
}

function makeReq(headers: Record<string, string> = {}): Request {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: Object.fromEntries(lower),
    header(name: string) {
      return lower.get(name.toLowerCase());
    },
  } as unknown as Request;
}

function makeRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as unknown as Response["json"];
  return res;
}

/** Runs Express middleware; resolves on `next()` or when a JSON error response is sent. */
function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response,
): Promise<unknown> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      resolve(err);
    };

    const baseJson = res.json as ReturnType<typeof vi.fn>;
    res.json = vi.fn((body: unknown) => {
      baseJson(body);
      finish(undefined);
      return res;
    }) as unknown as Response["json"];

    middleware(req, res, finish as NextFunction);
  });
}

describe("requireAuth", () => {
  let verifyToken: JwtVerifyFn;
  let privateKey: CryptoKey;
  let kid: string;

  beforeAll(async () => {
    const built = await buildVerifier();
    verifyToken = built.verifyToken;
    privateKey = built.privateKey;
    kid = built.kid;
  });

  it("401s with UNAUTHORIZED-shaped error when no Authorization header is present", async () => {
    const { requireAuth } = createAuthMiddleware({
      verifyToken,
      devBypassEnv: { NODE_ENV: "test", AUTH_DEV_BYPASS: false },
    });
    const req = makeReq();
    const res = makeRes();

    const err = await run(requireAuth, req, res);

    expect(err).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: { code: "MISSING_TOKEN" } });
    expect(req.userId).toBeUndefined();
  });

  it("sets req.userId/req.userEmail and calls next() for a validly signed token", async () => {
    const { requireAuth } = createAuthMiddleware({
      verifyToken,
      devBypassEnv: { NODE_ENV: "test", AUTH_DEV_BYPASS: false },
    });
    const token = await signToken(privateKey, kid, { sub: USER_ID, email: "user@example.com" });
    const req = makeReq({ Authorization: `Bearer ${token}` });
    const res = makeRes();

    const err = await run(requireAuth, req, res);

    expect(err).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.userId).toBe(USER_ID);
    expect(req.userEmail).toBe("user@example.com");
  });

  it("401s with EXPIRED_TOKEN for an expired token", async () => {
    const { requireAuth } = createAuthMiddleware({
      verifyToken,
      devBypassEnv: { NODE_ENV: "test", AUTH_DEV_BYPASS: false },
    });
    const token = await signToken(privateKey, kid, { sub: USER_ID }, "-1h");
    const req = makeReq({ Authorization: `Bearer ${token}` });
    const res = makeRes();

    await run(requireAuth, req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: { code: "EXPIRED_TOKEN" } });
    expect(req.userId).toBeUndefined();
  });

  it("401s with INVALID_TOKEN for a token signed with the wrong key", async () => {
    const { requireAuth } = createAuthMiddleware({
      verifyToken,
      devBypassEnv: { NODE_ENV: "test", AUTH_DEV_BYPASS: false },
    });
    const { privateKey: wrongKey } = await generateKeyPair("ES256", { extractable: true });
    const token = await signToken(wrongKey, kid, { sub: USER_ID });
    const req = makeReq({ Authorization: `Bearer ${token}` });
    const res = makeRes();

    await run(requireAuth, req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: { code: "INVALID_TOKEN" } });
    expect(req.userId).toBeUndefined();
  });

  it("401s with INVALID_TOKEN for an unsigned (alg: none) token", async () => {
    const { requireAuth } = createAuthMiddleware({
      verifyToken,
      devBypassEnv: { NODE_ENV: "test", AUTH_DEV_BYPASS: false },
    });
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: USER_ID, iss: ISSUER, aud: AUDIENCE }),
    ).toString("base64url");
    const req = makeReq({ Authorization: `Bearer ${header}.${payload}.` });
    const res = makeRes();

    await run(requireAuth, req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: { code: "INVALID_TOKEN" } });
  });

  it("never trusts a client-supplied role/identity header instead of a verified token", async () => {
    const { requireAuth } = createAuthMiddleware({
      verifyToken,
      devBypassEnv: { NODE_ENV: "test", AUTH_DEV_BYPASS: false },
    });
    const req = makeReq({ "X-User-Id": USER_ID, "X-Role": "admin" });
    const res = makeRes();

    await run(requireAuth, req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(req.userId).toBeUndefined();
  });

  describe("dev bypass", () => {
    it("authenticates via X-Dev-User-Id outside production when enabled", async () => {
      const { requireAuth } = createAuthMiddleware({
        verifyToken,
        devBypassEnv: { NODE_ENV: "development", AUTH_DEV_BYPASS: true },
      });
      const req = makeReq({ "X-Dev-User-Id": VALID_DEV_UUID });
      const res = makeRes();

      const err = await run(requireAuth, req, res);

      expect(err).toBeUndefined();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.userId).toBe(VALID_DEV_UUID);
    });

    it("is blocked in production even when AUTH_DEV_BYPASS=true and the header is present", async () => {
      const { requireAuth } = createAuthMiddleware({
        verifyToken,
        devBypassEnv: { NODE_ENV: "production", AUTH_DEV_BYPASS: true },
      });
      const req = makeReq({ "X-Dev-User-Id": VALID_DEV_UUID });
      const res = makeRes();

      await run(requireAuth, req, res);

      // Falls through to real JWT verification, which fails with no Authorization header.
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: { code: "MISSING_TOKEN" } });
      expect(req.userId).toBeUndefined();
    });
  });
});

describe("optionalAuth", () => {
  let verifyToken: JwtVerifyFn;
  let privateKey: CryptoKey;
  let kid: string;

  beforeAll(async () => {
    const built = await buildVerifier();
    verifyToken = built.verifyToken;
    privateKey = built.privateKey;
    kid = built.kid;
  });

  it("proceeds without a user when no token is present", async () => {
    const { optionalAuth } = createAuthMiddleware({
      verifyToken,
      devBypassEnv: { NODE_ENV: "test", AUTH_DEV_BYPASS: false },
    });
    const req = makeReq();
    const res = makeRes();

    const err = await run(optionalAuth, req, res);

    expect(err).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.userId).toBeUndefined();
  });

  it("proceeds without a user when the token is invalid/expired, rather than failing the request", async () => {
    const { optionalAuth } = createAuthMiddleware({
      verifyToken,
      devBypassEnv: { NODE_ENV: "test", AUTH_DEV_BYPASS: false },
    });
    const token = await signToken(privateKey, kid, { sub: USER_ID }, "-1h");
    const req = makeReq({ Authorization: `Bearer ${token}` });
    const res = makeRes();

    const err = await run(optionalAuth, req, res);

    expect(err).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.userId).toBeUndefined();
  });

  it("sets the user when a valid token is present", async () => {
    const { optionalAuth } = createAuthMiddleware({
      verifyToken,
      devBypassEnv: { NODE_ENV: "test", AUTH_DEV_BYPASS: false },
    });
    const token = await signToken(privateKey, kid, { sub: USER_ID, email: "opt@example.com" });
    const req = makeReq({ Authorization: `Bearer ${token}` });
    const res = makeRes();

    const err = await run(optionalAuth, req, res);

    expect(err).toBeUndefined();
    expect(req.userId).toBe(USER_ID);
    expect(req.userEmail).toBe("opt@example.com");
  });
});

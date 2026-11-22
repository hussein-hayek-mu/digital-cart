import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JSONWebKeySet,
  type JWK,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createJwtVerifier,
  ExpiredTokenError,
  extractBearerToken,
  InvalidTokenError,
  MissingTokenError,
} from "./jwt.js";

const ISSUER = "https://project-ref.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
const USER_ID = "11111111-1111-4111-8111-111111111111";

// Never talk to a real Supabase project in tests — build our own signing key
// pair and expose it as a local JWKS via jose's createLocalJWKSet, mirroring
// exactly what createRemoteJWKSet would hand jwtVerify in production.
async function buildLocalJwks(): Promise<{
  jwks: ReturnType<typeof createLocalJWKSet>;
  privateKey: CryptoKey;
  kid: string;
}> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = (await exportJWK(publicKey)) as JWK;
  const kid = "test-key-1";
  const jwkSet: JSONWebKeySet = {
    keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }],
  };
  return { jwks: createLocalJWKSet(jwkSet), privateKey, kid };
}

async function signToken(
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

describe("createJwtVerifier", () => {
  let jwks: ReturnType<typeof createLocalJWKSet>;
  let privateKey: CryptoKey;
  let kid: string;

  beforeAll(async () => {
    const built = await buildLocalJwks();
    jwks = built.jwks;
    privateKey = built.privateKey;
    kid = built.kid;
  });

  function verifier() {
    return createJwtVerifier(
      { jwksUrl: "https://unused.invalid/jwks.json", issuer: ISSUER, audience: AUDIENCE },
      jwks,
    );
  }

  it("accepts a validly signed token from the (mocked) JWKS and extracts sub/email", async () => {
    const token = await signToken(privateKey, kid, {
      sub: USER_ID,
      email: "user@example.com",
    });

    const identity = await verifier()(token);

    expect(identity.userId).toBe(USER_ID);
    expect(identity.email).toBe("user@example.com");
  });

  it("works without an email claim present", async () => {
    const token = await signToken(privateKey, kid, { sub: USER_ID });

    const identity = await verifier()(token);

    expect(identity.userId).toBe(USER_ID);
    expect(identity.email).toBeUndefined();
  });

  it("rejects an expired token with ExpiredTokenError", async () => {
    const token = await signToken(privateKey, kid, { sub: USER_ID }, "-10s");

    await expect(verifier()(token)).rejects.toBeInstanceOf(ExpiredTokenError);
  });

  it("rejects a token signed with an unrelated key (wrong signature) with InvalidTokenError", async () => {
    const { privateKey: otherKey } = await generateKeyPair("ES256", { extractable: true });
    const token = await signToken(otherKey, kid, { sub: USER_ID });

    await expect(verifier()(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects an unsigned ('alg: none') token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: USER_ID, iss: ISSUER, aud: AUDIENCE }),
    ).toString("base64url");
    const unsignedToken = `${header}.${payload}.`;

    await expect(verifier()(unsignedToken)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects a token with the wrong issuer", async () => {
    const token = await new SignJWT({ sub: USER_ID })
      .setProtectedHeader({ alg: "ES256", kid })
      .setIssuedAt()
      .setIssuer("https://not-the-right-project.supabase.co/auth/v1")
      .setAudience(AUDIENCE)
      .setSubject(USER_ID)
      .setExpirationTime("1h")
      .sign(privateKey);

    await expect(verifier()(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects a token with the wrong audience when an audience is configured", async () => {
    const token = await new SignJWT({ sub: USER_ID })
      .setProtectedHeader({ alg: "ES256", kid })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience("some-other-audience")
      .setSubject(USER_ID)
      .setExpirationTime("1h")
      .sign(privateKey);

    await expect(verifier()(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects a token missing a subject claim", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("1h")
      .sign(privateKey);

    await expect(verifier()(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects garbage input as InvalidTokenError, never throwing an unhandled/raw error", async () => {
    await expect(verifier()("not-a-jwt-at-all")).rejects.toBeInstanceOf(InvalidTokenError);
  });
});

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed Authorization header", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the Bearer scheme", () => {
    expect(extractBearerToken("bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("throws MissingTokenError when the header is absent", () => {
    expect(() => extractBearerToken(undefined)).toThrow(MissingTokenError);
    expect(() => extractBearerToken(null)).toThrow(MissingTokenError);
  });

  it("throws MissingTokenError when the header has no scheme", () => {
    expect(() => extractBearerToken("abc.def.ghi")).toThrow(MissingTokenError);
  });

  it("throws MissingTokenError for an empty Bearer value", () => {
    expect(() => extractBearerToken("Bearer ")).toThrow(MissingTokenError);
  });
});

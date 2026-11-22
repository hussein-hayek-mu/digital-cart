import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { isDevBypassConfigured, tryDevBypass } from "./dev-auth.js";

const VALID_UUID = "33333333-3333-4333-8333-333333333333";

function makeReq(headers: Record<string, string>): Request {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    header: (name: string) => lower.get(name.toLowerCase()),
  } as unknown as Request;
}

describe("tryDevBypass", () => {
  it("returns an identity in development with the flag enabled and a valid uuid header", () => {
    const req = makeReq({ "X-Dev-User-Id": VALID_UUID, "X-Dev-User-Email": "dev@example.com" });

    const identity = tryDevBypass(req, { NODE_ENV: "development", AUTH_DEV_BYPASS: true });

    expect(identity).toEqual({ userId: VALID_UUID, email: "dev@example.com" });
  });

  it("returns an identity in test env too, without an email header", () => {
    const req = makeReq({ "X-Dev-User-Id": VALID_UUID });

    const identity = tryDevBypass(req, { NODE_ENV: "test", AUTH_DEV_BYPASS: true });

    expect(identity).toEqual({ userId: VALID_UUID, email: undefined });
  });

  it("refuses in production even when AUTH_DEV_BYPASS=true", () => {
    const req = makeReq({ "X-Dev-User-Id": VALID_UUID });

    const identity = tryDevBypass(req, { NODE_ENV: "production", AUTH_DEV_BYPASS: true });

    expect(identity).toBeNull();
  });

  it("refuses when the flag is not enabled", () => {
    const req = makeReq({ "X-Dev-User-Id": VALID_UUID });

    const identity = tryDevBypass(req, { NODE_ENV: "development", AUTH_DEV_BYPASS: false });

    expect(identity).toBeNull();
  });

  it("refuses for any NODE_ENV other than development/test, even with the flag on", () => {
    const req = makeReq({ "X-Dev-User-Id": VALID_UUID });

    const identity = tryDevBypass(req, {
      NODE_ENV: "staging",
      AUTH_DEV_BYPASS: true,
    });

    expect(identity).toBeNull();
  });

  it("refuses when the header is missing", () => {
    const req = makeReq({});

    const identity = tryDevBypass(req, { NODE_ENV: "development", AUTH_DEV_BYPASS: true });

    expect(identity).toBeNull();
  });

  it("refuses a malformed (non-uuid) dev user id", () => {
    const req = makeReq({ "X-Dev-User-Id": "not-a-uuid; DROP TABLE users;" });

    const identity = tryDevBypass(req, { NODE_ENV: "development", AUTH_DEV_BYPASS: true });

    expect(identity).toBeNull();
  });
});

describe("isDevBypassConfigured", () => {
  it("is true only for non-production envs with the flag enabled", () => {
    expect(isDevBypassConfigured({ NODE_ENV: "development", AUTH_DEV_BYPASS: true })).toBe(true);
    expect(isDevBypassConfigured({ NODE_ENV: "test", AUTH_DEV_BYPASS: true })).toBe(true);
  });

  it("is false in production regardless of the flag", () => {
    expect(isDevBypassConfigured({ NODE_ENV: "production", AUTH_DEV_BYPASS: true })).toBe(false);
  });

  it("is false when the flag is unset", () => {
    expect(isDevBypassConfigured({ NODE_ENV: "development" })).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import {
  extractBearerToken,
  optionalUser,
  requireUser,
  resetAuthCache,
  setAsymmetricKeyForTests,
  TokenExpiredError,
  verifyAccessToken,
} from "../src/auth.js";

const USER_ID = "3f2b1c44-5d6e-47a8-9b0c-1d2e3f4a5b6c";
const HS_SECRET_STRING = "test-only-symmetric-secret-long-enough-for-hs256";

function request(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

async function statusOf(run: () => Promise<unknown>): Promise<number | "no throw"> {
  try {
    await run();
    return "no throw";
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? -1;
  }
}

// --- asymmetric (ES256), the scheme this project's JWKS publishes -------------
let esPrivate: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let esPublic: Awaited<ReturnType<typeof generateKeyPair>>["publicKey"];
// --- symmetric (HS256), kept as a fallback for older Supabase projects -------
let hsSecret: Uint8Array;

beforeEach(async () => {
  resetAuthCache();
  const pair = await generateKeyPair("ES256");
  esPrivate = pair.privateKey;
  esPublic = pair.publicKey;
  // Supabase's symmetric secret is a plain string, so mirror that exactly.
  process.env.SUPABASE_JWT_SECRET = HS_SECRET_STRING;
  hsSecret = new TextEncoder().encode(HS_SECRET_STRING);
  setAsymmetricKeyForTests(esPublic);
});

afterEach(() => {
  resetAuthCache();
  delete process.env.SUPABASE_JWT_SECRET;
});

interface TokenOptions {
  sub?: string;
  isAnonymous?: boolean;
  email?: string;
  expiresIn?: string;
  algorithm?: "ES256" | "HS256";
  notBefore?: string;
}

async function mintToken({
  sub = USER_ID,
  isAnonymous = true,
  email,
  expiresIn = "1h",
  algorithm = "ES256",
  notBefore,
}: TokenOptions = {}): Promise<string> {
  let jwt = new SignJWT({
    is_anonymous: isAnonymous,
    ...(email ? { email } : {}),
    role: "authenticated",
  })
    .setProtectedHeader({ alg: algorithm })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn);
  if (notBefore) {
    jwt = jwt.setNotBefore(notBefore);
  }
  return jwt.sign(algorithm === "ES256" ? esPrivate : hsSecret);
}

describe("extractBearerToken", () => {
  it("reads a bearer token", () => {
    expect(extractBearerToken(request({ authorization: "Bearer abc.def.ghi" }))).toBe(
      "abc.def.ghi",
    );
  });

  it("returns null for a missing, blank, or non-bearer header", () => {
    expect(extractBearerToken(request())).toBe(null);
    expect(extractBearerToken(request({ authorization: "Bearer " }))).toBe(null);
    expect(extractBearerToken(request({ authorization: "Basic abc" }))).toBe(null);
    // The admin header must not be mistaken for a user token.
    expect(extractBearerToken(request({ "x-admin-token": "abc" }))).toBe(null);
  });
});

describe("verifyAccessToken", () => {
  it("accepts an asymmetric ES256 token", async () => {
    const user = await verifyAccessToken(await mintToken({ algorithm: "ES256" }));
    expect(user).toEqual({ userId: USER_ID, isAnonymous: true, email: null });
  });

  it("accepts a symmetric HS256 token when a secret is configured", async () => {
    const user = await verifyAccessToken(await mintToken({ algorithm: "HS256" }));
    expect(user?.userId).toBe(USER_ID);
  });

  it("reports an upgraded account as not anonymous, with its email", async () => {
    const user = await verifyAccessToken(
      await mintToken({ isAnonymous: false, email: "player@example.com" }),
    );
    expect(user).toEqual({
      userId: USER_ID,
      isAnonymous: false,
      email: "player@example.com",
    });
  });

  it("rejects a token signed with the wrong key", async () => {
    const other = await generateKeyPair("ES256");
    const forged = await new SignJWT({ is_anonymous: true })
      .setProtectedHeader({ alg: "ES256" })
      .setSubject(USER_ID)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(other.privateKey);
    expect(await verifyAccessToken(forged)).toBe(null);
  });

  it("refuses an unsigned token, which is the algorithm-confusion attack", async () => {
    // alg "none" with a valid-looking payload must never be accepted.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    expect(await verifyAccessToken(`${header}.${payload}.`)).toBe(null);
  });

  it("refuses an HS256 token signed with the public key material", async () => {
    // The classic confusion: presenting an asymmetric public key as an HMAC
    // secret. It must fail because the HS path only trusts the configured secret.
    const publicJwk = await exportJWK(esPublic);
    const smuggled = await new SignJWT({ is_anonymous: true })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER_ID)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(JSON.stringify(publicJwk)));
    expect(await verifyAccessToken(smuggled)).toBe(null);
  });

  it("rejects malformed input", async () => {
    expect(await verifyAccessToken("")).toBe(null);
    expect(await verifyAccessToken("not-a-jwt")).toBe(null);
    expect(await verifyAccessToken("a.b.c")).toBe(null);
  });

  it("rejects a token with no subject", async () => {
    const noSub = await new SignJWT({ is_anonymous: true })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(esPrivate);
    expect(await verifyAccessToken(noSub)).toBe(null);
  });

  it("throws TokenExpiredError for an expired token, so clients can refresh", async () => {
    const expired = await mintToken({ expiresIn: "-1s" });
    await expect(verifyAccessToken(expired)).rejects.toBeInstanceOf(TokenExpiredError);
  });

  it("rejects a token that is not valid yet", async () => {
    const notYet = await mintToken({ notBefore: "10m" });
    expect(await verifyAccessToken(notYet)).toBe(null);
  });

  it("cannot verify HS256 when no secret is configured", async () => {
    const token = await mintToken({ algorithm: "HS256" });
    delete process.env.SUPABASE_JWT_SECRET;
    expect(await verifyAccessToken(token)).toBe(null);
  });
});

describe("optionalUser", () => {
  it("returns null with no token, so anonymous play keeps working", async () => {
    expect(await optionalUser(request())).toBe(null);
  });

  it("returns null for an invalid token rather than failing the request", async () => {
    expect(await optionalUser(request({ authorization: "Bearer garbage" }))).toBe(null);
  });

  it("returns the user for a valid token", async () => {
    const token = await mintToken();
    const user = await optionalUser(request({ authorization: `Bearer ${token}` }));
    expect(user?.userId).toBe(USER_ID);
  });

  it("answers 401 for an expired token instead of silently downgrading to guest", async () => {
    const token = await mintToken({ expiresIn: "-1s" });
    expect(
      await statusOf(() => optionalUser(request({ authorization: `Bearer ${token}` }))),
    ).toBe(401);
  });
});

describe("requireUser", () => {
  it("answers 401 without a token", async () => {
    expect(await statusOf(() => requireUser(request()))).toBe(401);
  });

  it("returns the user with a valid token", async () => {
    const token = await mintToken();
    const user = await requireUser(request({ authorization: `Bearer ${token}` }));
    expect(user.userId).toBe(USER_ID);
  });
});

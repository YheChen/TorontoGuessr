import type { IncomingMessage } from "node:http";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { loadEnv } from "./env.js";
import { createHttpError } from "./http-utils.js";

loadEnv();

/**
 * Verifies Supabase access tokens so a request can be attributed to a user.
 *
 * Supabase is the identity provider only. It answers "who is this?" and nothing
 * more: this backend remains the sole reader and writer of application data,
 * using the service-role key. That boundary is what keeps the anti-cheat model
 * intact, because lobbies.rounds and challenges.rounds hold answer coordinates
 * and must never be readable by a browser.
 *
 * Both signing schemes are supported, chosen by the token's own header:
 *
 * - Asymmetric (ES256/RS256), verified against the project's published JWKS.
 *   Preferred, because no secret has to live in this service.
 * - Symmetric (HS256), verified against SUPABASE_JWT_SECRET when configured.
 *   Supabase issued these historically, so it is kept as a fallback.
 *
 * The algorithm is always taken from an allowlist and the expected scheme is
 * pinned per verification path, which is what prevents algorithm confusion.
 */

const ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"] as const;
const SYMMETRIC_ALGORITHMS = ["HS256"] as const;

export interface AuthUser {
  /** Supabase auth.users id. */
  userId: string;
  /** True for a user who has not linked a real credential yet. */
  isAnonymous: boolean;
  email: string | null;
}

type AsymmetricKey = Parameters<typeof jwtVerify>[1];

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
/** Set by tests so the asymmetric path can be exercised without the network. */
let asymmetricKeyOverride: AsymmetricKey | null = null;

function getJwks(): AsymmetricKey | null {
  if (asymmetricKeyOverride) {
    return asymmetricKeyOverride;
  }

  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!url) {
    return null;
  }
  if (!cachedJwks) {
    // jose caches the fetched keys and handles rotation, so this is one
    // network call per cold start rather than one per request.
    cachedJwks = createRemoteJWKSet(
      new URL(`${url}/auth/v1/.well-known/jwks.json`)
    );
  }
  return cachedJwks;
}

function symmetricKey(): Uint8Array | null {
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  return secret ? new TextEncoder().encode(secret) : null;
}

/** Bearer token from the Authorization header, or null. */
export function extractBearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function toAuthUser(payload: Record<string, unknown>): AuthUser | null {
  const userId = typeof payload.sub === "string" ? payload.sub : null;
  if (!userId) {
    return null;
  }
  return {
    userId,
    isAnonymous: payload.is_anonymous === true,
    email: typeof payload.email === "string" && payload.email ? payload.email : null,
  };
}

/** Distinguishes an expired token from a malformed one, so clients can refresh. */
export class TokenExpiredError extends Error {
  constructor() {
    super("Access token expired.");
    this.name = "TokenExpiredError";
  }
}

/**
 * Verify a raw access token. Returns null when it is not a usable token, and
 * throws TokenExpiredError when it merely needs refreshing.
 */
export async function verifyAccessToken(token: string): Promise<AuthUser | null> {
  let algorithm: string | undefined;
  try {
    algorithm = decodeProtectedHeader(token).alg;
  } catch {
    return null;
  }
  if (!algorithm) {
    return null;
  }

  try {
    if ((ASYMMETRIC_ALGORITHMS as readonly string[]).includes(algorithm)) {
      const jwks = getJwks();
      if (!jwks) {
        return null;
      }
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: [...ASYMMETRIC_ALGORITHMS],
      });
      return toAuthUser(payload as Record<string, unknown>);
    }

    if ((SYMMETRIC_ALGORITHMS as readonly string[]).includes(algorithm)) {
      const key = symmetricKey();
      if (!key) {
        return null;
      }
      const { payload } = await jwtVerify(token, key, {
        algorithms: [...SYMMETRIC_ALGORITHMS],
      });
      return toAuthUser(payload as Record<string, unknown>);
    }

    // Anything else, including "none", is refused outright.
    return null;
  } catch (error) {
    // jose reports an expired token with this code; everything else is simply
    // an invalid token and must not be distinguished to the caller.
    if (
      error instanceof Error &&
      (error as { code?: string }).code === "ERR_JWT_EXPIRED"
    ) {
      throw new TokenExpiredError();
    }
    return null;
  }
}

/**
 * The signed-in user, or null when the request carries no usable token.
 *
 * Optional by design: anonymous play must keep working without an account, so
 * routes ask for a user rather than requiring one. A token that has merely
 * expired throws 401 so the client knows to refresh and retry, instead of
 * silently being treated as a guest and losing attribution.
 */
export async function optionalUser(
  request: IncomingMessage
): Promise<AuthUser | null> {
  const token = extractBearerToken(request);
  if (!token) {
    return null;
  }

  try {
    return await verifyAccessToken(token);
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw createHttpError(401, "Access token expired. Refresh and retry.");
    }
    throw error;
  }
}

/** The signed-in user, or a 401. For routes that are inherently per-account. */
export async function requireUser(request: IncomingMessage): Promise<AuthUser> {
  const user = await optionalUser(request);
  if (!user) {
    throw createHttpError(401, "Sign in to use this.");
  }
  return user;
}

/** Reset the cached key set. Test-only. */
export function resetAuthCache(): void {
  cachedJwks = null;
  asymmetricKeyOverride = null;
}

/**
 * Verify asymmetric tokens against a supplied key instead of the project's
 * published JWKS, so the asymmetric path can be tested without the network.
 * Test-only.
 */
export function setAsymmetricKeyForTests(key: AsymmetricKey | null): void {
  asymmetricKeyOverride = key;
}

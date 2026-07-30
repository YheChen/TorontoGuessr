/**
 * Reading what Supabase put in the callback URL.
 *
 * Kept pure and separate from the route so every shape can be unit tested. The
 * shapes are not hypothetical: which one arrives depends on the client's
 * `flowType`, and Supabase reports failures in either the query string or the
 * hash depending on how far the request got.
 *
 * With the default implicit flow the tokens arrive in the hash and the Supabase
 * client consumes them itself. The `code` shape is what PKCE produces, handled
 * here so switching `flowType` later does not silently break sign-in.
 */

export type AuthCallback =
  /** Supabase reported a failure. The message is safe to show a player. */
  | { kind: "error"; message: string }
  /** PKCE: exchange this for a session. */
  | { kind: "code"; code: string }
  /** Implicit: tokens are in the hash for the Supabase client to pick up. */
  | { kind: "tokens" }
  /** Nothing auth related in the URL at all. */
  | { kind: "none" };

/**
 * Supabase error codes worth rewording. Anything not listed falls back to the
 * server's own description, which is usually readable, and then to a generic
 * line so a player never sees an empty error.
 */
const FRIENDLY_ERRORS: Record<string, string> = {
  otp_expired: "That sign-in link has expired. Request a new one and it will work.",
  access_denied: "That sign-in link is no longer valid. Request a new one.",
  invalid_request: "That sign-in link looks incomplete. Request a new one.",
};

const GENERIC_ERROR = "That sign-in link could not be used. Request a new one.";

/** Strips the leading `?` or `#` so both halves parse the same way. */
function params(fragment: string): URLSearchParams {
  return new URLSearchParams(fragment.replace(/^[?#]/, ""));
}

/**
 * Classify a callback URL.
 *
 * Errors win over everything else: Supabase can include both an error and
 * leftover parameters, and treating such a link as a success would strand the
 * player on a page that silently did nothing.
 */
export function readAuthCallback(search: string, hash: string): AuthCallback {
  const query = params(search);
  const fragment = params(hash);

  for (const source of [query, fragment]) {
    // Presence, not truthiness. An `?error=` with an empty value still means the
    // link failed, and treating it as a success would strand the player on a
    // page reporting there was nothing to confirm.
    const failed =
      source.has("error") ||
      source.has("error_code") ||
      source.has("error_description");

    if (!failed) {
      continue;
    }

    // Empty strings are normalised away so the fallback chain skips them.
    const code = source.get("error_code") || undefined;
    const error = source.get("error") || undefined;
    // A description arrives URL encoded with `+` for spaces, which
    // URLSearchParams already decodes.
    const description = source.get("error_description") || undefined;

    return {
      kind: "error",
      message:
        (code ? FRIENDLY_ERRORS[code] : undefined) ??
        description ??
        (error ? FRIENDLY_ERRORS[error] : undefined) ??
        GENERIC_ERROR,
    };
  }

  const code = query.get("code");
  if (code) {
    return { kind: "code", code };
  }

  if (fragment.get("access_token")) {
    return { kind: "tokens" };
  }

  return { kind: "none" };
}

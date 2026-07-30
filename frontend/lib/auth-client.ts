import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase-client";

/**
 * Optional player accounts.
 *
 * Nothing here runs until a player asks for it: the landing page promises no
 * sign-up is needed, so a visitor plays anonymously with no account at all.
 * The first account is created only once a game has finished, which is also
 * what keeps throwaway accounts from being minted by every passing crawler.
 *
 * Supabase is the identity provider only. Access tokens are sent to the
 * backend, which verifies them and remains the sole reader of game data.
 */

export interface Session {
  accessToken: string;
  userId: string;
  isAnonymous: boolean;
  email: string | null;
}

export const isAuthConfigured = isSupabaseConfigured;

function toSession(raw: {
  access_token: string;
  user: { id: string; is_anonymous?: boolean; email?: string | null };
} | null): Session | null {
  if (!raw?.access_token || !raw.user?.id) {
    return null;
  }
  return {
    accessToken: raw.access_token,
    userId: raw.user.id,
    isAnonymous: raw.user.is_anonymous === true,
    email: raw.user.email ?? null,
  };
}

/** The current session, refreshing it first if it is close to expiring. */
export async function getSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return toSession(data.session as Parameters<typeof toSession>[0]);
}

/** Force a refresh, used when the backend reports an expired token. */
export async function refreshSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    return null;
  }
  return toSession(data.session as Parameters<typeof toSession>[0]);
}

export interface SignInResult {
  session: Session | null;
  error: string | null;
}

/**
 * Create the anonymous account that backs a saved streak.
 *
 * A captcha token is required because captcha protection is enabled on the
 * project, and it applies to every auth endpoint including this one.
 */
export async function signInAnonymously(
  captchaToken: string
): Promise<SignInResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { session: null, error: "Accounts are not available right now." };
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: { captchaToken },
  });

  if (error) {
    return { session: null, error: friendlyAuthError(error.message) };
  }
  return {
    session: toSession(data.session as Parameters<typeof toSession>[0]),
    error: null,
  };
}

/**
 * Attach an email to the current account so it can be recovered on another
 * device. The user id does not change, so existing progress carries over with
 * no migration.
 */
export async function attachEmail(
  email: string,
  captchaToken: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { error: "Accounts are not available right now." };
  }

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${window.location.origin}/` }
  );
  void captchaToken;

  return { error: error ? friendlyAuthError(error.message) : null };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase?.auth.signOut();
}

/** Notifies on sign-in, sign-out, and token refresh. Returns an unsubscribe. */
export function onSessionChange(
  handler: (session: Session | null) => void
): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return () => undefined;
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    handler(toSession(session as Parameters<typeof toSession>[0]));
  });
  return () => data.subscription.unsubscribe();
}

/** Supabase messages are developer-facing; soften the ones users can hit. */
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("captcha")) {
    return "The verification check did not pass. Please try again.";
  }
  if (lower.includes("anonymous sign-ins are disabled")) {
    return "Accounts are not available right now.";
  }
  if (lower.includes("already been registered") || lower.includes("already exists")) {
    return "That email is already linked to another account.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return message;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CloudUpload, Flame, Mail, ShieldCheck, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile, isTurnstileConfigured } from "@/components/turnstile";
import {
  attachEmail,
  getSession,
  isAuthConfigured,
  signInAnonymously,
  type Session,
} from "@/lib/auth-client";
import { fetchProfile, updateDisplayName } from "@/lib/api";
import { isLikelyEmail } from "@/lib/email";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

/**
 * Offers to keep a streak across devices, shown on the game summary.
 *
 * Deliberately deferred to this point rather than done on first visit: the
 * landing page promises no sign-up is needed, and creating an account for every
 * passing visitor would mint throwaway users (and count against monthly active
 * users) for people who never played.
 *
 * The account created here is anonymous. It carries progress on this device
 * immediately, and an email can be attached later to reach it from another one,
 * keeping the same user id so nothing needs migrating.
 */

type Stage = "idle" | "verifying" | "signing-in" | "done" | "error";

/** Outcome of the page's attempt to file the score under this account's name. */
export interface LeaderboardStatus {
  kind: "saved" | "error";
  message: string;
}

interface SaveProgressProps {
  /**
   * Reports whether an account exists. The page uses this to drop the guest
   * leaderboard form, since a signed-in player's name comes from here instead.
   */
  onAccountChange?: (hasAccount: boolean) => void;
  /**
   * Called with the account's display name whenever one is known: on arrival
   * for an account that already has one, and again after a rename. The page
   * files the score under it, so a player never has to type their name twice.
   */
  onDisplayName?: (displayName: string) => void;
  /** Result of that filing, shown here because this is where the name was typed. */
  leaderboardStatus?: LeaderboardStatus | null;
}

export function SaveProgress({
  onAccountChange,
  onDisplayName,
  leaderboardStatus = null,
}: SaveProgressProps = {}) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [email, setEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  // Tracked separately from the message so a failure can be styled as one. The
  // success case is not "done", it is "we sent you something", and conflating the
  // two would let a rejected address read as accepted.
  const [emailFailed, setEmailFailed] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);

  // Held in refs so a parent that passes inline callbacks does not re-trigger
  // the effects below on every one of its renders.
  const onAccountChangeRef = useRef(onAccountChange);
  const onDisplayNameRef = useRef(onDisplayName);
  useEffect(() => {
    onAccountChangeRef.current = onAccountChange;
    onDisplayNameRef.current = onDisplayName;
  }, [onAccountChange, onDisplayName]);

  useEffect(() => {
    onAccountChangeRef.current?.(session !== null);
  }, [session]);

  // One effect covers both moments a name becomes known, because both arrive as
  // a change to the profile: loading an account that was already named, and
  // saving a new name. The page is responsible for not filing the same name
  // twice.
  useEffect(() => {
    const displayName = profile?.displayName;
    if (!displayName) {
      return;
    }
    onDisplayNameRef.current?.(displayName);
  }, [profile?.displayName]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await getSession();
      if (cancelled) return;
      setSession(current);
      if (current) {
        setStage("done");
        try {
          const { profile: loaded } = await fetchProfile();
          if (!cancelled) setProfile(loaded);
        } catch {
          // The profile is a nicety here; a failure must not break the summary.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToken = async (captchaToken: string) => {
    setStage("signing-in");
    const { session: created, error } = await signInAnonymously(captchaToken);
    if (error || !created) {
      setErrorMessage(error ?? "Could not create an account.");
      setStage("error");
      return;
    }
    setSession(created);
    setStage("done");
    try {
      const { profile: loaded } = await fetchProfile();
      setProfile(loaded);
    } catch {
      // Not fatal.
    }
  };

  const handleSaveName = async () => {
    setIsSavingName(true);
    setNameMessage(null);
    try {
      const { profile: updated } = await updateDisplayName(name);
      setProfile(updated);
      setNameMessage(`Saved as ${updated.displayName}.`);
    } catch (error) {
      setNameMessage(
        error instanceof Error ? error.message : "Could not save that name."
      );
    } finally {
      setIsSavingName(false);
    }
  };

  /**
   * Attach an email so this account can be reached from another device.
   *
   * The account stays anonymous until the player opens the confirmation link:
   * updateUser does not move the address onto the user until it is verified. So
   * this reports that a confirmation was sent and nothing stronger. Claiming the
   * account was upgraded would be a lie, and a costly one, because the player
   * would stop worrying about a browser whose data still holds their only key.
   */
  const handleAttachEmail = async () => {
    const address = email.trim();
    if (!address) return;

    setIsAttaching(true);
    setEmailMessage(null);
    setEmailFailed(false);

    const { error } = await attachEmail(address);

    if (error) {
      setEmailMessage(error);
      setEmailFailed(true);
    } else {
      setEmailMessage(
        `Confirmation sent to ${address}. Open the link in that email to finish adding it.`
      );
      setEmail("");
    }
    setIsAttaching(false);
  };

  // Nothing to offer if the project is not wired for accounts.
  if (!isAuthConfigured || !isTurnstileConfigured) {
    return null;
  }

  if (stage === "done" && session) {
    return (
      <div className="surface-card mt-5 rounded-2xl p-6 sm:p-7">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-success" />
          <h3 className="text-sm font-semibold">Progress is being saved</h3>
        </div>
        {/* Says what is actually true, which it did not before: it claimed the
            streak was on the account while profiles.current_streak was read in
            six places and written in none. It is written now, derived from the
            games filed under the account, but a brand new account has none of
            those yet, because signing in happens on this very screen. So it only
            promises the streak once the server has actually counted one. */}
        <p className="mt-2 text-xs text-muted-foreground">
          {profile?.currentStreak
            ? `Your ${profile.currentStreak} day streak is stored on your account.`
            : "Your name and finished games are stored on your account. Your streak moves across once you finish a game while signed in."}
        </p>

        <div className="mt-4">
          <label
            htmlFor="profile-name"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Display name
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id="profile-name"
              value={name}
              onChange={(event) =>
                setName(event.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16))
              }
              placeholder={profile?.displayName ?? "Pick a name"}
              maxLength={16}
              className="sm:flex-1"
            />
            <Button
              type="button"
              onClick={() => void handleSaveName()}
              disabled={isSavingName || name.length < 3}
              className="rounded-xl sm:min-w-[120px]"
            >
              {isSavingName ? "Saving…" : "Save name"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            3 to 16 characters: letters, numbers, and underscores. This is also
            the name your scores appear under on the leaderboard.
          </p>
          {nameMessage && (
            <p className="mt-2 text-sm font-medium text-foreground">{nameMessage}</p>
          )}
          {leaderboardStatus && (
            <p
              className={cn(
                "mt-2 inline-flex items-center gap-1.5 text-sm font-medium",
                leaderboardStatus.kind === "saved"
                  ? "text-success"
                  : "text-destructive"
              )}
            >
              {leaderboardStatus.kind === "saved" && (
                <Trophy className="size-4" />
              )}
              {leaderboardStatus.message}
            </p>
          )}
        </div>

        {/* Reaching this account from another device. Only worth offering while
            there is no email on it: with one, recovery already works. */}
        {session.email ? (
          <div className="mt-5 border-t border-border/70 pt-4">
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="size-3.5 text-success" />
              Reachable at {session.email}, so you can sign in on any device.
            </p>
          </div>
        ) : (
          <div className="mt-5 border-t border-border/70 pt-4">
            <label
              htmlFor="profile-email"
              className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Email (optional)
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                id="profile-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailMessage(null);
                  setEmailFailed(false);
                }}
                placeholder="you@example.com"
                className="sm:flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleAttachEmail()}
                disabled={isAttaching || !isLikelyEmail(email)}
                className="rounded-xl sm:min-w-[120px]"
              >
                {isAttaching ? "Sending…" : "Add email"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Right now this account lives only in this browser. Clearing your
              data loses it. Adding an email lets you sign in anywhere, and keeps
              the same streak and name.
            </p>
            {emailMessage && (
              <p
                className={cn(
                  "mt-2 inline-flex items-start gap-1.5 text-sm font-medium",
                  emailFailed ? "text-destructive" : "text-success"
                )}
              >
                {!emailFailed && <Mail className="mt-0.5 size-4 shrink-0" />}
                {emailMessage}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="surface-card mt-5 rounded-2xl p-6 sm:p-7">
      <div className="flex items-center gap-2">
        <Flame className="size-4 text-toronto-gold" />
        <h3 className="text-sm font-semibold">Keep your streak</h3>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Your streak currently lives in this browser only, so clearing your data or
        switching devices loses it. Save it to keep it. No email needed.
      </p>

      {stage === "idle" && (
        <Button
          type="button"
          onClick={() => setStage("verifying")}
          className="mt-4 rounded-xl"
        >
          <CloudUpload className="size-4" />
          Save my progress
        </Button>
      )}

      {stage === "verifying" && (
        <div className="mt-4">
          <Turnstile
            onToken={(token) => void handleToken(token)}
            onError={(message) => {
              setErrorMessage(message);
              setStage("error");
            }}
          />
        </div>
      )}

      {stage === "signing-in" && (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4" />
          Setting up your account…
        </p>
      )}

      {stage === "error" && (
        <div className="mt-4">
          <p className="text-sm font-medium text-destructive">{errorMessage}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setErrorMessage(null);
              setStage("verifying");
            }}
            className="mt-3 rounded-xl"
          >
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

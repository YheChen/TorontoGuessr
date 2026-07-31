"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { History, LogOut, Mail, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/site/spinner";
import { Turnstile, isTurnstileConfigured } from "@/components/turnstile";
import {
  getSession,
  isAuthConfigured,
  onSessionChange,
  sendMagicLink,
  signOut,
  type Session,
} from "@/lib/auth-client";
import { fetchProfile } from "@/lib/api";

/**
 * The account control in the navbar.
 *
 * This is the only route back into an existing account from a device that has
 * never held its session. Everything else account related lives on the game
 * summary, which a returning visitor has no reason to reach, so without this the
 * email tier is unusable no matter how well the rest of it works.
 */

type SendStage = "idle" | "verifying" | "sending" | "sent" | "error";

export function AccountMenu() {
  // Auth state lives in browser storage, so the first paint after a
  // server-rendered shell knows nothing. Rendering the signed-out control during
  // that gap would flash "Sign in" at someone who is already signed in, so
  // nothing renders until the first read resolves.
  const [checked, setChecked] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<SendStage>("idle");
  const [message, setMessage] = useState<string | null>(null);
  // The address is captured when the send starts. The captcha resolves
  // asynchronously and the field stays editable, so reading state at token time
  // could mail a half-typed address.
  const submittedEmailRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const current = await getSession();
      if (cancelled) return;
      setSession(current);
      setChecked(true);
    })();

    const unsubscribe = onSessionChange((next) => {
      if (cancelled) return;
      setSession(next);
      setChecked(true);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // The display name makes the control say who you are rather than just
  // "Account". It is a nicety, so a failure here must never break the navbar.
  useEffect(() => {
    if (!session) {
      setDisplayName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { profile } = await fetchProfile();
        if (!cancelled) setDisplayName(profile.displayName);
      } catch {
        // Leave it null and show the generic label.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleToken = useCallback(async (captchaToken: string) => {
    setStage("sending");
    const { error } = await sendMagicLink(submittedEmailRef.current, captchaToken);
    if (error) {
      setMessage(error);
      setStage("error");
      return;
    }
    // Deliberately does not say "welcome back" or "account found".
    // sendMagicLink leaves shouldCreateUser at true precisely so an unknown
    // address behaves identically to a known one; claiming either here would
    // undo that and turn this form into an account-enumeration oracle.
    setMessage(
      `If that address can be used, a sign-in link is on its way to ${submittedEmailRef.current}. Open it on this device.`
    );
    setStage("sent");
  }, []);

  const startSend = () => {
    submittedEmailRef.current = email.trim();
    setMessage(null);
    setStage("verifying");
  };

  const openDialog = () => {
    setStage("idle");
    setMessage(null);
    setEmail("");
    setOpen(true);
  };

  // Nothing to offer when the project is not wired for accounts. Signing out is
  // still offered to anyone already holding a session, since Turnstile is only
  // needed to get one.
  if (!isAuthConfigured || !checked) {
    return null;
  }
  if (!session && !isTurnstileConfigured) {
    return null;
  }

  if (session) {
    const label = displayName ?? (session.email ? "Account" : "Guest account");
    // An account with no email attached exists only as the session in this
    // browser. Signing out of one destroys it: there is no address to send a
    // recovery link to, so the streak and the name are simply gone. That earns a
    // confirmation, while an account with an email can sign out freely.
    const signOutIsDestructive = !session.email;

    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              aria-label="Account"
            >
              <UserIcon className="size-4" />
              <span className="hidden max-w-[10ch] truncate sm:inline">
                {label}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {session.email
                  ? session.email
                  : "Stored in this browser only. Add an email after a game so you can reach it from anywhere."}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/me">
                <History className="size-4" />
                Streak and games
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                if (!signOutIsDestructive) {
                  void signOut();
                  return;
                }
                // Closing the menu would unmount a nested trigger, so the
                // confirmation is controlled by state and rendered outside it.
                event.preventDefault();
                setConfirmSignOut(true);
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Signing out will delete this account
              </AlertDialogTitle>
              <AlertDialogDescription>
                You have not added an email, so this account only exists in this
                browser. Signing out is permanent: your streak
                {displayName ? ` and the name ${displayName}` : " and saved name"}{" "}
                cannot be recovered. Finish a game and add an email first if you
                want to keep it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep my account</AlertDialogCancel>
              <AlertDialogAction onClick={() => void signOut()}>
                Sign out anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={openDialog}
      >
        <UserIcon className="size-4" />
        <span className="hidden sm:inline">Sign in</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in</DialogTitle>
            <DialogDescription>
              We will email you a link. There is no password, and you never need
              an account to play.
            </DialogDescription>
          </DialogHeader>

          {stage === "sent" ? (
            <div className="space-y-3">
              <p className="inline-flex items-start gap-2 text-sm font-medium text-success">
                <Mail className="mt-0.5 size-4 shrink-0" />
                {message}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl"
                onClick={() => setOpen(false)}
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="account-email"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Email
                </label>
                <Input
                  id="account-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && email.trim() && stage === "idle") {
                      startSend();
                    }
                  }}
                  placeholder="you@example.com"
                  disabled={stage !== "idle" && stage !== "error"}
                  className="mt-2"
                />
              </div>

              {(stage === "idle" || stage === "error") && (
                <Button
                  type="button"
                  onClick={startSend}
                  disabled={!email.trim()}
                  className="w-full rounded-xl"
                >
                  Email me a link
                </Button>
              )}

              {stage === "verifying" && (
                <Turnstile
                  onToken={(token) => void handleToken(token)}
                  onError={(reason) => {
                    setMessage(reason);
                    setStage("error");
                  }}
                />
              )}

              {stage === "sending" && (
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner size={16} />
                  Sending your link…
                </p>
              )}

              {stage === "error" && message && (
                <p className="text-sm font-medium text-destructive">{message}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

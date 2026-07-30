"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingScreen, ErrorCard } from "@/components/site/states";
import { readAuthCallback } from "@/lib/auth-callback";
import { getSession } from "@/lib/auth-client";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase-client";

/**
 * Where Supabase sign-in links land.
 *
 * Two shapes can arrive. With the default implicit flow the tokens are in the
 * URL hash and the shared Supabase client consumes them itself on construction,
 * so the work here is mostly waiting for the session to appear and reporting
 * failure clearly. The `code` shape is what PKCE produces and is exchanged
 * explicitly, so switching flowType later does not silently break sign-in.
 *
 * Deliberately reads location directly rather than through useSearchParams:
 * hash fragments are not visible to it at all, and it would force this route
 * into a Suspense boundary at build time for no benefit.
 */

type Stage = "working" | "done" | "failed" | "nothing";

/** How long the success state is shown before moving on. */
const REDIRECT_DELAY_MS = 1200;

/**
 * The implicit flow leaves credentials in the hash. Supabase clears it once it
 * has read them, but clear it again defensively so a token cannot be copied out
 * of the address bar or leak through a shared link.
 */
function scrubUrl() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname);
}

export function AuthCallbackClient() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("working");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // A link is single use. Running this twice (Strict Mode, a re-render) would
  // exchange an already-spent code and report a spurious failure.
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    let cancelled = false;

    const finish = (next: Stage, message?: string) => {
      if (cancelled) return;
      setErrorMessage(message ?? null);
      setStage(next);
      scrubUrl();
    };

    void (async () => {
      if (!isSupabaseConfigured) {
        finish("failed", "Accounts are not available right now.");
        return;
      }

      const result = readAuthCallback(
        window.location.search,
        window.location.hash
      );

      if (result.kind === "error") {
        finish("failed", result.message);
        return;
      }

      if (result.kind === "code") {
        const supabase = getSupabaseClient();
        if (!supabase) {
          finish("failed", "Accounts are not available right now.");
          return;
        }
        const { error } = await supabase.auth.exchangeCodeForSession(result.code);
        finish(
          error ? "failed" : "done",
          error ? "That sign-in link could not be used. Request a new one." : undefined
        );
        return;
      }

      // Both the token and empty cases resolve the same way: ask whether a
      // session exists. For tokens the client is mid-flight reading the hash, so
      // allow a few attempts before calling it a failure.
      const attempts = result.kind === "tokens" ? 12 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const session = await getSession();
        if (cancelled) return;
        if (session) {
          finish("done");
          return;
        }
        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      if (result.kind === "tokens") {
        finish("failed", "That sign-in link could not be used. Request a new one.");
      } else {
        finish("nothing");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stage !== "done") return;
    const timer = setTimeout(() => router.replace("/"), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stage, router]);

  return (
    <section className="container py-8 sm:py-10">
      <div className="mx-auto max-w-xl">
        {stage === "working" && (
          <LoadingScreen
            title="Signing you in…"
            description="Confirming your link with Toronto Guessr."
          />
        )}

        {stage === "done" && (
          <div className="surface-card flex flex-col items-center gap-4 rounded-2xl px-8 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-success/12 text-success ring-1 ring-inset ring-success/25">
              <CheckCircle2 className="size-6" />
            </span>
            <div className="space-y-1">
              <p className="text-lg font-semibold">You are signed in</p>
              <p className="text-sm text-muted-foreground">
                Your streak and leaderboard name travel with your account now.
              </p>
            </div>
            <Button asChild className="mt-1 rounded-xl">
              <Link href="/">Continue</Link>
            </Button>
          </div>
        )}

        {stage === "nothing" && (
          <ErrorCard
            title="Nothing to confirm"
            message="This page handles sign-in links. Open the link from your email, or just keep playing: an account is optional."
          />
        )}

        {stage === "failed" && (
          <ErrorCard
            title="That link did not work"
            message={errorMessage ?? undefined}
          />
        )}

        {stage !== "done" && (
          <div className="mt-5 flex justify-center">
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/">Back to the game</Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/site/spinner";

/**
 * Cloudflare Turnstile challenge.
 *
 * Captcha protection is enabled on the Supabase project, and it applies to
 * every auth endpoint, so a token is required before any sign-in. In Managed
 * mode most real visitors are passed without interaction, so this usually
 * resolves on its own within a second.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

export const isTurnstileConfigured = Boolean(SITE_KEY);

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      appearance?: "always" | "execute" | "interaction-only";
    }
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Loads the Turnstile script once per page. */
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (window.turnstile) {
    return Promise.resolve();
  }

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("load failed")), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("load failed")), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

interface TurnstileProps {
  onToken: (token: string) => void;
  onError?: (message: string) => void;
}

export function Turnstile({ onToken, onError }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  // Kept in a ref so re-renders of the parent do not re-render the widget,
  // which would discard a challenge already in progress.
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
  }, [onToken, onError]);

  const fail = useCallback((message: string) => {
    setStatus("failed");
    onErrorRef.current?.(message);
  }, []);

  useEffect(() => {
    if (!SITE_KEY) {
      fail("Verification is not configured.");
      return;
    }

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        setStatus("ready");
        widgetRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "auto",
          callback: (token) => onTokenRef.current(token),
          "error-callback": () =>
            fail("The verification check could not run. Please try again."),
          "expired-callback": () =>
            fail("The verification check expired. Please try again."),
        });
      })
      .catch(() => {
        if (!cancelled) {
          fail("Could not load the verification check.");
        }
      });

    return () => {
      cancelled = true;
      const widgetId = widgetRef.current;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // Already gone; nothing to clean up.
        }
      }
      widgetRef.current = null;
    };
  }, [fail]);

  return (
    <div className="flex min-h-[68px] items-center justify-center">
      {status === "loading" && <Spinner size={20} />}
      <div ref={containerRef} />
    </div>
  );
}

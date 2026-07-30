import type { Metadata } from "next";
import { AuthCallbackClient } from "./callback-client";

export const metadata: Metadata = {
  title: "Signing you in",
  // A callback URL is single use and carries credentials. It has no business in
  // a search index, and is deliberately absent from app/sitemap.ts too.
  robots: { index: false, follow: false },
};

export default function AuthCallbackPage() {
  return <AuthCallbackClient />;
}

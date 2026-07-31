import type { Metadata } from "next";
import { AccountClient } from "./account-client";

export const metadata: Metadata = {
  title: "Your account",
  description:
    "Your TorontoGuessr streak, best run, and the games filed under your account.",
  // Nothing here is meaningful without a session, and a crawler has none.
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AccountClient />;
}

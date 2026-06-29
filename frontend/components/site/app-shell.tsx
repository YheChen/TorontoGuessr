import type { ReactNode } from "react";
import { TorontoBackdrop } from "@/components/site/toronto-backdrop";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Global chrome: ambient Toronto backdrop, sticky navbar, the page content,
 * and the footer — composed once so individual pages only render content.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[60] focus-visible:rounded-lg focus-visible:bg-card focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:shadow-elevated focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to content
      </a>
      <TorontoBackdrop />
      <Navbar />
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 flex flex-1 flex-col outline-none"
      >
        {children}
      </main>
      <Footer />
      <div className="fixed bottom-5 right-5 z-40">
        <ThemeToggle className="size-11 bg-card/90 shadow-elevated backdrop-blur transition-transform hover:scale-105 active:scale-95" />
      </div>
    </div>
  );
}

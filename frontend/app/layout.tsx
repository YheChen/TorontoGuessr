import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TorontoGuessr",
  description: "Test your knowledge of Toronto streets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="aabe665b-45c4-4c8e-98fb-e0d6265a3509"
        ></script>
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <div className="flex min-h-screen flex-col">
            <div className="flex flex-1 flex-col">{children}</div>
            <footer className="border-t border-border/70 bg-background/85 text-muted-foreground shadow-sm backdrop-blur dark:border-none dark:bg-[#00205B] dark:text-blue-100/70 dark:shadow-md dark:backdrop-blur-none">
              <div className="container mx-auto flex h-[72px] items-center justify-center px-4 text-center text-sm">
                © 2026 Yanzhen Chen
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type React from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MapThemeProvider } from "@/components/site/map-theme";
import { AppShell } from "@/components/site/app-shell";
import { getSiteUrl } from "@/lib/site-url";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "TorontoGuessr: How well do you know the 6ix?",
    template: "%s · TorontoGuessr",
  },
  description:
    "A premium street-guessing game for Toronto. Drop into Street View, read the city, and pin your guess across five rounds. Climb the leaderboard.",
  keywords: [
    "Toronto",
    "GeoGuessr",
    "Street View",
    "geography game",
    "map game",
    "the 6ix",
  ],
  authors: [{ name: "Yanzhen Chen", url: "https://github.com/YheChen" }],
  creator: "Yanzhen Chen",
  applicationName: "TorontoGuessr",
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "TorontoGuessr: How well do you know the 6ix?",
    description:
      "Drop into Toronto Street View, read the city, and pin your guess across five rounds.",
    siteName: "TorontoGuessr",
    images: [
      {
        url: "/TorontoGuessrThumbnail.webp",
        width: 1200,
        height: 630,
        alt: "TorontoGuessr",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TorontoGuessr: How well do you know the 6ix?",
    description:
      "Drop into Toronto Street View, read the city, and pin your guess across five rounds.",
    images: ["/TorontoGuessrThumbnail.webp"],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1020" },
  ],
  width: "device-width",
  initialScale: 1,
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
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <MapThemeProvider>
            <AppShell>{children}</AppShell>
          </MapThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

export const metadata: Metadata = {
  title: "EPos 365 licensing",
  description: "License, device and approval administration for EPos 365.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

// The brand foundation sets Mono on identifiers: license keys, device ids,
// fingerprints, IP addresses and timestamps.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        {/*
          The foundation stylesheet, served from this origin rather than fetched
          from vercel.com so the panel has no third-party runtime dependency.
          The bytes are unmodified; refresh it from
          https://vercel.com/geist/vercel-brand.css to take an upstream update.
        */}
        {/* eslint-disable-next-line @next/next/no-css-tags -- the foundation
            ships as a byte-identical stylesheet that must not be transformed by
            the bundler, and React 19's `precedence` already hoists and
            deduplicates it. Importing it as a module would let PostCSS rewrite
            it. */}
        <link rel="stylesheet" href="/vercel-brand.css" precedence="vbg" />
      </head>
      {/*
        Browser extensions stamp their own attributes onto <body> before React
        hydrates. ColorZilla's `cz-shortcut-listen` is the one seen here, and
        grammar and accessibility tools do the same. It is a real difference
        between the server HTML and the live DOM, so React reports it, but
        nothing on this side is wrong and nothing here can prevent it.

        This suppression is safe precisely because it is shallow: it covers
        attributes on <body> itself and nothing inside it, so a genuine
        hydration bug anywhere in the app still surfaces normally. It must not
        be moved to a wrapper that renders data.
      */}
      <body className="vbg-report" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

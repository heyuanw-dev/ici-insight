import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { siteConfig } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="sr-only rounded-md bg-surface px-5 py-3 font-semibold text-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="page-container flex-1 py-10 outline-none sm:py-14"
        >
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

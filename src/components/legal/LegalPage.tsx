import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The public shell for the Terms and Privacy pages. These are the only
 * content pages a signed-out visitor — or a platform's app reviewer (TikTok,
 * Meta, LinkedIn, Snapchat) — is meant to read, so they are opened in the
 * proxy (src/proxy.ts) and in isAccessAllowedPath (src/lib/officeAccess.ts).
 * No session, no data: just static company policy, styled with the portal's
 * own tokens.
 */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <a href="https://hmarkconsultants.com" className="text-sm font-semibold text-ink">
            HMARK <span className="text-primary">Consultants</span>
          </a>
          <Link href="/login" prefetch={false} className="text-sm font-medium text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">Last updated: {updated}</p>

        <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted [&_a]:text-primary [&_a:hover]:underline [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_h3]:mt-4 [&_h3]:font-medium [&_h3]:text-ink [&_li]:marker:text-muted [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-6 text-xs text-muted">
          © {new Date().getFullYear()} HMARK Consultants. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

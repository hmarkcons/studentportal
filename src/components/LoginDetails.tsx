"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { linkHref } from "@/lib/catalogueText";

/**
 * One saved login, shown so it can be read across a desk or typed on a
 * phone: the username and the password large, in a fixed-width face where an
 * l is not a 1, each with Copy, and the page it signs in to as a button.
 *
 * Staff see it when they press Reveal (CredentialField); a registered student
 * sees their own this way on their pages, with no Reveal (0333).
 */
export function LoginDetails({
  label,
  credentialType,
  username,
  password,
  link = null,
  onHide,
  className = "",
}: {
  label: string;
  credentialType: string;
  username: string;
  password: string;
  link?: string | null;
  /** Staff: put it away again. */
  onHide?: () => void;
  className?: string;
}) {
  // Only ever a web address: anything else is not offered as a button.
  const loginPage = linkHref(link);
  return (
    <div className={`rounded-xl border border-primary/30 bg-primary/5 p-4 ${className}`} data-login-details={credentialType}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="h-4 w-4" />
          </span>
          <span className="min-w-0 break-words">{label}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {loginPage && (
            <a
              href={loginPage}
              target="_blank"
              rel="noopener noreferrer"
              data-login-page
              className="inline-flex w-fit items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink shadow-sm hover:opacity-90"
            >
              Go to login page
              <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
            </a>
          )}
          {onHide && (
            <Button type="button" size="sm" variant="ghost" onClick={onHide}>
              Hide
            </Button>
          )}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
        <Line name="Username" value={username} field="username" />
        <Line name="Password" value={password} field="password" />
      </dl>
    </div>
  );
}

function Line({ name, value, field }: { name: string; value: string; field: "username" | "password" }) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("yes");
    } catch {
      // A browser that refuses the clipboard still shows the text to select.
      setCopied("failed");
    }
    setTimeout(() => setCopied(null), 2000);
  }
  return (
    <>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{name}</dt>
      <dd className="min-w-0">
        {value ? (
          <code
            data-login-value={field}
            className="block select-all break-all rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-base font-semibold text-ink"
          >
            {value}
          </code>
        ) : (
          <span className="text-sm text-muted">Not saved</span>
        )}
      </dd>
      <dd>
        {value && (
          <Button type="button" size="sm" onClick={copy} aria-label={`Copy ${name.toLowerCase()}`}>
            {copied === "yes" ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
            {copied === "yes" ? "Copied" : copied === "failed" ? "Select it" : "Copy"}
          </Button>
        )}
      </dd>
    </>
  );
}

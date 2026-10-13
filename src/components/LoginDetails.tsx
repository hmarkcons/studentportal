"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { linkHref } from "@/lib/catalogueText";
import { loginAccent, type LoginKind } from "@/lib/studentLogins";
import { ACCENT_CLASSES, LOGIN_KIND_ICON } from "@/components/studentPortal/loginKinds";

/** "Updated 12 Oct 2026", in Karachi and in one locale, so the server and the browser agree. */
function updatedLine(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Updated ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" })}`;
}

/**
 * One saved login, shown so it can be read across a desk or typed on a
 * phone: the username and the password large, in a fixed-width face where an
 * l is not a 1, each with Copy, and the page it signs in to as a button.
 *
 * Staff see it when they press Reveal (CredentialField); a registered student
 * sees their own this way on their pages, with no Reveal (0333) — each kind of
 * account in its own colour and icon, and when HMARK last changed it.
 */
export function LoginDetails({
  label,
  credentialType,
  username,
  password,
  link = null,
  onHide,
  kind,
  caption,
  updatedAt,
  id,
  className = "",
}: {
  label: string;
  credentialType: string;
  username: string;
  password: string;
  link?: string | null;
  /** Staff: put it away again. */
  onHide?: () => void;
  /** The student's pages: what kind of account, for its colour and icon. */
  kind?: LoginKind;
  /** A line under the name: what kind of login it is, where the name is a university or a portal. */
  caption?: string | null;
  /** When it was last changed. */
  updatedAt?: string | null;
  /** Its address on the page, which the Dashboard links to — and lights up when it is. */
  id?: string;
  className?: string;
}) {
  // Only ever a web address: anything else is not offered as a button.
  const loginPage = linkHref(link);
  const Icon = kind ? LOGIN_KIND_ICON[kind] : KeyRound;
  const accent = kind ? ACCENT_CLASSES[loginAccent(kind)] : null;
  const updated = updatedLine(updatedAt);
  return (
    <div
      id={id}
      className={`scroll-mt-24 rounded-xl border p-4 transition-shadow duration-500 ${accent ? `border-l-4 shadow-sm data-[focused]:shadow-lg data-[focused]:ring-2 data-[focused]:ring-offset-2 data-[focused]:ring-offset-bg ${accent.card}` : "border-primary/30 bg-primary/5"} ${className}`}
      data-login-details={credentialType}
      data-login-kind={kind}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent ? `bg-card shadow-sm ${accent.tile}` : "bg-primary/10 text-primary"}`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-ink">{label}</p>
            {(caption || updated) && (
              <p className="text-[11px] text-muted">
                {caption && <span data-login-caption>{caption}</span>}
                {caption && updated && " · "}
                {updated && <span data-login-updated>{updated}</span>}
              </p>
            )}
          </div>
        </div>
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

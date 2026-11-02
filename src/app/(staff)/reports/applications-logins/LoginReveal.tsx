"use client";

import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";

/**
 * A saved login on the report's page: the username as it is, the password
 * hidden until asked for — the page is often open on a screen others can see,
 * where the downloaded file is not — and either one copied with a click.
 */
export function LoginReveal({ label, username, password, link }: { label: string; username: string; password: string; link: string | null }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState<"username" | "password" | null>(null);

  async function copy(what: "username" | "password", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // No clipboard (an insecure page, a refusal): the text is still there to select.
    }
  }

  const copyButton = (what: "username" | "password", value: string) =>
    value ? (
      <button
        type="button"
        onClick={() => copy(what, value)}
        className="rounded p-0.5 text-muted hover:bg-bg hover:text-ink"
        title={`Copy the ${what}`}
        aria-label={`Copy the ${what}`}
      >
        <Copy className="h-3 w-3" aria-hidden />
      </button>
    ) : null;

  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-warning/40 bg-warning-bg px-2 py-1 text-xs" data-login>
      <span className="font-semibold text-warning">{label}</span>
      <span className="inline-flex items-center gap-1">
        <span className="text-muted">Username</span>
        <span className="font-mono text-ink" data-login-username>
          {username || "—"}
        </span>
        {copyButton("username", username)}
        {copied === "username" && <span className="text-success">Copied</span>}
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="text-muted">Password</span>
        <span className="font-mono text-ink" data-login-password={shown ? "shown" : "hidden"}>
          {password ? (shown ? password : "••••••••") : "—"}
        </span>
        {password && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="rounded p-0.5 text-muted hover:bg-bg hover:text-ink"
            title={shown ? "Hide the password" : "Show the password"}
            aria-label={shown ? "Hide the password" : "Show the password"}
            aria-pressed={shown}
          >
            {shown ? <EyeOff className="h-3 w-3" aria-hidden /> : <Eye className="h-3 w-3" aria-hidden />}
          </button>
        )}
        {copyButton("password", password)}
        {copied === "password" && <span className="text-success">Copied</span>}
      </span>
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="max-w-xs truncate text-primary hover:underline">
          {link}
        </a>
      )}
    </span>
  );
}

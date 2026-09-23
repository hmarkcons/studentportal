"use client";

import { useState } from "react";
import { issueStaffCredentials, revealStaffCredentials } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";

/** What the page knows about a staff member's login, for a Super Admin viewer. */
export type StaffLoginSummary = {
  /** The email they sign in with, from the auth account. */
  loginEmail: string | null;
  lastSignInAt: string | null;
  /** When the kept copy was issued; null when none is kept. */
  copyKeptAt: string | null;
};

type Credentials = { email: string; password: string };

const WHEN: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Karachi",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", WHEN);

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/** The credentials, as the Super Admin reads them out or pastes them on. */
function CredentialsBox({ credentials, note }: { credentials: Credentials; note?: React.ReactNode }) {
  const loginUrl = typeof window === "undefined" ? "/login" : `${window.location.origin}/login`;
  const message = `Your HMARK portal login\nSign in at: ${loginUrl}\nEmail: ${credentials.email}\nPassword: ${credentials.password}\n\nThis is your password to keep — don't share it.`;
  return (
    <div data-credentials className="mt-3 rounded-md border border-border bg-bg p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-xs text-muted">Email</span>
        <code data-credential-email className="break-all text-ink">{credentials.email}</code>
        <CopyButton text={credentials.email} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="w-20 text-xs text-muted">Password</span>
        <code data-credential-password className="break-all font-mono tracking-wide text-ink">{credentials.password}</code>
        <CopyButton text={credentials.password} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyButton text={message} label="Copy as a message" />
        {note}
      </div>
    </div>
  );
}

/**
 * A staff member's login, as a Super Admin manages it: which email they sign
 * in with, whether they ever have, the kept copy of their password, and a way
 * to issue new credentials.
 *
 * Issuing replaces their password, moves their login to their official email,
 * signs them out everywhere, keeps an encrypted copy and mails them — see
 * issueStaffCredentials. It asks first, because it locks them out of every
 * device they are on until they have the new password.
 */
export function StaffLoginPanel({
  staffId,
  staffName,
  officialEmail,
  status,
  login,
}: {
  staffId: string;
  staffName: string;
  officialEmail: string | null;
  status: string;
  login: StaffLoginSummary;
}) {
  const issue = useButtonAction();
  const reveal = useButtonAction();
  const [issued, setIssued] = useState<{ credentials: Credentials; emailed: boolean; warning?: string } | null>(null);
  const [revealed, setRevealed] = useState<Credentials | null>(null);
  const [nothingKept, setNothingKept] = useState(false);

  const official = (officialEmail ?? "").trim();
  const drifted = Boolean(login.loginEmail && official && login.loginEmail.toLowerCase() !== official.toLowerCase());
  const blocked = status !== "active" ? "Their account isn't active, so they couldn't sign in. Set them to Active first." : !official ? "Add their official email first — it's the email they sign in with." : null;

  async function handleIssue() {
    const replacing = login.lastSignInAt || login.copyKeptAt;
    if (
      !confirm(
        `Issue new login credentials for ${staffName}?\n\n` +
          (replacing ? "Their current password will stop working and they'll be signed out everywhere.\n\n" : "") +
          `The new details will be emailed to ${official} and shown here.`
      )
    ) {
      return;
    }
    setRevealed(null);
    const result = await issue.run(() => issueStaffCredentials(staffId));
    if (result && "success" in result && result.success) {
      setIssued({ credentials: { email: result.email, password: result.password }, emailed: result.emailed, warning: result.warning });
    }
  }

  async function handleReveal() {
    const result = await reveal.run(() => revealStaffCredentials(staffId));
    if (result && "success" in result && result.success) {
      setNothingKept(!result.credentials);
      setRevealed(result.credentials ? { email: result.credentials.email, password: result.credentials.password } : null);
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <dl className="flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border py-2">
          <dt className="text-muted">Signs in with</dt>
          <dd className="break-all text-right text-ink">{login.loginEmail ?? "—"}</dd>
        </div>
        <div className="flex items-start justify-between gap-4 border-b border-border py-2">
          <dt className="text-muted">Last signed in</dt>
          <dd className={login.lastSignInAt ? "text-right text-ink" : "text-right text-warning"}>
            {login.lastSignInAt ? when(login.lastSignInAt) : "Never"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4 py-2">
          <dt className="text-muted">Password copy</dt>
          <dd className="text-right text-ink">
            {login.copyKeptAt ? `Kept — issued ${when(login.copyKeptAt)}` : "None kept"}
          </dd>
        </div>
      </dl>

      {drifted && (
        <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
          They sign in with <strong>{login.loginEmail}</strong>, not their official email <strong>{official}</strong>.
          Issuing new credentials moves their login to the official email.
        </p>
      )}

      {/* Reveal: the kept copy, for handing on again without locking them out. */}
      {login.copyKeptAt && !issued && (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {revealed ? (
              <Button type="button" onClick={() => setRevealed(null)}>
                Hide password
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleReveal}
                pending={reveal.pending}
                status={{ state: reveal.state, label: "Shown below.", showError: true }}
              >
                Reveal password
              </Button>
            )}
          </div>
          {revealed && <CredentialsBox credentials={revealed} />}
          {nothingKept && <p className="mt-2 text-xs text-muted">No copy is kept for them — issue new credentials instead.</p>}
        </div>
      )}
      {!login.copyKeptAt && !issued && (
        <p className="text-xs text-muted">
          No copy of their current password is kept — it was only shown once, when their account was created. If they
          don&apos;t have it, issue new credentials.
        </p>
      )}

      <div className="border-t border-border pt-4">
        {blocked ? (
          <p className="text-xs text-muted">{blocked}</p>
        ) : (
          <Button
            type="button"
            variant="primary"
            onClick={handleIssue}
            pending={issue.pending}
            status={{ state: issue.state, label: "Issued.", showError: true }}
          >
            {login.lastSignInAt || login.copyKeptAt ? "Issue new credentials" : "Issue login credentials"}
          </Button>
        )}
        {issued && (
          <CredentialsBox
            credentials={issued.credentials}
            note={
              issued.emailed ? (
                <span className="text-xs text-success">Emailed to {issued.credentials.email}.</span>
              ) : null
            }
          />
        )}
        {issued?.warning && <p className="mt-2 text-xs text-warning">{issued.warning}</p>}
      </div>
    </div>
  );
}

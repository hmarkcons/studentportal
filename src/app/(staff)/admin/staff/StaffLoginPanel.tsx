"use client";

import { useState } from "react";
import { issueStaffCredentials, revealStaffCredentials, setStaffPassword, switchStaffLoginEmail } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";
import { CredentialsBox, SetPasswordForm } from "@/components/SetPasswordForm";

/** What the page knows about a staff member's login, for a Super Admin viewer. */
export type StaffLoginSummary = {
  /** The email they sign in with, from the auth account. */
  loginEmail: string | null;
  lastSignInAt: string | null;
  /** When the kept copy was issued; null when none is kept. */
  copyKeptAt: string | null;
  /** The Super Admin's own record: setting their password keeps them signed in here. */
  isSelf?: boolean;
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

/**
 * A staff member's login, as a Super Admin manages it: which email they sign
 * in with, whether they ever have, the kept copy of their password, and a way
 * to issue new credentials.
 *
 * Issuing replaces their password, moves their login to their official email,
 * signs them out everywhere, keeps an encrypted copy and mails them — see
 * issueStaffCredentials. It asks first, because it locks them out of every
 * device they are on until they have the new password.
 *
 * Or the Super Admin sets the password they want (typed or generated) and it
 * goes the same way, but the login keeps its email — see setStaffPassword. On
 * their own record, they stay signed in here.
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
  const switchLogin = useButtonAction();
  const [switched, setSwitched] = useState<{ email: string; emailed: boolean } | null>(null);
  const [issued, setIssued] = useState<{ credentials: Credentials; emailed: boolean; warning?: string } | null>(null);
  const [revealed, setRevealed] = useState<Credentials | null>(null);
  const [nothingKept, setNothingKept] = useState(false);

  const official = (officialEmail ?? "").trim();
  const drifted = !switched && Boolean(login.loginEmail && official && login.loginEmail.toLowerCase() !== official.toLowerCase());

  async function handleSwitch() {
    if (
      !confirm(
        `Switch ${staffName}'s sign-in email to ${official}?\n\n` +
          `They'll sign in with ${official} from now on, instead of ${login.loginEmail}. Their password stays the same, and they'll be emailed at both addresses.`
      )
    ) {
      return;
    }
    const result = await switchLogin.run(() => switchStaffLoginEmail(staffId));
    if (result && "success" in result && result.success) setSwitched({ email: result.email, emailed: result.emailed });
  }
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
          <dd className="break-all text-right text-ink" data-login-email>{switched?.email ?? login.loginEmail ?? "—"}</dd>
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
        // The move on its own, keeping their password — issuing new
        // credentials does it too, but also signs them out everywhere.
        <div className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning" data-login-drift>
          <p>
            They sign in with <strong>{login.loginEmail}</strong>, not their official email <strong>{official}</strong>.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={handleSwitch}
              pending={switchLogin.pending}
              status={{ state: switchLogin.state, label: "Switched.", showError: true }}
              data-switch-login-email
            >
              Switch sign-in to {official}
            </Button>
            <span className="text-muted">Their password stays the same.</span>
          </div>
        </div>
      )}
      {switched && (
        <p className="rounded-md border border-success/30 bg-success-bg px-3 py-2 text-xs text-success" data-login-switched>
          They now sign in with <strong>{switched.email}</strong>.{" "}
          {switched.emailed ? "They've been emailed at both addresses." : "The email to them didn't go — let them know yourself."}
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

      {/* A password the Super Admin chooses, for an account that has a login. */}
      {status === "active" && login.loginEmail && (
        <div className="border-t border-border pt-4" data-staff-set-password>
          <SetPasswordForm
            name={staffName}
            email={login.loginEmail}
            self={login.isSelf}
            action={(password) => setStaffPassword(staffId, password)}
            onDone={() => {
              setRevealed(null);
              setIssued(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

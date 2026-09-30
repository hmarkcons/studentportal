"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useButtonAction } from "@/components/useButtonAction";
import { generatePassword } from "@/lib/generatePassword";
import { chosenPasswordError, passwordRules } from "@/lib/passwordPolicy";

export type SetPasswordResult =
  | { error: string; success?: undefined }
  | { success: true; error?: undefined; email: string; password: string; emailed: boolean; warning?: string };

type Credentials = { email: string; password: string };

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
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
export function CredentialsBox({ credentials, note }: { credentials: Credentials; note?: React.ReactNode }) {
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
 * A Super Admin sets someone's password: types the one they want, or has one
 * generated to use or edit. The rules (passwordPolicy.ts) tick off as it is
 * typed, and it is shown in the clear by default — the person setting it is
 * the one who has to pass it on, and a mistyped password nobody could see is
 * a locked-out user.
 *
 * Saving asks first: the person is signed out everywhere else, emailed the new
 * password and a copy is kept — see finishPasswordSet. The action decides who
 * the password is for; this only collects it.
 */
export function SetPasswordForm({
  name,
  email,
  self = false,
  action,
  onDone,
}: {
  /** Whose it is, as the confirmation and the labels say it. */
  name: string;
  /** Where the new password will be emailed, when known. */
  email?: string | null;
  /** The Super Admin's own password: they stay signed in here. */
  self?: boolean;
  action: (password: string) => Promise<SetPasswordResult>;
  /** Told once it has worked, so a panel can drop a revealed copy that is now stale. */
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(true);
  const [saved, setSaved] = useState<{ credentials: Credentials; emailed: boolean; warning?: string } | null>(null);
  const save = useButtonAction();

  const rules = passwordRules(password);
  const problem = chosenPasswordError(password);

  async function handleSave() {
    if (problem) return;
    const whom = self ? "your own password" : `${name}'s password`;
    const effects = self
      ? "You'll stay signed in here; every other device signed in as you is signed out."
      : `They'll be signed out of every device they're signed in on${email ? `, and emailed the new password at ${email}` : ""}.`;
    if (!confirm(`Set ${whom}?\n\n${effects}\n\nA copy is kept so you can reveal it later.`)) return;
    const result = await save.run(() => action(password));
    if (result && "success" in result && result.success) {
      setSaved({ credentials: { email: result.email, password: result.password }, emailed: result.emailed, warning: result.warning });
      setOpen(false);
      setPassword("");
      onDone?.();
    }
  }

  if (!open) {
    return (
      <div data-set-password>
        <Button
          type="button"
          onClick={() => {
            setOpen(true);
            setSaved(null);
          }}
          data-set-password-open
        >
          <KeyRound aria-hidden className="h-4 w-4" />
          {self ? "Set my password" : "Set a password"}
        </Button>
        {saved && (
          <>
            <CredentialsBox
              credentials={saved.credentials}
              note={saved.emailed ? <span className="text-xs text-success">Emailed to {saved.credentials.email}.</span> : null}
            />
            {saved.warning && <p className="mt-2 text-xs text-warning">{saved.warning}</p>}
          </>
        )}
      </div>
    );
  }

  return (
    <div data-set-password className="rounded-lg border border-border bg-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="set-password-input" className="text-xs font-medium text-ink">
          {self ? "Your new password" : `New password for ${name}`}
        </label>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPassword("");
          }}
          aria-label="Cancel"
          className="rounded p-1 text-muted hover:bg-card hover:text-ink"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            id="set-password-input"
            name="new_password"
            type={shown ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            autoCapitalize="off"
            className="pr-9 font-mono tracking-wide"
            data-set-password-input
          />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? "Hide the password" : "Show the password"}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted hover:text-ink"
          >
            {shown ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
          </button>
        </div>
        <Button
          type="button"
          onClick={() => {
            setPassword(generatePassword());
            setShown(true);
          }}
          data-set-password-generate
        >
          <Sparkles aria-hidden className="h-4 w-4" />
          Generate
        </Button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Password rules">
        {rules.map((r) => (
          <li key={r.id} className={`flex items-center gap-1 text-[11px] ${r.met ? "text-success" : "text-muted"}`}>
            {r.met ? <Check aria-hidden className="h-3.5 w-3.5" /> : <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />}
            {r.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">
        {self
          ? "You'll stay signed in here; your other devices are signed out."
          : `They'll be signed out everywhere${email ? ` and emailed it at ${email}` : ""}.`}{" "}
        A copy is kept so you can reveal it later.
      </p>
      {password && problem && <p className="mt-1 text-[11px] text-warning">{problem}</p>}
      <div className="mt-3">
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={Boolean(problem)}
          pending={save.pending}
          status={{ state: save.state, label: "Password set.", showError: true }}
          data-set-password-save
        >
          Save password
        </Button>
      </div>
    </div>
  );
}

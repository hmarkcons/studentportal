"use client";

import { useState } from "react";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  copyStudentLogins,
  emailStudentLogins,
  sectionLogins,
  type CredentialScope,
  type SectionLogin,
} from "@/lib/actions/studentCredentials";

type Copied = { labels: string[]; whatsapp: string | null; text: string; onClipboard: boolean };

/**
 * "Send to student" and "Copy as message" for a student's logins
 * (studentCredentials), in either of the two places that send them:
 *
 *   scope "portal"   Registration & Portal Access: this portal's own login and
 *                    nothing else. Send asks first, naming the address; Copy
 *                    copies at once.
 *   scope "section"  Portal credentials: either button opens the list of the
 *                    section's logins to tick — none to begin with, the ticks
 *                    shared between the two — and ends in "Send email" or
 *                    "Copy message".
 *
 * Copying offers to open WhatsApp on the student's number with the message
 * typed in. Either leaves a note on the student's timeline saying which logins
 * went, and who sent them; never a password.
 */
export function SendCredentialsBar({ studentId, email, scope }: { studentId: string; email: string | null; scope: CredentialScope }) {
  const [busy, setBusy] = useState<"open" | "email" | "copy" | null>(null);
  // Which panel is open: the address check before an email, or the chooser.
  const [mode, setMode] = useState<"email" | "copy" | null>(null);
  const [choices, setChoices] = useState<SectionLogin[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [emailed, setEmailed] = useState<{ to: string; labels: string[] } | null>(null);
  const [copied, setCopied] = useState<Copied | null>(null);
  const [showText, setShowText] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types = scope === "section" ? [...ticked] : undefined;

  function clearOutcome() {
    setError(null);
    setEmailed(null);
    setCopied(null);
    setShowText(false);
  }

  async function open(next: "email" | "copy") {
    clearOutcome();
    if (scope === "portal") {
      if (next === "copy") return copy();
      return setMode("email");
    }
    setMode(next);
    // The list once per visit to the section: what is saved changes only when
    // somebody saves, and then the page reloads it.
    if (choices) return;
    setBusy("open");
    const result = await sectionLogins(studentId);
    setBusy(null);
    if ("error" in result) {
      setMode(null);
      return setError(result.error);
    }
    setChoices(result.logins);
  }

  async function sendEmail() {
    setBusy("email");
    const result = await emailStudentLogins(scope, studentId, types);
    setBusy(null);
    if ("error" in result) return setError(result.error);
    setMode(null);
    setEmailed({ to: result.to, labels: result.labels });
  }

  function copy() {
    clearOutcome();
    setBusy("copy");
    const request = copyStudentLogins(scope, studentId, types);
    const text = request.then((r) => {
      if ("error" in r) throw new Error(r.error);
      return r.text;
    });
    text.catch(() => {});
    // Started inside the click, with the text still on its way: Safari only
    // lets a page write to the clipboard during the click itself, and the
    // server's answer arrives after it.
    let clipboard: Promise<unknown>;
    try {
      clipboard =
        typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
          ? navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) })])
          : text.then((t) => navigator.clipboard.writeText(t));
    } catch (e) {
      clipboard = Promise.reject(e);
    }
    void request.then(async (r) => {
      if ("error" in r) {
        setBusy(null);
        setError(r.error);
        return;
      }
      const onClipboard = await clipboard.then(
        () => true,
        // One more try the plain way, before saying it did not work.
        () => navigator.clipboard?.writeText(r.text).then(() => true, () => false) ?? false
      );
      setBusy(null);
      setMode(null);
      setCopied({ labels: r.labels, whatsapp: r.whatsapp, text: r.text, onClipboard });
      // A browser that refused the clipboard must not leave anyone thinking it
      // worked: the message is shown, ready to select by hand.
      if (!onClipboard) setShowText(true);
    });
  }

  function toggle(type: string) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const what = scope === "portal" ? "their HMARK portal login" : "the logins ticked";
  const savedChoices = choices?.filter((c) => c.saved) ?? [];

  return (
    <div className="rounded-md border border-border bg-bg p-3" data-send-credentials={scope}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" size="sm" onClick={() => open("email")} pending={busy === "open" && mode === "email"} disabled={!email}>
          <Mail aria-hidden className="h-3.5 w-3.5" />
          Send to student
        </Button>
        <Button
          type="button"
          variant="outline-primary"
          size="sm"
          onClick={() => open("copy")}
          pending={(busy === "copy" && scope === "portal") || (busy === "open" && mode === "copy")}
        >
          <Copy aria-hidden className="h-3.5 w-3.5" />
          Copy as message
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {scope === "portal"
          ? "Sends their login for this portal — the email or Student ID, the password, and where to sign in — and nothing else."
          : "Choose which of the logins below to send. This portal's own login is sent from Registration & Portal Access."}{" "}
        {email ? (
          <>
            Email goes to <span className="text-ink">{email}</span>.
          </>
        ) : (
          "There is no email on their record, so copy it as a message instead."
        )}
      </p>

      {/* Portal: the address, checked before anything is sent. */}
      {scope === "portal" && mode === "email" && email && (
        <div className="mt-3 rounded-md border border-border bg-card p-3" data-confirm-credentials-email>
          <p className="text-sm text-ink">
            Email {what} to <span className="font-medium">{email}</span>?
          </p>
          <p className="mt-1 text-xs text-muted">The password is in the email, so check the address is the student&rsquo;s own.</p>
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" variant="primary" size="sm" onClick={sendEmail} pending={busy === "email"}>
              Send email
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)} disabled={busy === "email"}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Section: the logins to tick, then send or copy just those. */}
      {scope === "section" && mode && choices && (
        <div className="mt-3 rounded-md border border-border bg-card p-3" data-credentials-chooser={mode}>
          <p className="text-sm text-ink">{mode === "email" ? "Choose what to email" : "Choose what to copy"}</p>
          <ul className="mt-2 flex flex-col gap-1.5" data-credentials-choices>
            {choices.map((c) => (
              <li key={c.credentialType}>
                <label className={`flex items-center gap-2 text-sm ${c.saved ? "text-ink" : "text-muted"}`}>
                  <input
                    type="checkbox"
                    checked={ticked.has(c.credentialType)}
                    onChange={() => toggle(c.credentialType)}
                    disabled={!c.saved}
                    data-credential-choice={c.credentialType}
                    className="h-4 w-4"
                  />
                  {c.label}
                  {!c.saved && <span className="text-xs">— nothing saved</span>}
                </label>
              </li>
            ))}
          </ul>
          {savedChoices.length === 0 && <p className="mt-2 text-xs text-muted">Nothing is saved here yet — save a login below first.</p>}
          {mode === "email" && <p className="mt-2 text-xs text-muted">The passwords are in the email, so check the address is the student&rsquo;s own.</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {mode === "email" ? (
              <Button type="button" variant="primary" size="sm" onClick={sendEmail} pending={busy === "email"} disabled={ticked.size === 0 || !email}>
                {ticked.size === 0 ? "Send email" : `Send ${ticked.size} by email to ${email}`}
              </Button>
            ) : (
              <Button type="button" variant="primary" size="sm" onClick={copy} pending={busy === "copy"} disabled={ticked.size === 0}>
                {ticked.size === 0 ? "Copy message" : `Copy ${ticked.size} as a message`}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)} disabled={busy === "email" || busy === "copy"}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {emailed && (
        <p className="mt-2 text-xs text-success" data-credentials-emailed role="status">
          Emailed {emailed.labels.join(", ")} to {emailed.to}. A note is on the student&rsquo;s timeline.
        </p>
      )}

      {copied && (
        <div className="mt-2 text-xs" data-credentials-copied={copied.onClipboard ? "clipboard" : "manual"} role="status">
          <p className={copied.onClipboard ? "text-success" : "text-warning"}>
            {copied.onClipboard
              ? `Copied ${copied.labels.join(", ")} as one message — paste it into WhatsApp.`
              : "Your browser did not allow copying — select the message below and copy it."}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {copied.whatsapp && (
              <a
                href={copied.whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                data-credentials-whatsapp
              >
                <MessageCircle aria-hidden className="h-3.5 w-3.5" />
                Open WhatsApp with it typed in
              </a>
            )}
            <button type="button" onClick={() => setShowText((v) => !v)} className="font-medium text-primary hover:underline">
              {showText ? "Hide message" : "Show message"}
            </button>
          </div>
          {showText && (
            <textarea
              readOnly
              value={copied.text}
              rows={Math.min(16, copied.text.split("\n").length + 1)}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 w-full rounded-md border border-border bg-card p-2 font-mono text-xs text-ink"
              aria-label="The message, to copy by hand"
              data-credentials-text
            />
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

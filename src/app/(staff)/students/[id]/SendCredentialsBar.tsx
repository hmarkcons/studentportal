"use client";

import { useState } from "react";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { copyStudentCredentials, emailStudentCredentials, previewStudentCredentials } from "@/lib/actions/studentCredentials";

type Copied = { labels: string[]; whatsapp: string | null; text: string; onClipboard: boolean };

/**
 * Sends the student every login on file: by email to the address on their
 * record, or copied as one message to paste into WhatsApp (studentCredentials).
 *
 * Email asks first — it says what is going, and where, before anything is
 * sent. Copy copies at once, and offers to open WhatsApp on the student's
 * number with the message typed in. Either leaves a note on the student's
 * timeline saying which logins went, and who sent them; never a password.
 */
export function SendCredentialsBar({ studentId, email }: { studentId: string; email: string | null }) {
  const [busy, setBusy] = useState<"preview" | "email" | "copy" | null>(null);
  const [confirming, setConfirming] = useState<{ labels: string[]; email: string } | null>(null);
  const [emailedTo, setEmailedTo] = useState<string | null>(null);
  const [copied, setCopied] = useState<Copied | null>(null);
  const [showText, setShowText] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setError(null);
    setEmailedTo(null);
    setCopied(null);
    setShowText(false);
    setConfirming(null);
  }

  async function askToEmail() {
    reset();
    setBusy("preview");
    const result = await previewStudentCredentials(studentId);
    setBusy(null);
    if ("error" in result) return setError(result.error);
    if (result.labels.length === 0) return setError("No logins are saved for this student yet.");
    if (!result.email) return setError("There is no email on this student's record — add one, or copy the logins as a message instead.");
    setConfirming({ labels: result.labels, email: result.email });
  }

  async function sendEmail() {
    setBusy("email");
    const result = await emailStudentCredentials(studentId);
    setBusy(null);
    setConfirming(null);
    if ("error" in result) return setError(result.error);
    setEmailedTo(result.to);
  }

  function copy() {
    reset();
    setBusy("copy");
    const request = copyStudentCredentials(studentId);
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
      setCopied({ labels: r.labels, whatsapp: r.whatsapp, text: r.text, onClipboard });
      // A browser that refused the clipboard must not leave anyone thinking it
      // worked: the message is shown, ready to select by hand.
      if (!onClipboard) setShowText(true);
    });
  }

  return (
    <div className="rounded-md border border-border bg-bg p-3" data-send-credentials>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" size="sm" onClick={askToEmail} pending={busy === "preview" || busy === "email"} disabled={!email}>
          <Mail aria-hidden className="h-3.5 w-3.5" />
          Email to student
        </Button>
        <Button type="button" variant="outline-primary" size="sm" onClick={copy} pending={busy === "copy"}>
          <Copy aria-hidden className="h-3.5 w-3.5" />
          Copy as message
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Every login on file goes in one go — this portal&rsquo;s own, with its sign-in link, then each one below and any kept
        on the student&rsquo;s applications.{" "}
        {email ? (
          <>
            The email goes to <span className="text-ink">{email}</span>.
          </>
        ) : (
          "There is no email on their record, so copy them as a message instead."
        )}
      </p>

      {confirming && (
        <div className="mt-3 rounded-md border border-border bg-card p-3" data-confirm-credentials-email>
          <p className="text-sm text-ink">
            Email {confirming.labels.length === 1 ? "this login" : `these ${confirming.labels.length} logins`} to{" "}
            <span className="font-medium">{confirming.email}</span>?
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-muted" data-credentials-labels>
            {confirming.labels.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">The passwords are in the email, so check the address is the student&rsquo;s own.</p>
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" variant="primary" size="sm" onClick={sendEmail} pending={busy === "email"}>
              Send email
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={busy === "email"}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {emailedTo && (
        <p className="mt-2 text-xs text-success" data-credentials-emailed role="status">
          Emailed to {emailedTo}. A note is on the student&rsquo;s timeline.
        </p>
      )}

      {copied && (
        <div className="mt-2 text-xs" data-credentials-copied={copied.onClipboard ? "clipboard" : "manual"} role="status">
          <p className={copied.onClipboard ? "text-success" : "text-warning"}>
            {copied.onClipboard
              ? `Copied ${copied.labels.length} login${copied.labels.length === 1 ? "" : "s"} as one message — paste it into WhatsApp.`
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

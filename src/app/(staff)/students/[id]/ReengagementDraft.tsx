"use client";

import { useActionState, useState } from "react";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { sendReengagementMessage, logWhatsappReengagement } from "@/lib/actions/reengagement";
import { whatsappLink, type ReengagementDraft as Draft } from "@/lib/reengagement";

/**
 * The message to a student who has stopped, ready to send.
 *
 * Deliberately a draft rather than something already sent. A counsellor often
 * marks a student ghosted straight after a difficult phone call, and a message
 * leaving by itself minutes later cannot be taken back — so the office writes
 * the wording once, in Setup, and a person presses send.
 *
 * Folded shut until asked for, because this sits inside the restart panel and
 * the first question on that panel is whether to restart at all, not what to
 * write.
 */
export function ReengagementDraft({
  studentId,
  draft,
  studentEmail,
  contactNumber,
  templatesMissing,
}: {
  studentId: string;
  draft: Draft | null;
  studentEmail: string | null;
  contactNumber: string | null;
  templatesMissing: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Held as "what the counsellor changed", not "the message" — null until they
  // actually type, so the text shown is always the newest draft from the
  // server unless somebody has deliberately edited it.
  //
  // Seeded state would have been wrong here. React does not reseed state when
  // props change, so a student switched from ghosted to withdrawn would keep
  // whichever message was on screen when the component mounted: the chase
  // message, under a panel that now says Withdrawn. The dashboard does re-render
  // and would correct itself — it just takes several seconds on a page this
  // heavy, and "wrong for a few seconds" is long enough to press Send.
  const [editedSubject, setEditedSubject] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState<string | null>(null);
  const subject = editedSubject ?? draft?.subject ?? "";
  const body = editedBody ?? draft?.body ?? "";
  const [copied, setCopied] = useState(false);
  const send = sendReengagementMessage.bind(null, studentId);
  const logIt = logWhatsappReengagement.bind(null, studentId);
  const [sendState, sendAction, sending] = useActionState(send, undefined);
  const [logState, logAction, logging] = useActionState(logIt, undefined);

  if (templatesMissing) {
    return (
      <p className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
        No re-engagement wording is saved yet. Set it up in{" "}
        <strong className="font-medium text-ink">Setup › Re-engagement messages</strong> and it will appear here ready
        to send.
      </p>
    );
  }
  if (!draft) return null;

  const waLink = whatsappLink(contactNumber, body);

  async function copyForWhatsapp() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
    } catch {
      // A browser that refuses the clipboard should not leave the counsellor
      // thinking it worked.
      setCopied(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        data-collapsible-toggle
        onClick={() => setOpen(true)}
        className="mt-3 w-fit rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-bg"
      >
        ✉️ Write to them {draft.kind === "ghost" ? "— suggested chase message" : "— suggested win-back message"}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink">
          {draft.kind === "ghost" ? "Suggested message — gone quiet" : "Suggested message — withdrew"}
        </p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:underline">
          Hide
        </button>
      </div>
      <p className="mb-2 text-[11px] text-muted">
        Written by the office in Setup and filled in for this student. Edit it here if you want — nothing is sent until
        you press a button below.
      </p>

      <form action={sendAction} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Subject (used for the email)
          <Input name="subject" value={subject} onChange={(e) => setEditedSubject(e.target.value)} maxLength={300} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Message
          <Textarea name="body" value={body} onChange={(e) => setEditedBody(e.target.value)} rows={10} maxLength={6000} />
        </label>

        <label className="flex items-center gap-1.5 text-xs text-ink">
          <input type="checkbox" name="also_email" defaultChecked={Boolean(studentEmail)} disabled={!studentEmail} />
          {studentEmail ? (
            <>
              Also email it to <span className="font-mono text-[11px]">{studentEmail}</span>
            </>
          ) : (
            "No email on file — this will go to their portal only"
          )}
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {/* Says where it went, beside the button that sent it. */}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            pending={sending}
            status={{
              state: sendState,
              label: `Sent${sendState?.emailed ? " to their portal and email" : " to their portal"}.`,
            }}
          >
            Send
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={copyForWhatsapp}>
            {copied ? "Copied ✓" : "Copy for WhatsApp"}
          </Button>
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-bg"
            >
              Open in WhatsApp ↗
            </a>
          )}
        </div>

        {sendState?.error && <p className="text-xs text-danger">{sendState.error}</p>}
      </form>

      {/* Offered only once the text has actually been copied. Logging a
          message nobody sent would make the thread worse than no thread. */}
      {copied && !logState?.success && (
        <form action={logAction} className="mt-2 border-t border-border pt-2">
          <input type="hidden" name="body" value={body} />
          <p className="mb-1 text-[11px] text-muted">
            Copied. Once you have actually sent it on WhatsApp, record it so the next person can see it went:
          </p>
          <Button type="submit" variant="outline" size="sm" pending={logging}>
            Log as sent on WhatsApp
          </Button>
          {logState?.error && <p className="mt-1 text-xs text-danger">{logState.error}</p>}
        </form>
      )}
      {logState?.success && <p className="mt-2 text-xs text-success">Recorded on their message thread.</p>}
    </div>
  );
}

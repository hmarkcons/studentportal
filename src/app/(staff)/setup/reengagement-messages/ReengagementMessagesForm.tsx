"use client";

import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useFormAction } from "@/components/useFormAction";
import { updateReengagementMessages } from "@/lib/actions/reengagement";
import { REENGAGEMENT_PLACEHOLDERS } from "@/lib/reengagement";

export type ReengagementRow = {
  ghost_subject: string;
  ghost_body: string;
  withdrawn_subject: string;
  withdrawn_body: string;
};

/**
 * The two messages, edited together.
 *
 * Through useFormAction rather than a plain form action: React restores an
 * uncontrolled field to its server default once an action finishes, so a
 * refused save on this screen used to empty the very wording somebody had
 * just written. See the note in useFormAction.
 */
export function ReengagementMessagesForm({ initial, canEdit }: { initial: ReengagementRow; canEdit: boolean }) {
  const { onSubmit, pending, error, success } = useFormAction(updateReengagementMessages);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <section className="rounded-lg border border-border p-4">
        <h3 className="mb-1 text-sm font-semibold text-ink">When a student has gone quiet</h3>
        <p className="mb-3 text-xs text-muted">
          They have probably not decided anything — they have gone quiet, which is usually circumstance. This one
          assumes that, and makes replying as easy as possible.
        </p>
        <label className="mb-2 flex flex-col gap-1 text-xs text-muted">
          Subject
          <Input name="ghost_subject" defaultValue={initial.ghost_subject} maxLength={300} disabled={!canEdit} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Message
          <Textarea name="ghost_body" defaultValue={initial.ghost_body} rows={12} maxLength={6000} disabled={!canEdit} />
        </label>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h3 className="mb-1 text-sm font-semibold text-ink">When a student has withdrawn</h3>
        <p className="mb-3 text-xs text-muted">
          They have decided. A message that argues with that is how a consultancy earns a reputation — this one exists
          to leave the door open and to offer to stop contacting them.
        </p>
        <label className="mb-2 flex flex-col gap-1 text-xs text-muted">
          Subject
          <Input name="withdrawn_subject" defaultValue={initial.withdrawn_subject} maxLength={300} disabled={!canEdit} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Message
          <Textarea
            name="withdrawn_body"
            defaultValue={initial.withdrawn_body}
            rows={12}
            maxLength={6000}
            disabled={!canEdit}
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted">
          You can use{" "}
          {REENGAGEMENT_PLACEHOLDERS.map((p) => (
            <code key={p} className="mx-0.5 rounded bg-bg px-1">
              {p}
            </code>
          ))}{" "}
          — filled in with the student&rsquo;s first name and whoever holds them. Anything else in braces reaches them
          exactly as typed, so it is refused.
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save messages"}
          </Button>
          {error && <span className="text-xs text-danger">{error}</span>}
          {success && !error && <span className="text-xs text-success">Saved.</span>}
        </div>
      )}
      {!canEdit && (
        <p className="text-xs text-muted">You can read these but not change them.</p>
      )}
    </form>
  );
}

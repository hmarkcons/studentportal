"use client";

import { useActionState, useState } from "react";
import { updateTicketSubject } from "@/lib/actions/support";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// Read-only with a pencil, rather than a permanently open field: the subject is
// read on every visit and corrected rarely.
export function TicketSubject({
  ticketId,
  subject,
  revalidateTo,
}: {
  ticketId: string;
  subject: string;
  revalidateTo: string;
}) {
  const [editing, setEditing] = useState(false);
  const action = updateTicketSubject.bind(null, ticketId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!editing) {
    return (
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-ink">
        {subject}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md border border-border px-1.5 py-0.5 text-xs font-normal text-muted hover:text-ink"
          aria-label="Edit subject"
          title="Fix a garbled subject"
        >
          ✏️
        </button>
      </h2>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Input name="subject" defaultValue={subject} required maxLength={200} className="w-full" />
      {/* Says what is and is not editable, so nobody hunts for a way to fix the
          description itself. */}
      <p className="text-xs text-muted">
        The subject only. The student&rsquo;s description below stays as they wrote it — correct it in a reply.
      </p>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="text-xs text-success">Saved.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          {state?.success ? "Close" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}

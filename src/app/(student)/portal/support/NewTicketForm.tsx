"use client";

import { useActionState } from "react";
import { createTicket } from "@/lib/actions/support";

export function NewTicketForm({ studentId }: { studentId: string }) {
  const action = createTicket.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input name="subject" placeholder="Subject" required className="rounded-md border border-border px-3 py-2 text-sm" />
      <textarea name="body" placeholder="How can we help?" required rows={3} className="rounded-md border border-border px-3 py-2 text-sm" />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="self-start rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
        Submit ticket
      </button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { createMessageTemplate } from "@/lib/actions/messageTemplates";

export function NewTemplateForm() {
  const [state, formAction, pending] = useActionState(createMessageTemplate, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input name="purpose" placeholder="Purpose (e.g. Document reminder)" required className="min-w-[220px] flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
        <select name="channel" required className="rounded-md border border-border px-2 py-1.5 text-sm">
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </div>
      <input name="subject" placeholder="Subject (email only)" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <textarea name="body" placeholder="Message body…" required rows={3} className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        {pending ? "Adding…" : "Add template"}
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

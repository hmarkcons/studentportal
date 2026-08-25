"use client";

import { useActionState } from "react";
import { createSocialPost } from "@/lib/actions/marketing";

export function NewSocialPostForm() {
  const [state, formAction, pending] = useActionState(createSocialPost, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input name="post_date" type="date" required className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="theme" placeholder="Content theme" required className="min-w-[200px] flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="platforms" placeholder="Facebook, Instagram" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add slot
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

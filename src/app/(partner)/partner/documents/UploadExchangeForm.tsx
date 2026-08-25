"use client";

import { useActionState } from "react";
import { partnerUploadDocument } from "@/lib/actions/partner";

export function UploadExchangeForm({ universityId }: { universityId: string }) {
  const action = partnerUploadDocument.bind(null, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="file" name="file" required className="text-sm" />
      <input name="description" placeholder="Description" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Upload
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

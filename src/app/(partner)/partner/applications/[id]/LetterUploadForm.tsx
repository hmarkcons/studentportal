"use client";

import { useActionState } from "react";
import { partnerUploadLetter } from "@/lib/actions/partner";

export function LetterUploadForm({ applicationId, category, label }: { applicationId: string; category: "offer_letter" | "rejection_letter"; label: string }) {
  const action = partnerUploadLetter.bind(null, applicationId, category);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="file" name="file" required className="text-xs" />
      <button type="submit" disabled={pending} className="rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary disabled:opacity-50">
        Upload {label}
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

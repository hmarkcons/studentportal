"use client";

import { useActionState } from "react";
import { partnerUploadLetter } from "@/lib/actions/partner";
import { Button } from "@/components/ui/Button";

export function LetterUploadForm({ applicationId, category, label }: { applicationId: string; category: "offer_letter" | "rejection_letter"; label: string }) {
  const action = partnerUploadLetter.bind(null, applicationId, category);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {/* max-w-full + wrapping: the native file input's intrinsic minimum
          width pushed the upload button off-screen at 320px. */}
      <input type="file" name="file" required className="max-w-full text-xs" />
      <Button type="submit" variant="outline-primary" size="sm" pending={pending}>
        Upload {label}
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

"use client";

import { useState } from "react";
import { finalizeApplication, unfinalizeApplication } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";

export function FinalizeApplicationButton({
  applicationId,
  studentId,
  revalidateTo,
  isFinalized,
  actionLabel = "Finalize for visa",
  badgeLabel = "Finalized for visa",
  blockedByOther = false,
}: {
  applicationId: string;
  studentId: string;
  revalidateTo: string;
  isFinalized: boolean;
  /** What this destination calls the act — "Pre-Enroll University" for Italy,
   *  and whatever a destination added tomorrow calls it. Set in Setup >
   *  Destinations rather than compared against a country code here. */
  actionLabel?: string;
  badgeLabel?: string;
  // True when a different application is the finalized one — that has to be
  // un-finalized before another can take its place.
  blockedByOther?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setPending(true);
    setError(null);
    const result = isFinalized
      ? await unfinalizeApplication(applicationId, studentId, revalidateTo)
      : await finalizeApplication(applicationId, studentId, revalidateTo);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div className="flex flex-col items-end">
      <Button
        type="button"
        onClick={handle}
        pending={pending}
        disabled={blockedByOther}
        title={
          blockedByOther
            ? `Another university is already ${badgeLabel.toLowerCase()} — undo that first to choose a different one.`
            : undefined
        }
        size="sm"
        variant={isFinalized ? "success" : "outline"}
        // Stops "Un-finalize" breaking at its hyphen when the row is tight.
        className="whitespace-nowrap"
      >
        {isFinalized ? `Undo ${badgeLabel.toLowerCase()}` : actionLabel}
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

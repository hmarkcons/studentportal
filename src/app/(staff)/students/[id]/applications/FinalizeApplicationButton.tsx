"use client";

import { useState } from "react";
import { finalizeApplication, unfinalizeApplication } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";

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
  const run = useButtonAction();
  // What the last press did, fixed at the time of the press: the button's own
  // label flips to the opposite act as soon as the page catches up.
  const [done, setDone] = useState("");

  async function handle() {
    setDone(isFinalized ? "Undone." : `${badgeLabel}.`);
    await run.run(() =>
      isFinalized
        ? unfinalizeApplication(applicationId, studentId, revalidateTo)
        : finalizeApplication(applicationId, studentId, revalidateTo)
    );
  }

  return (
    <div className="flex flex-col items-end">
      <Button
        type="button"
        onClick={handle}
        pending={run.pending}
        status={{ state: run.state, label: done, showError: true }}
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
    </div>
  );
}

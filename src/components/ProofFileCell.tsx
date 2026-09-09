"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { addedLine } from "@/lib/activityStamp";

type ActionState = { error?: string; success?: boolean } | undefined;

export function ProofFileCell({
  viewUrl,
  uploadedAt,
  uploadAction,
}: {
  viewUrl?: string | null;
  /** When the proof on file arrived — 0155. */
  uploadedAt?: string | null;
  uploadAction: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(uploadAction, undefined);

  return (
    <div className="flex flex-col gap-1">
      {viewUrl && (
        <a
          href={viewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          👁️ View proof
        </a>
      )}
      {/* Every caller shows the proof through this cell, so the date lives
          here rather than being remembered in each table. */}
      {addedLine(uploadedAt, "Uploaded") && (
        <span className="text-xs text-muted">{addedLine(uploadedAt, "Uploaded")}</span>
      )}
      <form action={formAction} className="flex items-center gap-1">
        <input type="file" name="file" className="w-28 text-xs" />
        <Button type="submit" size="sm" pending={pending}>
          {viewUrl ? "Replace" : "Upload"}
        </Button>
      </form>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}

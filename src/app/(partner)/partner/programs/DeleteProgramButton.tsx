"use client";

import { partnerDeleteProgram } from "@/lib/actions/partner";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";

export function DeleteProgramButton({ id }: { id: string }) {
  // The row this sits in goes when the delete works, so success is a toast;
  // a failure is said beside the button, which is still there.
  const del = useButtonAction();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        onClick={() => del.run(() => partnerDeleteProgram(id), { toast: "Programme deleted." })}
        disabled={del.pending}
        className="w-fit text-xs text-danger hover:underline disabled:opacity-50"
      >
        {del.pending ? "Deleting…" : "Delete"}
      </button>
      <ActionStatus state={del.state} pending={del.pending} label="Deleted." showError />
    </span>
  );
}

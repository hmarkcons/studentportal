"use client";

import { useButtonAction } from "@/components/useButtonAction";
import { deleteApplication } from "@/lib/actions/applications";

export function DeleteApplicationButton({ applicationId, revalidateTo, label }: { applicationId: string; revalidateTo: string; label: string }) {
  // The application's card goes with it, so a delete confirms with a toast; a
  // refusal is still said under the button that is still there.
  const del = useButtonAction();

  async function handleDelete() {
    if (!confirm(`Delete this application to ${label}? This also deletes its documents, tasks, and visa record.`)) return;
    await del.run(() => deleteApplication(applicationId, revalidateTo), { toast: "Deleted." });
  }

  return (
    <div>
      <button onClick={handleDelete} disabled={del.pending} className="w-fit text-xs text-danger hover:underline disabled:opacity-50">
        {del.pending ? "Deleting…" : "🗑️ Delete"}
      </button>
      {del.state?.error && <p className="text-xs text-danger">{del.state.error}</p>}
    </div>
  );
}

"use client";

import { deleteApplication } from "@/lib/actions/applications";

export function DeleteApplicationButton({ applicationId, revalidateTo, label }: { applicationId: string; revalidateTo: string; label: string }) {
  return (
    <button
      onClick={() => {
        if (confirm(`Delete this application to ${label}? This also deletes its documents, tasks, and visa record.`)) {
          deleteApplication(applicationId, revalidateTo);
        }
      }}
      className="text-xs text-danger hover:underline"
    >
      🗑️ Delete
    </button>
  );
}

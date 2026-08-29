"use client";

import { useState } from "react";
import { deleteApplication } from "@/lib/actions/applications";

export function DeleteApplicationButton({ applicationId, revalidateTo, label }: { applicationId: string; revalidateTo: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete this application to ${label}? This also deletes its documents, tasks, and visa record.`)) return;
    setPending(true);
    setError(null);
    const result = await deleteApplication(applicationId, revalidateTo);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div>
      <button onClick={handleDelete} disabled={pending} className="text-xs text-danger hover:underline disabled:opacity-50">
        {pending ? "Deleting…" : "🗑️ Delete"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

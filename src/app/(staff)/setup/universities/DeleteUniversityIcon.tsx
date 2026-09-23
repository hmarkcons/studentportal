"use client";

import { deleteUniversity } from "@/lib/actions/universities";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";

export function DeleteUniversityIcon({ id, name }: { id: string; name: string }) {
  const del = useButtonAction();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete ${name}? This also deletes all its programs.`)) return;
    // deleteUniversity redirects on success (it throws internally, it never
    // returns) — this only resolves to a value on the error path. The row
    // goes with it, so success is a toast; a refusal is said beside the icon
    // instead of in an alert().
    await del.run(() => deleteUniversity(id), { toast: "Deleted." });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handleDelete}
        disabled={del.pending}
        aria-busy={del.pending || undefined}
        title="Delete university"
        aria-label="Delete university"
        className="w-fit rounded p-1 text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
      >
        🗑️
      </button>
      <ActionStatus state={del.state} pending={del.pending} label="Deleted." showError />
    </span>
  );
}

"use client";

import { deleteUniversity } from "@/lib/actions/universities";

export function DeleteUniversityIcon({ id, name }: { id: string; name: string }) {
  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete ${name}? This also deletes all its programs.`)) return;
    // deleteUniversity redirects on success (it throws internally, it never
    // returns) — this only resolves to a value on the error path.
    const result = await deleteUniversity(id);
    if (result?.error) alert(result.error);
  }

  return (
    <button
      onClick={handleDelete}
      title="Delete university"
      aria-label="Delete university"
      className="rounded p-1 text-muted hover:bg-danger-bg hover:text-danger"
    >
      🗑️
    </button>
  );
}

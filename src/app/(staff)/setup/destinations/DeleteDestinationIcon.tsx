"use client";

import { deleteDestination } from "@/lib/actions/destinations";

export function DeleteDestinationIcon({ id, name }: { id: string; name: string }) {
  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete ${name}? This also deletes all its universities and programs.`)) return;
    // deleteDestination redirects on success (it throws internally, it
    // never returns) — this only resolves to a value on the error path.
    const result = await deleteDestination(id);
    if (result?.error) alert(result.error);
  }

  return (
    <button
      onClick={handleDelete}
      title="Delete destination"
      aria-label="Delete destination"
      className="rounded p-1 text-muted hover:bg-danger-bg hover:text-danger"
    >
      🗑️
    </button>
  );
}

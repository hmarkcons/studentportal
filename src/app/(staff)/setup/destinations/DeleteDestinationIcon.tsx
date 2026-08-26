"use client";

import { deleteDestination } from "@/lib/actions/destinations";

export function DeleteDestinationIcon({ id, name }: { id: string; name: string }) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Delete ${name}? This also deletes all its universities and programs.`)) {
          deleteDestination(id);
        }
      }}
      title="Delete destination"
      aria-label="Delete destination"
      className="rounded p-1 text-muted hover:bg-danger-bg hover:text-danger"
    >
      🗑️
    </button>
  );
}

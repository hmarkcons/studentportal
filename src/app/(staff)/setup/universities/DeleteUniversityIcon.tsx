"use client";

import { deleteUniversity } from "@/lib/actions/universities";

export function DeleteUniversityIcon({ id, name }: { id: string; name: string }) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Delete ${name}? This also deletes all its programs.`)) {
          deleteUniversity(id);
        }
      }}
      title="Delete university"
      aria-label="Delete university"
      className="rounded p-1 text-muted hover:bg-danger-bg hover:text-danger"
    >
      🗑️
    </button>
  );
}

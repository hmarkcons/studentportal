"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteScholarshipBody } from "@/lib/actions/scholarships";

export function DeleteScholarshipBodyButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete ${name}?`)) return;
    setPending(true);
    setError(null);
    const result = await deleteScholarshipBody(id);
    setPending(false);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        title="Delete"
        className="rounded p-1 text-muted hover:text-danger disabled:opacity-50"
      >
        🗑️
      </button>
      {/* The refusal to delete a body a student is recorded against is the
          message that matters most here, so it is shown rather than swallowed. */}
      {error && <span className="ml-1 text-[11px] text-danger">{error}</span>}
    </>
  );
}

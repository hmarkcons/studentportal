"use client";

import { useState } from "react";
import { partnerDeleteProgram } from "@/lib/actions/partner";

export function DeleteProgramButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await partnerDeleteProgram(id);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div>
      <button onClick={handleDelete} disabled={pending} className="text-xs text-danger hover:underline disabled:opacity-50">
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

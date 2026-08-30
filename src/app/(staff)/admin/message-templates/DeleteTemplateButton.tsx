"use client";

import { useState } from "react";
import { deleteMessageTemplate } from "@/lib/actions/messageTemplates";

export function DeleteTemplateButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    const result = await deleteMessageTemplate(id);
    if (result?.error) setError(result.error);
  }

  return (
    <div>
      <button onClick={handleDelete} className="text-xs text-danger hover:underline">
        Delete
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

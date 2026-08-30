"use client";

import { useState } from "react";
import { deleteAgreementTemplate } from "@/lib/actions/agreementTemplates";

export function DeleteTemplateButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this agreement template?")) return;
    setError(null);
    // deleteAgreementTemplate redirects on success (it throws internally,
    // it never returns) — this only resolves to a value on the error path.
    const result = await deleteAgreementTemplate(id);
    if (result?.error) setError(result.error);
  }

  return (
    <div>
      <button onClick={handleDelete} className="text-xs text-muted hover:text-danger">
        🗑️
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

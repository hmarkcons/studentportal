"use client";

import { deleteAgreementTemplate } from "@/lib/actions/agreementTemplates";

export function DeleteTemplateButton({ id }: { id: string }) {
  return (
    <button
      onClick={() => {
        if (confirm("Delete this agreement template?")) deleteAgreementTemplate(id);
      }}
      className="text-xs text-muted hover:text-danger"
    >
      🗑️
    </button>
  );
}

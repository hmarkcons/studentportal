"use client";

import { deleteMessageTemplate } from "@/lib/actions/messageTemplates";

export function DeleteTemplateButton({ id }: { id: string }) {
  return (
    <button onClick={() => deleteMessageTemplate(id)} className="text-xs text-danger hover:underline">
      Delete
    </button>
  );
}

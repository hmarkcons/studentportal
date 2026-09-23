"use client";

import { deleteMessageTemplate } from "@/lib/actions/messageTemplates";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";

export function DeleteTemplateButton({ id }: { id: string }) {
  const del = useButtonAction();

  // The template's row goes with it, so success is a toast; a refusal stays
  // beside the button, which is still there.
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        onClick={() => del.run(() => deleteMessageTemplate(id), { toast: "Template deleted." })}
        disabled={del.pending}
        aria-busy={del.pending || undefined}
        className="w-fit text-xs text-danger hover:underline disabled:opacity-50"
      >
        Delete
      </button>
      <ActionStatus state={del.state} pending={del.pending} label="Deleted." showError />
    </span>
  );
}

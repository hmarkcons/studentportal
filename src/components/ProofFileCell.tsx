"use client";

import { useActionState } from "react";

type ActionState = { error?: string; success?: boolean } | undefined;

export function ProofFileCell({
  viewUrl,
  uploadAction,
}: {
  viewUrl?: string | null;
  uploadAction: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(uploadAction, undefined);

  return (
    <div className="flex flex-col gap-1">
      {viewUrl && (
        <a href={viewUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
          View proof
        </a>
      )}
      <form action={formAction} className="flex items-center gap-1">
        <input type="file" name="file" className="w-28 text-xs" />
        <button type="submit" disabled={pending} className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-ink disabled:opacity-50">
          {pending ? "…" : viewUrl ? "Replace" : "Upload"}
        </button>
      </form>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}

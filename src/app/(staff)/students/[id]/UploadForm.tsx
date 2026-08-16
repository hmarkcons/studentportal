"use client";

import { useActionState } from "react";
import { uploadDocument } from "@/lib/actions/documents";

export function UploadForm({ studentId, documentId }: { studentId: string; documentId: string }) {
  const boundAction = uploadDocument.bind(null, studentId, documentId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input
        type="file"
        name="file"
        required
        className="w-40 text-xs text-zinc-600 file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-xs dark:text-zinc-400 dark:file:bg-zinc-800"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
      {state?.error && <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>}
    </form>
  );
}

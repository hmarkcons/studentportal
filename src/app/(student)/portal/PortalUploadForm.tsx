"use client";

import { useActionState } from "react";
import { uploadDocument } from "@/lib/actions/documents";

export function PortalUploadForm({ studentId, documentId }: { studentId: string; documentId: string }) {
  const boundAction = uploadDocument.bind(null, studentId, documentId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <input
        type="file"
        name="file"
        required
        className="w-full text-xs text-zinc-600 file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-xs dark:text-zinc-400 dark:file:bg-zinc-800 sm:w-48"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
      {state?.error && <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>}
      {state?.success && <span className="text-xs text-emerald-600 dark:text-emerald-400">Uploaded.</span>}
    </form>
  );
}

"use client";

import { useState } from "react";
import { finalizeApplication, unfinalizeApplication } from "@/lib/actions/applications";

export function FinalizeApplicationButton({
  applicationId,
  studentId,
  revalidateTo,
  isFinalized,
}: {
  applicationId: string;
  studentId: string;
  revalidateTo: string;
  isFinalized: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setPending(true);
    setError(null);
    const result = isFinalized
      ? await unfinalizeApplication(applicationId, studentId, revalidateTo)
      : await finalizeApplication(applicationId, studentId, revalidateTo);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={handle}
        disabled={pending}
        className={`rounded-md border px-2 py-0.5 text-xs disabled:opacity-50 ${
          isFinalized ? "border-success text-success hover:bg-bg" : "border-border text-muted hover:bg-bg"
        }`}
      >
        {pending ? "…" : isFinalized ? "Un-finalize" : "Finalize for visa"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

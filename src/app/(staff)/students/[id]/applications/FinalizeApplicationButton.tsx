"use client";

import { useState } from "react";
import { finalizeApplication, unfinalizeApplication } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";

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
      <Button type="button" onClick={handle} pending={pending} size="sm" variant={isFinalized ? "success" : "outline"}>
        {isFinalized ? "Un-finalize" : "Finalize for visa"}
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

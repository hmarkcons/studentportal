"use client";

import { useTransition } from "react";
import { moveStudentStage } from "@/lib/actions/students";
import { STAGES, STAGE_LABELS } from "@/lib/stages";

export function StageMover({ studentId, currentStage }: { studentId: string; currentStage: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={currentStage}
      disabled={isPending}
      onChange={(e) => startTransition(() => moveStudentStage(studentId, e.target.value))}
      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
    >
      {STAGES.map((stage) => (
        <option key={stage} value={stage}>
          {STAGE_LABELS[stage]}
        </option>
      ))}
    </select>
  );
}

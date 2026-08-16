"use client";

import { useTransition } from "react";
import { updateDocumentStatus } from "@/lib/actions/documents";

const STATUS_LABELS: Record<string, string> = {
  missing: "Missing",
  submitted: "Submitted",
  under_review: "Under review",
  verified: "Verified",
  rejected: "Rejected",
};

export function DocumentStatusSelect({
  studentId,
  documentId,
  status,
}: {
  studentId: string;
  documentId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={status}
      disabled={isPending}
      onChange={(e) => startTransition(() => updateDocumentStatus(studentId, documentId, e.target.value))}
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
    >
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

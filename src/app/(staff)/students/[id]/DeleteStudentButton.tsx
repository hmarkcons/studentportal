"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteStudent } from "@/lib/actions/leads";

export function DeleteStudentButton({ studentId, studentName }: { studentId: string; studentName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (
      !confirm(
        `Permanently delete ${studentName}? This removes ALL of their data — applications, documents, agreements, invoices, commissions, tasks, and portal access. This cannot be undone.`
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await deleteStudent(studentId);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else {
      router.push("/students");
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleDelete}
        disabled={pending}
        className="text-xs text-danger hover:underline disabled:opacity-50"
      >
        {pending ? "Deleting…" : "🗑️ Delete student"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

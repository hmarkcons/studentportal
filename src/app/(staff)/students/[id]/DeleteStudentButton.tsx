"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteStudent } from "@/lib/actions/leads";
import { useButtonAction } from "@/components/useButtonAction";

export function DeleteStudentButton({
  studentId,
  studentName,
  redirectTo = "/students",
  label = "🗑️ Delete student",
}: {
  studentId: string;
  studentName: string;
  redirectTo?: string;
  label?: string;
}) {
  const router = useRouter();
  // The page goes with the student, so a delete confirms with a toast. Held
  // busy through the navigation that follows, as it always was.
  const del = useButtonAction();
  const [leaving, setLeaving] = useState(false);
  const pending = del.pending || leaving;

  async function handleDelete() {
    if (
      !confirm(
        `Permanently delete ${studentName}? This removes ALL of their data — applications, documents, agreements, invoices, commissions, tasks, and portal access. This cannot be undone.`
      )
    ) {
      return;
    }
    // Noted inside the action rather than read from run()'s return: run()
    // also answers undefined for a second click it ignored, and that must not
    // read as "deleted" and navigate away.
    let deleted = false;
    await del.run(
      async () => {
        const result = await deleteStudent(studentId);
        deleted = !result?.error;
        return result;
      },
      { toast: "Student deleted." }
    );
    if (deleted) {
      setLeaving(true);
      router.push(redirectTo);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleDelete}
        disabled={pending}
        className="w-fit text-xs text-danger hover:underline disabled:opacity-50"
      >
        {pending ? "Deleting…" : label}
      </button>
      {del.state?.error && <p className="mt-1 text-xs text-danger">{del.state.error}</p>}
    </div>
  );
}

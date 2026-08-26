"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewApplicationForStudent({ students }: { students: { id: string; full_name: string }[] }) {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");

  return (
    <div className="flex items-center gap-2">
      <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="">Choose student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>
      <button
        disabled={!studentId}
        onClick={() => router.push(`/students/${studentId}/applications/new`)}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50"
      >
        + Add application
      </button>
    </div>
  );
}

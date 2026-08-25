"use client";

import { useActionState, useMemo, useState } from "react";
import { createApplication } from "@/lib/actions/applications";

type University = { id: string; name: string };
type Program = { id: string; university_id: string; name: string };

export function NewApplicationForm({ studentId, universities, programs }: { studentId: string; universities: University[]; programs: Program[] }) {
  const action = createApplication.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [universityId, setUniversityId] = useState("");

  const filteredPrograms = useMemo(() => programs.filter((p) => p.university_id === universityId), [programs, universityId]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">University</label>
        <select
          name="university_id"
          required
          value={universityId}
          onChange={(e) => setUniversityId(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="">Choose…</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Program</label>
        <select name="program_id" className="rounded-md border border-border bg-card px-3 py-2 text-sm">
          <option value="">—</option>
          {filteredPrograms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Intake</label>
        <input name="intake" placeholder="e.g. Fall 2026" className="rounded-md border border-border bg-card px-3 py-2 text-sm" />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
        {pending ? "Creating…" : "Create application"}
      </button>
    </form>
  );
}

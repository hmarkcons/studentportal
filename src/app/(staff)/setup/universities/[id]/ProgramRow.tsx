"use client";

import { useActionState, useState } from "react";
import { updateProgram, deleteProgram } from "@/lib/actions/universities";
import { STUDY_LEVELS } from "@/lib/constants";

const inputClass = "rounded-md border border-border px-2 py-1 text-xs";

export type ProgramRowData = {
  id: string;
  level: string;
  name: string;
  core_field: string | null;
  sub_field: string | null;
  tuition_fee: number | null;
  duration: string | null;
  language_requirement: string | null;
  application_deadline: string | null;
};

export function ProgramRow({ program, universityId }: { program: ProgramRowData; universityId: string }) {
  const [editing, setEditing] = useState(false);
  const action = updateProgram.bind(null, program.id, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!editing) {
    return (
      <div className="flex items-center justify-between py-2 text-sm">
        <span className="text-ink">
          {program.level} · {program.name}
          {program.core_field && <span className="text-muted"> · {program.core_field}</span>}
        </span>
        <div className="flex items-center gap-3">
          {program.tuition_fee != null && <span className="text-muted">{program.tuition_fee}</span>}
          <button onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
            Edit
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete ${program.name}?`)) deleteProgram(program.id, universityId);
            }}
            className="text-xs text-danger hover:underline"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-b border-border py-2 last:border-0">
      <select name="level" defaultValue={program.level} className={inputClass}>
        {STUDY_LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <input name="name" defaultValue={program.name} required className={`${inputClass} min-w-[160px] flex-1`} />
      <input name="core_field" defaultValue={program.core_field ?? ""} placeholder="Core field" className={inputClass} />
      <input name="sub_field" defaultValue={program.sub_field ?? ""} placeholder="Sub-field" className={inputClass} />
      <input name="duration" defaultValue={program.duration ?? ""} placeholder="Duration" className={`${inputClass} w-24`} />
      <input name="tuition_fee" type="number" step="0.01" defaultValue={program.tuition_fee ?? ""} placeholder="Fee" className={`${inputClass} w-24`} />
      <input name="language_requirement" defaultValue={program.language_requirement ?? ""} placeholder="Language req." className={inputClass} />
      <input name="application_deadline" type="date" defaultValue={program.application_deadline ?? ""} className={inputClass} />
      <button type="submit" disabled={pending} className="rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary disabled:opacity-50">
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
        Cancel
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

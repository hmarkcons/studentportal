"use client";

import { useActionState, useState } from "react";
import { updateProgram, deleteProgram } from "@/lib/actions/universities";
import { STUDY_LEVELS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

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

export function ProgramRow({
  program,
  universityId,
  canEdit = false,
}: {
  program: ProgramRowData;
  universityId: string;
  canEdit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const action = updateProgram.bind(null, program.id, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  async function handleDelete() {
    if (!confirm(`Delete ${program.name}?`)) return;
    setDeleteError(null);
    const result = await deleteProgram(program.id, universityId);
    if (result?.error) setDeleteError(result.error);
  }

  if (!editing) {
    return (
      <div className="py-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink">
            {program.level} · {program.name}
            {program.core_field && <span className="text-muted"> · {program.core_field}</span>}
          </span>
          <div className="flex items-center gap-3">
            {program.tuition_fee != null && <span className="text-muted">{program.tuition_fee}</span>}
            {canEdit && (
              <>
                <button onClick={() => setEditing(true)} title="Edit program" aria-label="Edit program" className="rounded p-1 text-muted hover:bg-bg hover:text-primary">
                  ✏️
                </button>
                <button onClick={handleDelete} title="Delete program" aria-label="Delete program" className="rounded p-1 text-muted hover:bg-danger-bg hover:text-danger">
                  🗑️
                </button>
              </>
            )}
          </div>
        </div>
        {deleteError && <p className="mt-1 text-xs text-danger">{deleteError}</p>}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-b border-border py-2 last:border-0">
      <Select name="level" defaultValue={program.level}>
        {STUDY_LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </Select>
      <Input name="name" defaultValue={program.name} required className="min-w-[160px] flex-1" />
      <Input name="core_field" defaultValue={program.core_field ?? ""} placeholder="Core field" />
      <Input name="sub_field" defaultValue={program.sub_field ?? ""} placeholder="Sub-field" />
      <Input name="duration" defaultValue={program.duration ?? ""} placeholder="Duration" className="w-24" />
      <Input name="tuition_fee" type="number" step="0.01" defaultValue={program.tuition_fee ?? ""} placeholder="Fee" className="w-24" />
      <Input name="language_requirement" defaultValue={program.language_requirement ?? ""} placeholder="Language req." />
      <Input name="application_deadline" type="date" defaultValue={program.application_deadline ?? ""} />
      <Button type="submit" variant="outline-primary" size="sm" pending={pending}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

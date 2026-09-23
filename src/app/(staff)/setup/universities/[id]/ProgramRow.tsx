"use client";

import { useActionState, useState } from "react";
import { updateProgram, deleteProgram, upsertProgramCommissionRate } from "@/lib/actions/universities";
import { STUDY_LEVELS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";
import { ProgramDates } from "@/components/ProgramDates";
import { ProgramRoundsFields } from "@/components/ProgramRoundsFields";
import type { ProgramRound } from "@/lib/programRounds";

export type ProgramCommissionRate = { rate_percent: number | null; fixed_amount: number | null; currency: string } | null;

export type ProgramRowData = {
  id: string;
  level: string;
  name: string;
  core_field: string | null;
  sub_field: string | null;
  tuition_fee: number | null;
  duration: string | null;
  language_requirement: string | null;
  rounds: ProgramRound[];
  commission_rate: ProgramCommissionRate;
};

function CommissionRateEditor({
  program,
  universityId,
  onDone,
}: {
  program: ProgramRowData;
  universityId: string;
  onDone: () => void;
}) {
  const action = upsertProgramCommissionRate.bind(null, program.id, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mt-1 flex flex-wrap items-end gap-2 rounded-md border border-border bg-bg p-2">
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Rate %
        <Input name="rate_percent" type="number" step="0.01" defaultValue={program.commission_rate?.rate_percent ?? ""} placeholder="e.g. 15" className="w-20 px-2 py-1 text-xs" />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Fixed amount
        <Input name="fixed_amount" type="number" step="0.01" defaultValue={program.commission_rate?.fixed_amount ?? ""} placeholder="Optional" className="w-24 px-2 py-1 text-xs" />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Currency
        <Select name="currency" defaultValue={program.commission_rate?.currency ?? "EUR"} className="px-2 py-1 text-xs">
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
          <option value="PKR">PKR</option>
          <option value="GBP">GBP</option>
        </Select>
      </label>
      <Button type="submit" variant="outline-primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Close
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function ProgramRow({
  program,
  universityId,
  canEdit = false,
  canViewRate = false,
  canManageRate = false,
  today,
}: {
  program: ProgramRowData;
  universityId: string;
  canEdit?: boolean;
  canViewRate?: boolean;
  canManageRate?: boolean;
  /** Karachi's today, from the server — see ProgramDates. */
  today?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const del = useButtonAction();
  const action = updateProgram.bind(null, program.id, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  async function handleDelete() {
    if (!confirm(`Delete ${program.name}?`)) return;
    // The row goes with the programme, so success is a toast; a refusal is
    // said beside the icon that is still there.
    await del.run(() => deleteProgram(program.id, universityId), { toast: "Deleted." });
  }

  if (!editing) {
    return (
      <div className="py-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink">
            {program.level} · {program.name}
            {program.core_field && <span className="text-muted"> · {program.core_field}</span>}
            {/* The dates belong in the list, not only behind the edit pencil.
                A counselor scanning a university's programmes is usually
                looking for the one whose deadline has not gone yet — which is
                also why this leads with the open round rather than the first. */}
            <ProgramDates rounds={program.rounds} today={today} inline />
          </span>
          <div className="flex items-center gap-3">
            {program.tuition_fee != null && <span className="text-muted">{program.tuition_fee}</span>}
            {canViewRate && (
              <span className="text-xs text-muted">
                Commission:{" "}
                {program.commission_rate ? (
                  program.commission_rate.fixed_amount != null
                    ? `flat ${program.commission_rate.currency} ${program.commission_rate.fixed_amount}`
                    : `${program.commission_rate.rate_percent}%`
                ) : (
                  "not set"
                )}
                {canManageRate && (
                  <button onClick={() => setEditingRate(true)} className="ml-1 text-primary hover:underline">
                    edit
                  </button>
                )}
              </span>
            )}
            {canEdit && (
              <>
                <button onClick={() => setEditing(true)} title="Edit program" aria-label="Edit program" className="rounded p-1 text-muted hover:bg-bg hover:text-primary">
                  ✏️
                </button>
                <span className="inline-flex items-center gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={del.pending}
                    aria-busy={del.pending || undefined}
                    title="Delete program"
                    aria-label="Delete program"
                    className="w-fit rounded p-1 text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
                  >
                    🗑️
                  </button>
                  <ActionStatus state={del.state} pending={del.pending} label="Deleted." showError />
                </span>
              </>
            )}
          </div>
        </div>

        {editingRate && canManageRate && (
          <CommissionRateEditor program={program} universityId={universityId} onDone={() => setEditingRate(false)} />
        )}
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
      <ProgramRoundsFields rounds={program.rounds} />
      <Button type="submit" variant="outline-primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

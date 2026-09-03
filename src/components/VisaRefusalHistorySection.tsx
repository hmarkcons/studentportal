"use client";

import { useActionState, useState } from "react";
import { addVisaRefusalRecord, deleteVisaRefusalRecord } from "@/lib/actions/studentProfileExtras";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export type VisaRefusalRecord = { id: string; country: string; type: string; date: string | null; reason: string | null };

function AddVisaRefusalForm({ studentId, revalidateTo }: { studentId: string; revalidateTo: string }) {
  const action = addVisaRefusalRecord.bind(null, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Country
        <Input name="country" placeholder="e.g. UK" className="w-28" required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Type
        <Select name="type" defaultValue="refusal" className="w-28">
          <option value="refusal">Visa refusal</option>
          <option value="deportation">Deportation</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Date
        <Input name="date" type="date" />
      </label>
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
        Reason
        <Input name="reason" placeholder="Optional" className="min-w-[160px]" />
      </label>
      <Button type="submit" variant="outline-primary" size="sm" pending={pending}>
        + Add record
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function DeleteVisaRefusalButton({ studentId, recordId, revalidateTo }: { studentId: string; recordId: string; revalidateTo: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await deleteVisaRefusalRecord(studentId, recordId, revalidateTo);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={handleDelete} disabled={pending} className="text-xs text-danger hover:underline disabled:opacity-50">
        🗑️ Remove
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function VisaRefusalHistorySection({
  studentId,
  revalidateTo,
  records,
}: {
  studentId: string;
  revalidateTo: string;
  records: VisaRefusalRecord[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {records.length > 0 && (
        <div className="flex flex-col divide-y divide-border rounded-md border border-border">
          {records.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-ink">
                {r.country} — <span className="font-medium">{r.type === "deportation" ? "Deportation" : "Visa refusal"}</span>
                {r.date && <span className="ml-2 text-xs text-muted">{r.date}</span>}
                {r.reason && <span className="ml-2 text-xs text-muted">{r.reason}</span>}
              </span>
              <DeleteVisaRefusalButton studentId={studentId} recordId={r.id} revalidateTo={revalidateTo} />
            </div>
          ))}
        </div>
      )}
      {records.length === 0 && <p className="text-xs text-muted">No prior visa refusal or deportation on file.</p>}
      <AddVisaRefusalForm studentId={studentId} revalidateTo={revalidateTo} />
    </div>
  );
}

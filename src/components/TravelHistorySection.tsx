"use client";

import { useActionState, useState } from "react";
import { addTravelRecord, deleteTravelRecord } from "@/lib/actions/studentProfileExtras";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export type TravelRecord = { id: string; country: string; purpose: string | null; from_date: string | null; to_date: string | null };

function AddTravelForm({ studentId, revalidateTo }: { studentId: string; revalidateTo: string }) {
  const action = addTravelRecord.bind(null, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Country
        <Input name="country" placeholder="e.g. UAE" className="w-32" required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Purpose
        <Input name="purpose" placeholder="e.g. Tourism" className="w-32" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        From
        <Input name="from_date" type="date" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        To
        <Input name="to_date" type="date" />
      </label>
      <Button type="submit" variant="outline-primary" size="sm" pending={pending}>
        + Add trip
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function DeleteTravelButton({ studentId, recordId, revalidateTo }: { studentId: string; recordId: string; revalidateTo: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await deleteTravelRecord(studentId, recordId, revalidateTo);
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

export function TravelHistorySection({ studentId, revalidateTo, records }: { studentId: string; revalidateTo: string; records: TravelRecord[] }) {
  return (
    <div className="flex flex-col gap-3">
      {records.length > 0 && (
        <div className="flex flex-col divide-y divide-border rounded-md border border-border">
          {records.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-ink">
                {r.country}
                {r.purpose && <span className="text-muted"> · {r.purpose}</span>}
                {(r.from_date || r.to_date) && (
                  <span className="ml-2 text-xs text-muted">
                    {r.from_date ?? "—"} to {r.to_date ?? "—"}
                  </span>
                )}
              </span>
              <DeleteTravelButton studentId={studentId} recordId={r.id} revalidateTo={revalidateTo} />
            </div>
          ))}
        </div>
      )}
      {records.length === 0 && <p className="text-xs text-muted">No prior travel on file.</p>}
      <AddTravelForm studentId={studentId} revalidateTo={revalidateTo} />
    </div>
  );
}

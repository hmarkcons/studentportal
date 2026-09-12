"use client";

import { useActionState, useState } from "react";
import { saveTravelAndVisaHistory } from "@/lib/actions/studentProfileExtras";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export type TravelRecord = { id: string; country: string; purpose: string | null; from_date: string | null; to_date: string | null };
export type VisaRefusalRecord = { id: string; country: string; type: string; date: string | null; reason: string | null };

type TravelDraft = { key: string; id: string; country: string; purpose: string; from_date: string; to_date: string };
type VisaDraft = { key: string; id: string; country: string; type: string; date: string; reason: string };

// One section, one Save. Where a student has been and whether they have ever
// been refused is a single story a visa officer reads together, and both lists
// live on the same student_profiles row — so splitting them across two forms
// meant two writes to the same row and half-updated history if one failed.
export function TravelVisaHistorySection({
  studentId,
  revalidateTo,
  travel,
  refusals,
}: {
  studentId: string;
  revalidateTo: string;
  travel: TravelRecord[];
  refusals: VisaRefusalRecord[];
}) {
  const action = saveTravelAndVisaHistory.bind(null, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  const [trips, setTrips] = useState<TravelDraft[]>(() =>
    travel.map((r) => ({
      key: r.id,
      id: r.id,
      country: r.country,
      purpose: r.purpose ?? "",
      from_date: r.from_date ?? "",
      to_date: r.to_date ?? "",
    }))
  );
  const [records, setRecords] = useState<VisaDraft[]>(() =>
    refusals.map((r) => ({
      key: r.id,
      id: r.id,
      country: r.country,
      type: r.type || "refusal",
      date: r.date ?? "",
      reason: r.reason ?? "",
    }))
  );

  // React clears the form when the action completes, which for this
  // edit-as-a-table means every controlled <select> jumping back to its first
  // option while the state behind it still holds what was saved.
  return (
    <form action={formAction} onReset={(e) => e.preventDefault()} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold text-ink">Travel history</h4>
        {trips.length === 0 && <p className="text-xs text-muted">No prior travel on file.</p>}
        {trips.map((r) => (
          <div key={r.key} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
            <input type="hidden" name="travel_id" value={r.id} />
            <label className="flex flex-col gap-1 text-xs text-muted">
              Country
              <Input
                name="travel_country"
                value={r.country}
                onChange={(e) => setTrips((prev) => prev.map((x) => (x.key === r.key ? { ...x, country: e.target.value } : x)))}
                placeholder="e.g. UAE"
                className="w-32"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Purpose
              <Input
                name="travel_purpose"
                value={r.purpose}
                onChange={(e) => setTrips((prev) => prev.map((x) => (x.key === r.key ? { ...x, purpose: e.target.value } : x)))}
                placeholder="e.g. Tourism"
                className="w-32"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              From
              <Input
                name="travel_from"
                type="date"
                value={r.from_date}
                onChange={(e) => setTrips((prev) => prev.map((x) => (x.key === r.key ? { ...x, from_date: e.target.value } : x)))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              To
              <Input
                name="travel_to"
                type="date"
                value={r.to_date}
                onChange={(e) => setTrips((prev) => prev.map((x) => (x.key === r.key ? { ...x, to_date: e.target.value } : x)))}
              />
            </label>
            <button type="button" onClick={() => setTrips((prev) => prev.filter((x) => x.key !== r.key))} className="pb-2 text-xs text-danger hover:underline">
              🗑️ Remove
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() => setTrips((prev) => [...prev, { key: crypto.randomUUID(), id: "", country: "", purpose: "", from_date: "", to_date: "" }])}
            className="text-xs font-medium text-primary hover:underline"
          >
            + Add trip
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h4 className="text-sm font-semibold text-ink">Visa refusal / deportation history</h4>
        {records.length === 0 && <p className="text-xs text-muted">No prior visa refusal or deportation on file.</p>}
        {records.map((r) => (
          <div key={r.key} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
            <input type="hidden" name="visa_id" value={r.id} />
            <label className="flex flex-col gap-1 text-xs text-muted">
              Country
              <Input
                name="visa_country"
                value={r.country}
                onChange={(e) => setRecords((prev) => prev.map((x) => (x.key === r.key ? { ...x, country: e.target.value } : x)))}
                placeholder="e.g. UK"
                className="w-32"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Type
              <Select
                name="visa_type"
                value={r.type}
                onChange={(e) => setRecords((prev) => prev.map((x) => (x.key === r.key ? { ...x, type: e.target.value } : x)))}
                className="w-36"
              >
                <option value="refusal">Visa refusal</option>
                <option value="deportation">Deportation</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Date
              <Input
                name="visa_date"
                type="date"
                value={r.date}
                onChange={(e) => setRecords((prev) => prev.map((x) => (x.key === r.key ? { ...x, date: e.target.value } : x)))}
              />
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted">
              Reason
              <Input
                name="visa_reason"
                value={r.reason}
                onChange={(e) => setRecords((prev) => prev.map((x) => (x.key === r.key ? { ...x, reason: e.target.value } : x)))}
                placeholder="As stated on the refusal notice"
              />
            </label>
            <button
              type="button"
              onClick={() => setRecords((prev) => prev.filter((x) => x.key !== r.key))}
              className="pb-2 text-xs text-danger hover:underline"
            >
              🗑️ Remove
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() => setRecords((prev) => [...prev, { key: crypto.randomUUID(), id: "", country: "", type: "refusal", date: "", reason: "" }])}
            className="text-xs font-medium text-primary hover:underline"
          >
            + Add record
          </button>
        </div>
      </div>

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="text-xs text-success">Saved.</p>}
      <div>
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save travel &amp; visa history
        </Button>
      </div>
    </form>
  );
}

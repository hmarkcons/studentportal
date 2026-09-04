"use client";

import { useActionState, useState } from "react";
import { upsertInterview } from "@/lib/actions/interviews";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export type InterviewData = {
  university_name: string | null;
  program_name: string | null;
  interview_details: string | null;
  interview_link: string | null;
  available_slots: string[];
  confirmed_datetime: string | null;
} | null;

export function InterviewSection({
  applicationId,
  revalidateTo,
  data,
}: {
  applicationId: string;
  revalidateTo: string;
  data: InterviewData;
}) {
  const action = upsertInterview.bind(null, applicationId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [slots, setSlots] = useState<string[]>(data?.available_slots?.length ? data.available_slots : [""]);

  function toLocalInputValue(iso: string | null) {
    if (!iso) return "";
    // datetime-local inputs need "YYYY-MM-DDTHH:mm", not a full ISO string.
    return iso.slice(0, 16);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          University name
          <Input name="university_name" defaultValue={data?.university_name ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Program name
          <Input name="program_name" defaultValue={data?.program_name ?? ""} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Interview details
        <Textarea name="interview_details" defaultValue={data?.interview_details ?? ""} rows={2} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Link (program page / interview details)
        <div className="flex items-center gap-2">
          <Input name="interview_link" type="url" defaultValue={data?.interview_link ?? ""} placeholder="https://…" className="flex-1" />
          {data?.interview_link && (
            <a
              href={data.interview_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              👁️ View
            </a>
          )}
        </div>
      </label>

      <div>
        <p className="mb-1 text-xs text-muted">Available slots (proposed to the student — confirmed over a phone call)</p>
        <div className="flex flex-col gap-1">
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input name="available_slots" type="datetime-local" defaultValue={toLocalInputValue(slot)} className="w-56" />
              <button
                type="button"
                onClick={() => setSlots((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-xs text-muted hover:text-danger"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setSlots((prev) => [...prev, ""])} className="mt-1 text-xs text-primary hover:underline">
          + Add another slot
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Confirmed interview date &amp; time
        <Input name="confirmed_datetime" type="datetime-local" defaultValue={toLocalInputValue(data?.confirmed_datetime ?? null)} className="w-56" />
      </label>

      <Button type="submit" variant="primary" size="sm" pending={pending} className="self-start">
        Save
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

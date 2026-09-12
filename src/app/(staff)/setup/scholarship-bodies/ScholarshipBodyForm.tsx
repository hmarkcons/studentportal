"use client";

import { useState } from "react";
import { createScholarshipBody, updateScholarshipBody } from "@/lib/actions/scholarships";
import { useSlideOverForm } from "@/app/(staff)/marketing/referrals/useSlideOverForm";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SlideOver } from "@/components/ui/SlideOver";

export type ScholarshipBody = {
  id: string;
  name: string;
  region: string | null;
  academic_year: string;
  covers: string[];
  stipend_amount: string | null;
  source_url: string | null;
  destinationIds: string[];
};

export type DestinationChoice = { id: string; display_name: string; country: string };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

/**
 * Adds or edits a scholarship body.
 *
 * Was a row of bare inputs in the table, which is why the country could not be
 * added to it: there was no room left. A panel also gives each field a label —
 * "AY 2026/2027" as a placeholder disappears the moment anything is typed.
 */
export function ScholarshipBodyForm({
  body,
  destinations,
  trigger,
}: {
  body?: ScholarshipBody;
  destinations: DestinationChoice[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const action = body ? updateScholarshipBody.bind(null, body.id) : createScholarshipBody;
  const { onSubmit, pending, error } = useSlideOverForm(action, () => setOpen(false));

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <SlideOver open={open} onClose={() => setOpen(false)} title={body ? `Edit ${body.name}` : "Add a scholarship body"}>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {/* First, because it decides which students ever see this body. */}
          <Field
            label="Countries it serves *"
            hint="A body can serve more than one. It is only offered to students applying to a country ticked here."
          >
            <div className="flex max-h-52 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
              {destinations.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="destination_ids"
                    value={d.id}
                    defaultChecked={body?.destinationIds.includes(d.id) ?? false}
                    className="h-4 w-4"
                  />
                  {d.display_name}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Name *">
            <Input name="name" defaultValue={body?.name ?? ""} required maxLength={160} placeholder="e.g. ADISU Umbria" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Region / state" hint="Italy's DSU bodies are regional. Leave blank where it means nothing.">
              <Input name="region" defaultValue={body?.region ?? ""} maxLength={120} />
            </Field>
            <Field label="Academic year *">
              <Input name="academic_year" defaultValue={body?.academic_year ?? ""} required placeholder="2026/2027" />
            </Field>
          </div>
          <Field label="Universities it covers" hint="Comma-separated. This is what maps a student's university to its body.">
            <Input name="covers" defaultValue={body?.covers.join(", ") ?? ""} placeholder="Perugia, Terni" />
          </Field>
          <Field label="Stipend / notes">
            <Input name="stipend_amount" defaultValue={body?.stipend_amount ?? ""} maxLength={200} />
          </Field>
          <Field label="Source" hint="The body's own page. Staff open this to check a deadline against the source.">
            <Input name="source_url" type="url" defaultValue={body?.source_url ?? ""} placeholder="https://…" />
          </Field>

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="primary" pending={pending}>
              {body ? "Save changes" : "Add body"}
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </SlideOver>
    </>
  );
}

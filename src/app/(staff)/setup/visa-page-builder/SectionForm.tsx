"use client";

import { useState } from "react";
import { createVisaSection, updateVisaSection } from "@/lib/actions/visaPageBuilder";
import { useSlideOverForm } from "@/app/(staff)/marketing/referrals/useSlideOverForm";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import type { VisaPageSection } from "@/lib/visaPage";

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
 * One block on the visa page.
 *
 * The audience is the field worth pausing on: some of what the office wants
 * recorded is guidance for the student, and some is a note to the counselor
 * that would alarm a student to read.
 */
export function SectionForm({
  destinationId,
  scopeLabel,
  section,
  trigger,
}: {
  /** Null for a section shown on every country's page. */
  destinationId: string | null;
  scopeLabel: string;
  section?: VisaPageSection;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const action = section ? updateVisaSection.bind(null, section.id) : createVisaSection.bind(null, destinationId);
  const { onSubmit, pending, error } = useSlideOverForm(action, () => setOpen(false));

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title={section ? `Edit — ${section.title}` : `Add a section — ${scopeLabel}`}
        wide
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field label="Title *">
            <Input
              name="title"
              defaultValue={section?.title ?? ""}
              required
              maxLength={160}
              placeholder="e.g. What to bring to the appointment"
            />
          </Field>

          <Field label="Body" hint="Written as you want it read. Line breaks are kept.">
            <Textarea name="body" defaultValue={section?.body ?? ""} rows={7} maxLength={4000} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Link text" hint="Leave both blank for a section with no link.">
              <Input name="link_label" defaultValue={section?.linkLabel ?? ""} maxLength={120} placeholder="Book an appointment" />
            </Field>
            <Field label="Link address">
              <Input name="link_url" type="url" defaultValue={section?.linkUrl ?? ""} placeholder="https://…" />
            </Field>
          </div>

          <Field label="Who sees it">
            <Select name="audience" defaultValue={section?.audience ?? "both"}>
              <option value="both">Student and staff</option>
              <option value="student">Student only</option>
              <option value="staff">Staff only — a note for the counselor</option>
            </Select>
          </Field>

          <Field label="Order" hint="Lower comes first. Sections sharing a number are ordered by title.">
            <Input name="sort_order" type="number" defaultValue={String(section?.sortOrder ?? 0)} className="max-w-[8rem]" />
          </Field>

          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" name="hidden" defaultChecked={section?.status === "hidden"} className="mt-0.5 h-4 w-4" />
            <span>
              Hidden
              <span className="mt-0.5 block text-[11px] text-muted">
                Kept here but shown to nobody. Use it for a section being drafted, or one that is out of date but worth
                keeping.
              </span>
            </span>
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="primary" pending={pending}>
              {section ? "Save changes" : "Add section"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </SlideOver>
    </>
  );
}

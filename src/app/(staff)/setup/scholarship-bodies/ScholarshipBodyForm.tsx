"use client";

import { useState } from "react";
import { createScholarshipBody, updateScholarshipBody } from "@/lib/actions/scholarships";
import { useSlideOverForm } from "@/app/(staff)/marketing/referrals/useSlideOverForm";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { GuideSectionsEditor, type GuideSection } from "./GuideSectionsEditor";
import { CallPdfButton } from "./CallPdfButton";
import { BODY_TEXT_LIMITS } from "@/lib/scholarshipBodySheet";
import { SlideOver } from "@/components/ui/SlideOver";
import { toast } from "@/lib/toast";
import { roundDateForInput } from "@/lib/programRounds";

export type ScholarshipBody = {
  id: string;
  name: string;
  region: string | null;
  academic_year: string;
  covers: string[];
  stipend_amount: string | null;
  source_url: string | null;
  destinationIds: string[];
  apply_url: string | null;
  application_deadline: string | null;
  document_upload_deadline?: string | null;
  courier_deadline?: string | null;
  isee_threshold: string | null;
  ispe_threshold: string | null;
  benefits: string | null;
  call_status: string;
  call_expected_on: string | null;
  /** The expected date in words (0304), shown in its place. */
  call_expected_text?: string | null;
  call_notes: string | null;
  call_pdf_url: string | null;
  call_page_url: string | null;
  call_pdf_path: string | null;
  call_pdf_language: string | null;
  call_pdf_fetched_at: string | null;
  /** Signed on the server; null when nothing is stored. */
  call_pdf_signed_url: string | null;
  guide_sections: GuideSection[];
};

export type DestinationChoice = { id: string; display_name: string; country: string };

function Field({
  label,
  hint,
  children,
  /**
   * A group of controls rather than one. Renders a <div>, because a <label>
   * wrapping several inputs resolves to the first of them — clicking one
   * country's name would tick another's box.
   */
  group = false,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  group?: boolean;
}) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </Tag>
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
  // The panel closes on success, taking its button with it, so the
  // confirmation is a toast.
  const { onSubmit, pending, error } = useSlideOverForm(action, () => {
    setOpen(false);
    toast(body ? "Saved." : "Added.");
  });

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <SlideOver open={open} onClose={() => setOpen(false)} title={body ? `Edit ${body.name}` : "Add a scholarship body"} wide>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {/* First, because it decides which students ever see this body. */}
          <Field
            group
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
              <Input name="region" defaultValue={body?.region ?? ""} maxLength={BODY_TEXT_LIMITS.region} />
            </Field>
            <Field label="Academic year *">
              <Input name="academic_year" defaultValue={body?.academic_year ?? ""} required placeholder="2026/2027" />
            </Field>
          </div>
          <Field label="Universities it covers" hint="Comma-separated. This is what maps a student's university to its body.">
            <Input name="covers" defaultValue={body?.covers.join(", ") ?? ""} placeholder="Perugia, Terni" />
          </Field>
          {/* Words and figures alike, and often a sentence or two — one line
              and 200 characters could not hold what the import had stored. */}
          <Field label="Stipend / notes">
            <Textarea
              name="stipend_amount"
              defaultValue={body?.stipend_amount ?? ""}
              rows={3}
              maxLength={BODY_TEXT_LIMITS.stipend_amount}
              placeholder="e.g. Up to €7,171 a year living away from home, €4,191 commuting — or a note"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source" hint="The body's own page.">
              <Input name="source_url" defaultValue={body?.source_url ?? ""} placeholder="https://… or a note" />
            </Field>
            <Field label="Apply portal" hint="Where the student actually submits.">
              <Input name="apply_url" defaultValue={body?.apply_url ?? ""} placeholder="https://… or a note" />
            </Field>
          </div>
          <Field label="Application deadline" hint="As the call words it — many carry a time, and some carry two dates.">
            <Textarea
              name="application_deadline"
              defaultValue={body?.application_deadline ?? ""}
              rows={2}
              maxLength={BODY_TEXT_LIMITS.application_deadline}
              placeholder="e.g. 7 September 2026, 13:00"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Document upload deadline" hint="As the call words it.">
              <Textarea
                name="document_upload_deadline"
                defaultValue={body?.document_upload_deadline ?? ""}
                rows={2}
                maxLength={BODY_TEXT_LIMITS.document_upload_deadline}
              />
            </Field>
            <Field label="Courier deadline" hint="Where the papers are posted as well.">
              <Textarea name="courier_deadline" defaultValue={body?.courier_deadline ?? ""} rows={2} maxLength={BODY_TEXT_LIMITS.courier_deadline} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ISEE limit">
              <Textarea name="isee_threshold" defaultValue={body?.isee_threshold ?? ""} rows={2} maxLength={BODY_TEXT_LIMITS.isee_threshold} placeholder="≤€26,887.93" />
            </Field>
            <Field label="ISPE limit">
              <Textarea name="ispe_threshold" defaultValue={body?.ispe_threshold ?? ""} rows={2} maxLength={BODY_TEXT_LIMITS.ispe_threshold} placeholder="≤€58,452.06" />
            </Field>
          </div>
          <Field label="Benefits">
            <Textarea name="benefits" defaultValue={body?.benefits ?? ""} rows={3} maxLength={BODY_TEXT_LIMITS.benefits} placeholder="e.g. free meals at university canteens" />
          </Field>

          {/* Whether this year's call is even out yet. A body waiting on its
              region has not been neglected, and saying so stops the same
              person checking it again next week. */}
          <p className="mt-2 border-t border-border pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
            This year&rsquo;s call
          </p>
          <Field label="Status">
            <Select name="call_status" defaultValue={body?.call_status ?? "published"}>
              <option value="published">Published — this guide reflects it</option>
              <option value="awaiting">Not published yet</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expected on" hint="When the region usually publishes — a date or words (Early July). Only for a call that is not out.">
              <Input
                name="call_expected_on"
                maxLength={200}
                defaultValue={body?.call_expected_text ?? roundDateForInput(body?.call_expected_on)}
                placeholder="15 Jul 2027, or Early July"
              />
            </Field>
            <Field label="Official call PDF" hint="Link to the call document itself, where the region publishes one.">
              <Input name="call_pdf_url" defaultValue={body?.call_pdf_url ?? ""} placeholder="https://… or a note" />
            </Field>
          </div>
          <Field
            label="Call page"
            hint="The page the call is published on, for the regions that put the bando up with its annexes instead of one PDF. Used when there is no PDF above — the student is taken here."
          >
            <Input name="call_page_url" defaultValue={body?.call_page_url ?? ""} placeholder="https://… or a note" />
          </Field>

          {/* Only once the body exists — there is nothing to attach a file to
              until it has been saved. */}
          {body && (
            <Field
              label="Keep a copy"
              hint="Regions take last year's PDF down the week the new one appears. A stored copy is what makes it answerable afterwards."
              group
            >
              <CallPdfButton
                bodyId={body.id}
                hasStored={Boolean(body.call_pdf_path)}
                storedUrl={body.call_pdf_signed_url}
                language={body.call_pdf_language}
                fetchedAt={body.call_pdf_fetched_at}
                hasLink={Boolean(body.call_pdf_url)}
              />
            </Field>
          )}
          <Field label="Notes on the call">
            <Textarea name="call_notes" defaultValue={body?.call_notes ?? ""} rows={2} maxLength={BODY_TEXT_LIMITS.call_notes} />
          </Field>

          <p className="mt-2 border-t border-border pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
            The guide
          </p>
          <GuideSectionsEditor name="guide_sections" initial={body?.guide_sections ?? []} />

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

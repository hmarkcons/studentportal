"use client";

import { useState } from "react";
import { createVisaOffice, updateVisaOffice } from "@/lib/actions/visaOffices";
import { useSlideOverForm } from "@/app/(staff)/marketing/referrals/useSlideOverForm";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { VISA_OFFICE_KINDS, type VisaOffice } from "@/lib/visaOffices";
import { toast } from "@/lib/toast";

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
 * One embassy, consulate or visa centre.
 *
 * Two fields here do more work than they look: "Applications are submitted
 * here" is what the student's page turns into a sentence, and it is
 * deliberately separate from the kind — some embassies take applications
 * directly and some centres only do biometrics. "Confirmed against the source"
 * is what stops an unchecked address being read out to a student as fact.
 */
export function VisaOfficeForm({
  destinationId,
  destinationName,
  office,
  trigger,
}: {
  destinationId: string;
  destinationName: string;
  office?: VisaOffice;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const action = office ? updateVisaOffice.bind(null, office.id) : createVisaOffice.bind(null, destinationId);
  // The panel closes on success, taking its button with it, so the
  // confirmation is a toast.
  const { onSubmit, pending, error } = useSlideOverForm(action, () => {
    setOpen(false);
    toast(office ? "Saved." : "Added.");
  });

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title={office ? `Edit — ${office.name}` : `Add an office — ${destinationName}`}
        wide
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind *">
              <Select name="kind" defaultValue={office?.kind ?? "embassy"} required>
                {VISA_OFFICE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="City">
              <Input name="city" defaultValue={office?.city ?? ""} maxLength={80} placeholder="Islamabad" />
            </Field>
          </div>

          <Field label="Name *" hint="As a student would recognise it, e.g. “Embassy of Italy, Islamabad”.">
            <Input name="name" defaultValue={office?.name ?? ""} required maxLength={160} />
          </Field>

          <Field label="Operator" hint="For a centre: BLS International, VFS Global, TLScontact, Gerry's.">
            <Input name="operator" defaultValue={office?.operator ?? ""} maxLength={120} />
          </Field>

          <Field label="Address">
            <Textarea name="address" defaultValue={office?.address ?? ""} rows={2} maxLength={500} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input name="phone" defaultValue={office?.phone ?? ""} maxLength={120} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={office?.email ?? ""} maxLength={160} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Website">
              <Input name="website" type="url" defaultValue={office?.website ?? ""} placeholder="https://…" />
            </Field>
            <Field label="Appointments page">
              <Input name="appointment_url" type="url" defaultValue={office?.appointmentUrl ?? ""} placeholder="https://…" />
            </Field>
          </div>

          <Field label="Opening hours" hint="As the office words it — many publish different submission and collection times.">
            <Input name="office_hours" defaultValue={office?.officeHours ?? ""} maxLength={240} placeholder="Mon–Fri 09:00–16:00" />
          </Field>

          <Field
            label="Provinces covered"
            hint="A student outside the jurisdiction is turned away, so say it where it is limited."
          >
            <Input name="jurisdiction" defaultValue={office?.jurisdiction ?? ""} maxLength={240} placeholder="Sindh and Balochistan" />
          </Field>

          {/* The field the student's page turns into its first sentence. */}
          <label className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-sm text-ink">
            <input
              type="checkbox"
              name="submits_applications"
              defaultChecked={office?.submitsApplications ?? false}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Applications are submitted here
              <span className="mt-0.5 block text-[11px] text-muted">
                Tick for the place a student actually hands the application in. Not the same as the kind — some
                embassies take applications directly, and some centres only collect biometrics.
              </span>
            </span>
          </label>

          <Field label="Notes" hint="The student reads this on their Visa page. Anything that is not for them goes in the box below.">
            <Textarea name="notes" defaultValue={office?.notes ?? ""} rows={2} maxLength={600} />
          </Field>

          <Field
            label="Staff note"
            hint="Never shown to the student — what still needs checking, which source disagreed, who to ring."
          >
            <Textarea
              name="internal_notes"
              defaultValue={office?.internalNotes ?? ""}
              rows={2}
              maxLength={600}
              placeholder="Address unconfirmed — the consulate's own page and VFS disagree."
            />
          </Field>

          <p className="mt-2 border-t border-border pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Where this came from
          </p>
          <Field label="Source" hint="The page these details were read from, so they can be rechecked when the office moves.">
            <Input name="source_url" type="url" defaultValue={office?.sourceUrl ?? ""} placeholder="https://…" />
          </Field>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" name="verified" defaultChecked={Boolean(office?.verifiedAt)} className="mt-0.5 h-4 w-4" />
            <span>
              Confirmed against that source
              <span className="mt-0.5 block text-[11px] text-muted">
                Until this is ticked, the staff Visa tab marks the entry “Not yet confirmed”. Untick it if it turns out
                to be wrong, rather than leaving it looking checked.
              </span>
            </span>
          </label>

          <Field label="Order">
            <Input name="sort_order" type="number" defaultValue={String(0)} className="max-w-[8rem]" />
          </Field>

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="primary" pending={pending}>
              {office ? "Save changes" : "Add office"}
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

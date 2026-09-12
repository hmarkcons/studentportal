"use client";

import { useState } from "react";
import { createReferralParty, updateReferralParty } from "@/lib/actions/referralParties";
import { useSlideOverForm } from "./useSlideOverForm";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { SlideOver } from "@/components/ui/SlideOver";

export type ReferralParty = {
  id: string;
  full_name: string;
  organisation: string | null;
  contact_number: string | null;
  email: string | null;
  city: string | null;
  cnic: string | null;
  bank_name: string | null;
  account_title: string | null;
  account_number: string | null;
  notes: string | null;
  is_active: boolean;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

/**
 * Adds or corrects an outside referring party.
 *
 * The bank fields are the point of the record: the section is here to pay
 * people, and a name with no account behind it is a debt nobody can settle.
 * None of them are required, though — a party is worth recording the moment
 * they refer someone, and the details usually arrive when the first payment
 * is due.
 */
export function ReferralPartyForm({
  party,
  trigger,
}: {
  party?: ReferralParty;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const action = party ? updateReferralParty.bind(null, party.id) : createReferralParty;
  const { onSubmit, pending, error } = useSlideOverForm(action, () => setOpen(false));

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <SlideOver open={open} onClose={() => setOpen(false)} title={party ? "Edit referring party" : "Add referring party"}>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field label="Name *">
            <Input name="full_name" defaultValue={party?.full_name ?? ""} required maxLength={120} />
          </Field>
          <Field label="Organisation / agency">
            <Input name="organisation" defaultValue={party?.organisation ?? ""} maxLength={160} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact number">
              <Input name="contact_number" defaultValue={party?.contact_number ?? ""} maxLength={40} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={party?.email ?? ""} maxLength={160} />
            </Field>
            <Field label="City">
              <Input name="city" defaultValue={party?.city ?? ""} maxLength={80} />
            </Field>
            <Field label="CNIC">
              <Input name="cnic" defaultValue={party?.cnic ?? ""} maxLength={40} />
            </Field>
          </div>

          <p className="mt-2 border-t border-border pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Where the commission is paid
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank">
              <Input name="bank_name" defaultValue={party?.bank_name ?? ""} maxLength={120} />
            </Field>
            <Field label="Account title">
              <Input name="account_title" defaultValue={party?.account_title ?? ""} maxLength={120} />
            </Field>
          </div>
          <Field label="Account number / IBAN">
            <Input name="account_number" defaultValue={party?.account_number ?? ""} maxLength={60} />
          </Field>
          <Field label="Notes">
            <Textarea name="notes" defaultValue={party?.notes ?? ""} rows={3} maxLength={1000} />
          </Field>

          {party && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="is_active" defaultChecked={party.is_active} />
              {/* Not a delete: a party who stops referring still has a
                  payment history, and deleting them would take it with them. */}
              Still active — offer them when logging a new referral
            </label>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="primary" pending={pending}>
              {party ? "Save changes" : "Add party"}
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

"use client";

import { useState } from "react";
import { createPartyReferral } from "@/lib/actions/referralParties";
import { useSlideOverForm } from "./useSlideOverForm";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SlideOver } from "@/components/ui/SlideOver";

/**
 * Logs that a party referred a registered student, and what they are owed.
 *
 * Only registered students are offered: a referral commission is paid on a
 * registration, so until the lead registers there is nothing to owe anybody.
 */
export function LogReferralForm({
  parties,
  students,
  currencies,
}: {
  parties: { id: string; full_name: string; organisation: string | null }[];
  students: { id: string; full_name: string; registered_at: string | null; alreadyReferredBy: string[] }[];
  currencies: string[];
}) {
  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState("");
  const { onSubmit, pending, error } = useSlideOverForm(createPartyReferral, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)} disabled={parties.length === 0}>
        Log a referral
      </Button>
      <SlideOver open={open} onClose={() => setOpen(false)} title="Log a referral">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Referring party *</span>
            <Select name="referral_party_id" required value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">Choose a party…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                  {p.organisation ? ` — ${p.organisation}` : ""}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Registered student *</span>
            <Select name="lead_id" required>
              <option value="">Choose a registered student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id} disabled={partyId !== "" && s.alreadyReferredBy.includes(partyId)}>
                  {s.full_name}
                  {s.registered_at ? ` · registered ${String(s.registered_at).slice(0, 10)}` : ""}
                  {/* Said up front rather than letting somebody log a second
                      one and meet a unique-index error. A different party for
                      the same student stays possible — two people claiming
                      one introduction is a judgement for the office. */}
                  {partyId !== "" && s.alreadyReferredBy.includes(partyId) ? " (already logged for this party)" : ""}
                </option>
              ))}
            </Select>
          </label>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Commission</span>
              <Input name="incentive_owed" type="number" step="0.01" min="0" placeholder="e.g. 15000" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Currency</span>
              <Select name="currency" defaultValue="PKR">
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <p className="-mt-1 text-xs text-muted">
            Leave the amount blank if it has not been agreed yet — it can be typed in on the row afterwards.
          </p>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Notes</span>
            <Textarea name="notes" rows={3} maxLength={1000} placeholder="Anything worth recording about this referral" />
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="primary" pending={pending}>
              Log referral
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

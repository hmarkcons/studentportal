"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { toast } from "@/lib/toast";
import { saveAeoRecord } from "@/lib/actions/aeoCommissions";
import { LIMITS, type AeoRecord, type PaymentStatus } from "@/lib/aeoCommissions";

const label = "flex flex-col gap-1 text-xs font-medium text-muted";

/**
 * One registration, added or edited. Submitted by hand rather than through
 * the form's action, because React empties a form after its action — and a
 * challan typed wrong would go with the error that says so.
 */
export function AeoRecordForm({ record, today, onDone }: { record: AeoRecord | null; today: string; onDone: () => void }) {
  const [status, setStatus] = useState<PaymentStatus>(record?.payment_status ?? "unpaid");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await saveAeoRecord(record?.id ?? null, formData);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast(record ? "Saved." : "Registration added.");
    onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
      className="flex flex-col gap-3"
      data-aeo-form
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[6rem_1fr]">
        <label className={label}>
          Sr. #
          <Input name="sr_no" inputMode="numeric" defaultValue={record?.sr_no ?? ""} placeholder="Next" />
        </label>
        <label className={label}>
          Candidate&apos;s name
          <Input name="candidate_name" required maxLength={LIMITS.name} defaultValue={record?.candidate_name ?? ""} autoComplete="off" />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>
          Challan number
          <Input name="challan_number" required maxLength={LIMITS.challan} defaultValue={record?.challan_number ?? ""} autoComplete="off" />
        </label>
        <label className={label}>
          Challan create date
          <Input name="challan_date" type="date" defaultValue={record?.challan_date ?? ""} />
        </label>
      </div>
      <label className={label}>
        Test date
        <Textarea
          name="test_details"
          rows={2}
          maxLength={LIMITS.test}
          defaultValue={record?.test_details ?? ""}
          placeholder="(06/08/2022) ( ACADEMIC ) ( Computer Based ) ( IELTS (IOC) )"
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>
          Commission&apos;s amount (PKR)
          <Input name="commission_amount" inputMode="decimal" defaultValue={record ? String(record.commission_amount) : ""} placeholder="2000" />
        </label>
        <label className={label}>
          Payment status
          <Select name="payment_status" value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus)}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </Select>
        </label>
      </div>
      {status === "paid" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-aeo-paid-fields>
          <label className={label}>
            Paid on
            <Input name="paid_on" type="date" defaultValue={record?.paid_on ?? today} />
          </label>
          <label className={label}>
            Payment reference
            <Input name="payment_reference" maxLength={LIMITS.reference} defaultValue={record?.payment_reference ?? ""} placeholder="Cheque or transfer no." />
          </label>
        </div>
      )}
      <label className={label}>
        Notes
        <Textarea name="notes" rows={2} maxLength={LIMITS.notes} defaultValue={record?.notes ?? ""} />
      </label>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {record ? "Save" : "Add registration"}
        </Button>
      </div>
    </form>
  );
}

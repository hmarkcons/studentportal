"use client";

import { useActionState } from "react";
import { updateInvoiceBankSettings, type InvoiceBankSettings } from "@/lib/actions/invoiceSettings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";
import { DEFAULT_PKR_PER_EUR } from "@/lib/receiptPkr";

// The text fields. pkr_per_eur is a number and is rendered on its own below,
// because it is not a bank detail and wants its own explanation.
const FIELDS: { name: Exclude<keyof InvoiceBankSettings, "pkr_per_eur">; label: string; placeholder: string; wide?: boolean }[] = [
  { name: "account_title", label: "Account title", placeholder: "HMARK Consultants (Pvt.) Ltd." },
  { name: "bank_name", label: "Bank name", placeholder: "e.g. Meezan Bank" },
  { name: "branch", label: "Branch", placeholder: "e.g. Shahrah-e-Faisal" },
  { name: "account_number", label: "Account number", placeholder: "e.g. 0123456789" },
  { name: "iban", label: "IBAN", placeholder: "PK.. .... .... .... ....", wide: true },
  { name: "swift_code", label: "SWIFT / BIC", placeholder: "e.g. HABBPKKA" },
  { name: "account_currency", label: "Account currency", placeholder: "e.g. PKR" },
  { name: "payment_note", label: "Note shown under the bank block", placeholder: "e.g. Email proof of payment to accounts@…", wide: true },
];

export function InvoiceSettingsForm({ settings, canEdit }: { settings: InvoiceBankSettings | null; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(updateInvoiceBankSettings, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {FIELDS.map((f) => (
        <label key={f.name} className={`flex flex-col gap-1 text-xs text-muted ${f.wide ? "sm:col-span-2" : ""}`}>
          {f.label}
          <Input name={f.name} defaultValue={settings?.[f.name] ?? ""} placeholder={f.placeholder} disabled={!canEdit} />
        </label>
      ))}

      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Rupees per euro
        <Input
          name="pkr_per_eur"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={settings?.pkr_per_eur ?? DEFAULT_PKR_PER_EUR}
          disabled={!canEdit}
          className="sm:max-w-[12rem]"
        />
        <span className="text-[11px] text-muted">
          Shown beside every euro total on a receipt. Each receipt keeps the rate it was issued at, so changing this
          never restates one already in a student&rsquo;s hands.
        </span>
      </label>

      {canEdit ? (
        <div className="sm:col-span-2">
          {state?.error && <p className="mb-2 text-xs text-danger">{state.error}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" pending={pending}>
              Save bank details
            </Button>
            {/* Was a bare "Saved." that stayed put while the next field was
                being edited, reading as though that change had saved too. */}
            <ActionStatus state={state} pending={pending} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted sm:col-span-2">Only a Super Admin can change where payments are sent.</p>
      )}
    </form>
  );
}

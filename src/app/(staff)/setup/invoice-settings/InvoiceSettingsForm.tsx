"use client";

import { useActionState } from "react";
import { updateInvoiceBankSettings, type InvoiceBankSettings } from "@/lib/actions/invoiceSettings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const FIELDS: { name: keyof InvoiceBankSettings; label: string; placeholder: string; wide?: boolean }[] = [
  { name: "account_title", label: "Account title", placeholder: "HMARK Consultants (Pvt.) Ltd." },
  { name: "bank_name", label: "Bank name", placeholder: "e.g. Meezan Bank" },
  { name: "branch", label: "Branch", placeholder: "e.g. Shahrah-e-Faisal" },
  { name: "account_number", label: "Account number", placeholder: "e.g. 0123456789" },
  { name: "iban", label: "IBAN", placeholder: "PK.. .... .... .... ....", wide: true },
  { name: "swift_code", label: "SWIFT / BIC", placeholder: "e.g. MEZNPKKA" },
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

      {canEdit ? (
        <div className="sm:col-span-2">
          {state?.error && <p className="mb-2 text-xs text-danger">{state.error}</p>}
          {state?.success && <p className="mb-2 text-xs text-success">Saved.</p>}
          <Button type="submit" variant="primary" pending={pending}>
            Save bank details
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted sm:col-span-2">Only a Super Admin can change where payments are sent.</p>
      )}
    </form>
  );
}

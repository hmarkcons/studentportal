"use client";

import { useActionState, useState } from "react";
import { generateInvoice } from "@/lib/actions/invoices";
import { computeInvoiceMath, splitIntoInstallments, SRB_TAX_RATE } from "@/lib/invoiceMath";
import type { InvoiceBankSettings } from "@/lib/actions/invoiceSettings";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export type StudentOption = {
  id: string;
  name: string;
  email: string | null;
  country: string | null;
  level: string | null;
  agreementId: string | null;
  currency: string;
  intake: string | null;
  installmentCount: number;
  consultancyFee: number;
  adminCharge: number;
  discountAmount: number;
  discountReason: string | null;
  source: { consultancyFee: string; adminCharge: string; discount: string };
};

const SOURCE_NOTE: Record<string, string> = {
  agreement: "from the signed agreement",
  country: "from the registered country",
  registration: "from registration",
  none: "not recorded",
};

function fmt(currency: string, n: number) {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoiceGenerator({ students, bank }: { students: StudentOption[]; bank: InvoiceBankSettings | null }) {
  const [studentId, setStudentId] = useState("");
  const student = students.find((s) => s.id === studentId) ?? null;

  // Editable copies, seeded from the student's resolved defaults. Staff can
  // override any figure for this one invoice without touching the country's
  // standard fees or the agreement.
  const [fee, setFee] = useState("");
  const [admin, setAdmin] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [count, setCount] = useState("1");
  const [seenStudent, setSeenStudent] = useState<string>("");

  // Re-seed on each new pick, adjusting state during render rather than in an
  // effect so the figures are right in the same render as the selection.
  if (student && seenStudent !== student.id) {
    setSeenStudent(student.id);
    setFee(String(student.consultancyFee));
    setAdmin(String(student.adminCharge));
    setDiscount(String(student.discountAmount));
    setDiscountReason(student.discountReason ?? "");
    setCount(String(student.installmentCount));
  }

  const action = generateInvoice.bind(null, studentId, student?.agreementId ?? "");
  const [state, formAction, pending] = useActionState(action, undefined);

  const currency = student?.currency ?? "PKR";
  const math = computeInvoiceMath({
    consultancyFee: Number(fee) || 0,
    adminCharge: Number(admin) || 0,
    discountAmount: Number(discount) || 0,
    taxRate: SRB_TAX_RATE,
  });
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const parts = splitIntoInstallments(math.total, n);
  const discountTooBig = (Number(discount) || 0) > (Number(fee) || 0);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Registered student
        <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Choose a registered student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.country ? ` — ${s.country}` : ""}
              {s.intake ? ` · ${s.intake}` : ""}
            </option>
          ))}
        </Select>
      </label>

      {!student && <p className="text-xs text-muted">Choose a student to see their fees and generate an invoice.</p>}

      {student && (
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="currency" value={currency} />
          <input type="hidden" name="intake" value={student.intake ?? ""} />

          {!student.agreementId && (
            <p className="rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">
              This student has no agreement on record. The invoice will be issued without being linked to one.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Consultancy fee <span className="text-[10px]">({SOURCE_NOTE[student.source.consultancyFee]})</span>
              <Input name="consultancy_fee" type="number" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Administrative charge <span className="text-[10px]">({SOURCE_NOTE[student.source.adminCharge]})</span>
              <Input name="admin_charge" type="number" step="0.01" value={admin} onChange={(e) => setAdmin(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Discount <span className="text-[10px]">({SOURCE_NOTE[student.source.discount]})</span>
              <Input name="discount_amount" type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Discount reason
              <Input name="discount_reason" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="e.g. Early registration" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Installments
              <Input name="installment_count" type="number" min="1" max="24" value={count} onChange={(e) => setCount(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              First installment due
              <Input name="first_due_date" type="date" required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Invoice number <span className="text-[10px]">(optional — generated if blank)</span>
              <Input name="invoice_number" placeholder="e.g. INV-2026-0042" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Installment plan label
              <Input name="installment_plan" placeholder="e.g. 3 monthly installments" />
            </label>
          </div>

          {/* The breakdown the student will see, computed by the same module
              that writes the invoice and prints the PDF. */}
          <div className="rounded-md border border-border p-3 text-sm">
            <h4 className="mb-2 text-xs font-medium uppercase text-muted">Invoice preview</h4>
            <dl className="flex flex-col gap-1">
              <Row label="Consultancy fee" value={fmt(currency, math.consultancyFee)} />
              {math.discountAmount > 0 && (
                <Row label={`Discount${discountReason ? ` (${discountReason})` : ""}`} value={`− ${fmt(currency, math.discountAmount)}`} />
              )}
              {math.discountAmount > 0 && <Row label="Net consultancy fee" value={fmt(currency, math.netConsultancyFee)} muted />}
              <Row label={`SRB tax (${math.taxRate}% of net fee)`} value={fmt(currency, math.taxAmount)} />
              <Row label="Administrative charge" value={fmt(currency, math.adminCharge)} />
              <div className="mt-1 flex items-center justify-between border-t border-border pt-1 text-sm font-semibold text-ink">
                <dt>Total payable</dt>
                <dd className="font-mono">{fmt(currency, math.total)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">
              {n} installment{n === 1 ? "" : "s"} of {parts.map((p) => fmt(currency, p)).join(" + ")}
            </p>
          </div>

          <div className="rounded-md border border-border p-3 text-xs">
            <h4 className="mb-1 font-medium uppercase text-muted">Payable to</h4>
            {bank?.account_title || bank?.bank_name || bank?.iban || bank?.account_number ? (
              <div className="flex flex-col gap-0.5 text-ink">
                {bank.account_title && <p>{bank.account_title}</p>}
                {bank.bank_name && <p>{bank.bank_name}{bank.branch ? `, ${bank.branch}` : ""}</p>}
                {bank.account_number && <p>Account no. {bank.account_number}</p>}
                {bank.iban && <p>IBAN {bank.iban}</p>}
                {bank.swift_code && <p>SWIFT {bank.swift_code}</p>}
                {bank.payment_note && <p className="text-muted">{bank.payment_note}</p>}
              </div>
            ) : (
              <p className="text-warning">Not configured — invoices will print without payment instructions.</p>
            )}
          </div>

          {discountTooBig && <p className="text-xs text-danger">Discount cannot exceed the consultancy fee.</p>}
          {state?.error && <p className="text-xs text-danger">{state.error}</p>}
          {state?.success && <p className="text-xs text-success">Invoice generated. It appears in the list below.</p>}

          <div>
            <Button type="submit" variant="primary" pending={pending} disabled={discountTooBig}>
              Generate invoice
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-muted" : "text-ink"}`}>
      <dt className="text-xs">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { generateInvoice, markInstallmentPaid, sendReceipt, generateInvoicePdf } from "@/lib/actions/invoices";
import { Badge } from "@/components/ui/Badge";

const DEFAULT_TERMS =
  "Only upon refusal from the university, 100% of the paid consultancy charges only will be refundable. There is no refund on withdrawal or rejection from the embassy or on failing the admission test, or under any other condition. Refunds are processed within 90 working days of the refusal notice.";

export function GenerateInvoiceForm({ studentId, agreementId }: { studentId: string; agreementId: string }) {
  const action = generateInvoice.bind(null, studentId, agreementId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <input name="admin_charge" type="number" step="0.01" placeholder="Admin charge" required className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
        <input name="consultancy_fee" type="number" step="0.01" placeholder="Consultancy fee" required className="w-36 rounded-md border border-border px-2 py-1.5 text-sm" />
        <select name="currency" className="rounded-md border border-border px-2 py-1.5 text-sm">
          <option value="EUR">EUR</option>
          <option value="PKR">PKR</option>
          <option value="USD">USD</option>
        </select>
        <select name="installment_count" className="rounded-md border border-border px-2 py-1.5 text-sm">
          <option value="1">1 installment</option>
          <option value="2">2 installments</option>
          <option value="3">3 installments</option>
        </select>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <input name="invoice_number" placeholder="Invoice # (optional, auto-generated)" className="w-56 rounded-md border border-border px-2 py-1.5 text-sm" />
        <input name="intake" placeholder="Intake (e.g. Winter 2026)" className="w-44 rounded-md border border-border px-2 py-1.5 text-sm" />
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          First installment due date
          <input name="first_due_date" type="date" className="rounded-md border border-border px-2 py-1.5 text-sm" />
        </label>
      </div>
      <textarea
        name="terms"
        defaultValue={DEFAULT_TERMS}
        rows={2}
        className="w-full rounded-md border border-border px-2 py-1.5 text-xs"
        placeholder="Refund / consultancy terms shown on the invoice"
      />
      <button type="submit" disabled={pending} className="self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        {pending ? "Generating…" : "Generate invoice"}
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function MarkPaidForm({ installmentId, studentId }: { installmentId: string; studentId: string }) {
  const action = markInstallmentPaid.bind(null, installmentId, studentId);
  const [, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex items-center gap-1">
      <select name="payment_method" className="rounded-md border border-border px-1.5 py-0.5 text-xs">
        <option value="Cash">Cash</option>
        <option value="Bank transfer">Bank transfer</option>
        <option value="Card">Card</option>
        <option value="Other">Other</option>
      </select>
      <button type="submit" className="rounded-md border border-success px-2 py-0.5 text-xs text-success">
        Mark paid
      </button>
    </form>
  );
}

function GeneratePdfButton({ invoiceId, studentId, revalidateTo }: { invoiceId: string; studentId: string; revalidateTo: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setPending(true);
    setError(null);
    const result = await generateInvoicePdf(invoiceId, studentId, revalidateTo);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div className="flex flex-col items-end">
      <button type="button" onClick={handle} disabled={pending} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-bg disabled:opacity-50">
        {pending ? "Generating PDF…" : "Generate / refresh PDF"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function InvoiceCard({
  invoice,
  installments,
  studentId,
  pdfUrl,
  revalidateTo,
}: {
  invoice: { id: string; admin_charge: number; consultancy_fee: number; currency: string; sent_status: string; pdf_path: string | null };
  installments: { id: string; installment_no: number; amount: number; status: string; due_date: string | null }[];
  studentId: string;
  pdfUrl?: string | null;
  revalidateTo: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">
          {invoice.currency} {(invoice.admin_charge + invoice.consultancy_fee).toFixed(2)}
        </p>
        <div className="flex items-center gap-2">
          <Badge tone={invoice.sent_status === "sent" ? "success" : "neutral"}>{invoice.sent_status}</Badge>
          <button
            type="button"
            onClick={() => sendReceipt(invoice.id, studentId)}
            className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-bg"
          >
            Send receipt
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {installments.map((i) => (
          <div key={i.id} className="flex items-center justify-between text-xs text-muted">
            <span>
              Installment {i.installment_no} — {invoice.currency} {i.amount.toFixed(2)}
              {i.due_date && ` · due ${new Date(i.due_date).toLocaleDateString()}`}
            </span>
            {i.status === "paid" ? <Badge tone="success">Paid</Badge> : <MarkPaidForm installmentId={i.id} studentId={studentId} />}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2">
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="rounded-md border border-primary px-2 py-0.5 text-xs font-medium text-primary hover:bg-bg">
            Download PDF
          </a>
        )}
        <GeneratePdfButton invoiceId={invoice.id} studentId={studentId} revalidateTo={revalidateTo} />
      </div>
    </div>
  );
}

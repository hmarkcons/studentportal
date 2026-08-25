"use client";

import { useActionState } from "react";
import { generateInvoice, markInstallmentPaid, sendReceipt } from "@/lib/actions/invoices";
import { Badge } from "@/components/ui/Badge";

export function GenerateInvoiceForm({ studentId, agreementId }: { studentId: string; agreementId: string }) {
  const action = generateInvoice.bind(null, studentId, agreementId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input name="admin_charge" type="number" step="0.01" placeholder="Admin charge" required className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="consultancy_fee" type="number" step="0.01" placeholder="Consultancy fee" required className="w-36 rounded-md border border-border px-2 py-1.5 text-sm" />
      <select name="currency" className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="EUR">EUR</option>
        <option value="PKR">PKR</option>
      </select>
      <select name="installment_count" className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="1">1 installment</option>
        <option value="2">2 installments</option>
        <option value="3">3 installments</option>
      </select>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Generate invoice
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function MarkPaidButton({ installmentId, studentId }: { installmentId: string; studentId: string }) {
  const action = markInstallmentPaid.bind(null, installmentId, studentId);
  const [, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      <button type="submit" className="rounded-md border border-success px-2 py-0.5 text-xs text-success">
        Mark paid
      </button>
    </form>
  );
}

export function InvoiceCard({
  invoice,
  installments,
  studentId,
}: {
  invoice: { id: string; admin_charge: number; consultancy_fee: number; currency: string; sent_status: string };
  installments: { id: string; installment_no: number; amount: number; status: string; due_date: string | null }[];
  studentId: string;
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
            {i.status === "paid" ? <Badge tone="success">Paid</Badge> : <MarkPaidButton installmentId={i.id} studentId={studentId} />}
          </div>
        ))}
      </div>
    </div>
  );
}

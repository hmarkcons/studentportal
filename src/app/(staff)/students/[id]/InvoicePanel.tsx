"use client";

import { useActionState, useState } from "react";
import {
  generateInvoice,
  markInstallmentPaid,
  sendReceipt,
  generateInvoicePdf,
  updateInvoice,
  deleteInvoice,
  updateInstallment,
} from "@/lib/actions/invoices";
import { updateAdminFeeStatus, addLineItem, deleteLineItem, sendInvoiceEmail } from "@/lib/actions/consultancyFee";
import { computeInvoiceStatus, INVOICE_STATUS_LABELS } from "@/lib/invoiceStatus";
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

function EditInvoiceForm({
  invoice,
  studentId,
  revalidateTo,
  onDone,
}: {
  invoice: { id: string; admin_charge: number; consultancy_fee: number; currency: string; invoice_number?: string | null; intake?: string | null; terms?: string | null };
  studentId: string;
  revalidateTo: string;
  onDone: () => void;
}) {
  const action = updateInvoice.bind(null, invoice.id, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <input name="admin_charge" type="number" step="0.01" defaultValue={invoice.admin_charge} required className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
        <input name="consultancy_fee" type="number" step="0.01" defaultValue={invoice.consultancy_fee} required className="w-36 rounded-md border border-border px-2 py-1.5 text-sm" />
        <select name="currency" defaultValue={invoice.currency} className="rounded-md border border-border px-2 py-1.5 text-sm">
          <option value="EUR">EUR</option>
          <option value="PKR">PKR</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <input name="invoice_number" defaultValue={invoice.invoice_number ?? ""} placeholder="Invoice #" className="w-56 rounded-md border border-border px-2 py-1.5 text-sm" />
        <input name="intake" defaultValue={invoice.intake ?? ""} placeholder="Intake" className="w-44 rounded-md border border-border px-2 py-1.5 text-sm" />
      </div>
      <textarea name="terms" defaultValue={invoice.terms ?? DEFAULT_TERMS} rows={2} className="w-full rounded-md border border-border px-2 py-1.5 text-xs" />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Saving…" : "Save invoice"}
        </button>
        <button type="button" onClick={onDone} className="text-xs text-muted hover:underline">
          Cancel
        </button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function DeleteInvoiceButton({ invoiceId, studentId, revalidateTo }: { invoiceId: string; studentId: string; revalidateTo: string }) {
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    if (!confirm("Delete this invoice and all its installments? This cannot be undone.")) return;
    const result = await deleteInvoice(invoiceId, studentId, revalidateTo);
    if (result?.error) setError(result.error);
  }

  return (
    <div>
      <button type="button" onClick={handle} className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:text-danger">
        🗑️ Delete invoice
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
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

function EditInstallmentForm({
  installment,
  studentId,
  revalidateTo,
  onDone,
}: {
  installment: { id: string; amount: number; status: string; due_date: string | null; payment_method?: string | null; paid_date?: string | null };
  studentId: string;
  revalidateTo: string;
  onDone: () => void;
}) {
  const action = updateInstallment.bind(null, installment.id, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1 rounded-md border border-border p-2">
      <input name="amount" type="number" step="0.01" defaultValue={installment.amount} required className="w-24 rounded-md border border-border px-2 py-1 text-xs" />
      <input name="due_date" type="date" defaultValue={installment.due_date ?? ""} className="rounded-md border border-border px-2 py-1 text-xs" />
      <select name="status" defaultValue={installment.status} className="rounded-md border border-border px-2 py-1 text-xs">
        <option value="unpaid">unpaid</option>
        <option value="paid">paid</option>
        <option value="partial">partial</option>
      </select>
      <select name="payment_method" defaultValue={installment.payment_method ?? ""} className="rounded-md border border-border px-2 py-1 text-xs">
        <option value="">Method…</option>
        <option value="Cash">Cash</option>
        <option value="Bank transfer">Bank transfer</option>
        <option value="Card">Card</option>
        <option value="Other">Other</option>
      </select>
      <input name="paid_date" type="date" defaultValue={installment.paid_date ?? ""} className="rounded-md border border-border px-2 py-1 text-xs" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-ink disabled:opacity-50">
        {pending ? "…" : "Save"}
      </button>
      <button type="button" onClick={onDone} className="text-xs text-muted hover:underline">
        Cancel
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function AdminFeeSection({
  invoice,
  revalidateTo,
}: {
  invoice: { id: string; currency: string; admin_fee_status: string; admin_fee_paid_date: string | null; admin_fee_payment_method: string | null };
  revalidateTo: string;
}) {
  const [editing, setEditing] = useState(false);
  const action = updateAdminFeeStatus.bind(null, invoice.id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!editing) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">
          Administrative fee
          {invoice.admin_fee_paid_date && ` · paid ${new Date(invoice.admin_fee_paid_date).toLocaleDateString()}`}
          {invoice.admin_fee_payment_method && ` via ${invoice.admin_fee_payment_method}`}
        </span>
        <div className="flex items-center gap-1">
          <Badge tone={invoice.admin_fee_status === "paid" ? "success" : "warning"}>{invoice.admin_fee_status}</Badge>
          <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-border px-1.5 py-0.5 text-xs hover:bg-bg">
            ✏️
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1 rounded-md border border-border p-2">
      <select name="admin_fee_status" defaultValue={invoice.admin_fee_status} className="rounded-md border border-border px-2 py-1 text-xs">
        <option value="unpaid">unpaid</option>
        <option value="paid">paid</option>
      </select>
      <select name="admin_fee_payment_method" defaultValue={invoice.admin_fee_payment_method ?? ""} className="rounded-md border border-border px-2 py-1 text-xs">
        <option value="">Method…</option>
        <option value="Cash">Cash</option>
        <option value="Bank transfer">Bank transfer</option>
        <option value="Card">Card</option>
        <option value="Other">Other</option>
      </select>
      <input name="admin_fee_paid_date" type="date" defaultValue={invoice.admin_fee_paid_date ?? ""} className="rounded-md border border-border px-2 py-1 text-xs" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-ink disabled:opacity-50">
        {pending ? "…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
        Cancel
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function LineItemsSection({
  invoiceId,
  lineItems,
  feeProducts,
  currency,
  revalidateTo,
}: {
  invoiceId: string;
  lineItems: { id: string; name: string; amount: number }[];
  feeProducts: { id: string; name: string; default_amount: number | null; default_currency: string }[];
  currency: string;
  revalidateTo: string;
}) {
  const action = addLineItem.bind(null, invoiceId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [selectedProduct, setSelectedProduct] = useState("");

  return (
    <div className="flex flex-col gap-1">
      {lineItems.map((li) => (
        <div key={li.id} className="flex items-center justify-between text-xs text-muted">
          <span>
            {li.name} — {currency} {li.amount.toFixed(2)}
          </span>
          <button type="button" onClick={() => deleteLineItem(li.id, revalidateTo)} className="text-danger hover:underline">
            Remove
          </button>
        </div>
      ))}
      <form action={formAction} className="flex flex-wrap items-center gap-1">
        <select
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
          className="rounded-md border border-border px-2 py-1 text-xs"
        >
          <option value="">Custom item…</option>
          {feeProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input type="hidden" name="product_id" value={selectedProduct} />
        <input
          name="name"
          placeholder="Item name"
          defaultValue={feeProducts.find((p) => p.id === selectedProduct)?.name ?? ""}
          key={selectedProduct}
          required
          className="w-32 rounded-md border border-border px-2 py-1 text-xs"
        />
        <input
          name="amount"
          type="number"
          step="0.01"
          placeholder="Amount"
          defaultValue={feeProducts.find((p) => p.id === selectedProduct)?.default_amount ?? ""}
          key={`${selectedProduct}-amount`}
          required
          className="w-24 rounded-md border border-border px-2 py-1 text-xs"
        />
        <button type="submit" disabled={pending} className="rounded-md border border-primary px-2 py-1 text-xs text-primary disabled:opacity-50">
          {pending ? "…" : "+ Add item"}
        </button>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </form>
    </div>
  );
}

function GeneratePdfButton({ invoiceId, studentId, revalidateTo, hasExisting }: { invoiceId: string; studentId: string; revalidateTo: string; hasExisting: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setPending(true);
    setError(null);
    const result = await generateInvoicePdf(invoiceId, studentId, revalidateTo);
    if (result && "error" in result) setError(result.error ?? "Something went wrong.");
    setPending(false);
  }

  return (
    <div className="flex flex-col items-end">
      <button type="button" onClick={handle} disabled={pending} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-bg disabled:opacity-50">
        {pending ? "Generating PDF…" : hasExisting ? "Regenerate PDF" : "Generate PDF"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function SendInvoiceEmailButton({ invoiceId, studentId, revalidateTo }: { invoiceId: string; studentId: string; revalidateTo: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handle() {
    setPending(true);
    setMessage(null);
    const result = await sendInvoiceEmail(invoiceId, studentId, revalidateTo);
    setMessage(result?.error ? { text: result.error, ok: false } : { text: "Sent.", ok: true });
    setPending(false);
  }

  return (
    <div className="flex flex-col items-end">
      <button type="button" onClick={handle} disabled={pending} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-bg disabled:opacity-50">
        {pending ? "Sending…" : "📧 Email invoice"}
      </button>
      {message && <p className={`mt-1 text-xs ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p>}
    </div>
  );
}

const STATUS_TONE = { paid: "success", pending: "warning", overdue: "danger" } as const;

export function InvoiceCard({
  invoice,
  installments,
  lineItems = [],
  feeProducts = [],
  studentId,
  studentName,
  pdfUrl,
  revalidateTo,
}: {
  invoice: {
    id: string;
    admin_charge: number;
    consultancy_fee: number;
    currency: string;
    sent_status: string;
    pdf_path: string | null;
    invoice_number?: string | null;
    intake?: string | null;
    terms?: string | null;
    admin_fee_status?: string;
    admin_fee_paid_date?: string | null;
    admin_fee_payment_method?: string | null;
  };
  installments: { id: string; installment_no: number; amount: number; status: string; due_date: string | null; payment_method?: string | null; paid_date?: string | null }[];
  lineItems?: { id: string; name: string; amount: number }[];
  feeProducts?: { id: string; name: string; default_amount: number | null; default_currency: string }[];
  studentId: string;
  studentName?: string;
  pdfUrl?: string | null;
  revalidateTo: string;
}) {
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [editingInstallmentId, setEditingInstallmentId] = useState<string | null>(null);

  const lineItemsTotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const total = invoice.admin_charge + invoice.consultancy_fee + lineItemsTotal;
  const status = computeInvoiceStatus(invoice.admin_fee_status ?? "unpaid", installments);

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">
          {studentName && <span className="mr-2">{studentName}</span>}
          {invoice.invoice_number && <span className="mr-2 font-mono text-xs text-muted">{invoice.invoice_number}</span>}
          {invoice.currency} {total.toFixed(2)}
        </p>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>
          <Badge tone={invoice.sent_status === "sent" ? "success" : "neutral"}>{invoice.sent_status}</Badge>
          <button type="button" onClick={() => sendReceipt(invoice.id, studentId)} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-bg">
            Send receipt
          </button>
          <button type="button" onClick={() => setEditingInvoice((v) => !v)} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-bg">
            ✏️ Edit
          </button>
          <DeleteInvoiceButton invoiceId={invoice.id} studentId={studentId} revalidateTo={revalidateTo} />
        </div>
      </div>

      {editingInvoice && <EditInvoiceForm invoice={invoice} studentId={studentId} revalidateTo={revalidateTo} onDone={() => setEditingInvoice(false)} />}

      <div className="mt-2 border-t border-border pt-2">
        <AdminFeeSection
          invoice={{
            id: invoice.id,
            currency: invoice.currency,
            admin_fee_status: invoice.admin_fee_status ?? "unpaid",
            admin_fee_paid_date: invoice.admin_fee_paid_date ?? null,
            admin_fee_payment_method: invoice.admin_fee_payment_method ?? null,
          }}
          revalidateTo={revalidateTo}
        />
      </div>

      <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
        {installments.map((i) =>
          editingInstallmentId === i.id ? (
            <EditInstallmentForm key={i.id} installment={i} studentId={studentId} revalidateTo={revalidateTo} onDone={() => setEditingInstallmentId(null)} />
          ) : (
            <div key={i.id} className="flex items-center justify-between text-xs text-muted">
              <span>
                Installment {i.installment_no} — {invoice.currency} {i.amount.toFixed(2)}
                {i.due_date && ` · due ${new Date(i.due_date).toLocaleDateString()}`}
              </span>
              <div className="flex items-center gap-1">
                {i.status === "paid" ? <Badge tone="success">Paid</Badge> : <MarkPaidForm installmentId={i.id} studentId={studentId} />}
                <button type="button" onClick={() => setEditingInstallmentId(i.id)} className="rounded-md border border-border px-1.5 py-0.5 text-xs hover:bg-bg">
                  ✏️
                </button>
              </div>
            </div>
          )
        )}
      </div>

      <div className="mt-2 border-t border-border pt-2">
        <LineItemsSection invoiceId={invoice.id} lineItems={lineItems} feeProducts={feeProducts} currency={invoice.currency} revalidateTo={revalidateTo} />
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2">
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="rounded-md border border-primary px-2 py-0.5 text-xs font-medium text-primary hover:bg-bg">
            Download PDF
          </a>
        )}
        <GeneratePdfButton invoiceId={invoice.id} studentId={studentId} revalidateTo={revalidateTo} hasExisting={Boolean(pdfUrl)} />
        <SendInvoiceEmailButton invoiceId={invoice.id} studentId={studentId} revalidateTo={revalidateTo} />
      </div>
    </div>
  );
}

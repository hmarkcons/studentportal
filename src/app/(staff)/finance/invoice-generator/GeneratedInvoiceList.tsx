"use client";

import { SERVICE_FEE_NAME, type ServiceType } from "@/lib/serviceType";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  deleteInvoice,
  generateInvoicePdf,
  markInstallmentPaid,
  updateInvoice,
  sendInvoiceToStudent,
} from "@/lib/actions/invoices";
import { PAYMENT_STATUS_LABELS, type InvoiceMath } from "@/lib/invoiceMath";
import { formatDateOnly } from "@/lib/formatDate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { toast } from "@/lib/toast";
import type { ActionResultLike } from "@/lib/actionStatus";

const REVALIDATE_TO = "/finance/invoice-generator";

/** A submit button that is busy while its form's action runs. */
function SubmitButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} {...props}>
      {children}
    </Button>
  );
}

export type GeneratedInvoice = {
  id: string;
  /** Which service it was raised for (0279); a visa-only one has no administrative fee. */
  serviceType?: ServiceType;
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  invoiceNumber: string | null;
  currency: string;
  intake: string | null;
  createdAt: string;
  sentStatus: string;
  sentAt: string | null;
  hasPdf: boolean;
  math: InvoiceMath;
  discountReason: string | null;
  /** Items added after the invoice was raised; part of math.total. */
  lineItems: { id: string; name: string; amount: number }[];
  paid: number;
  outstanding: number;
  nextDueDate: string | null;
  status: "paid_in_full" | "partially_paid" | "payment_pending";
  installments: {
    id: string;
    no: number;
    amount: number;
    amountPaid: number;
    status: string;
    dueDate: string | null;
    paidDate: string | null;
    paymentMethod: string | null;
  }[];
};

// created_at / sent_at are timestamptz, so they must not go through
// formatDateOnly (that helper is for date-only columns and returns
// "Invalid Date" for a full timestamp).
// Locale and timezone are pinned rather than left to the environment. This
// component renders on the server and hydrates on the client, and the two
// disagree — Vercel is UTC/en-US, the browser is whatever the user has — so
// leaving them implicit produced a hydration mismatch that made React throw
// away the server HTML and re-render this list on every load.
function fmtTimestamp(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { timeZone: "UTC" });
}

function fmt(currency: string, n: number) {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TONE: Record<GeneratedInvoice["status"], "success" | "warning" | "neutral"> = {
  paid_in_full: "success",
  partially_paid: "warning",
  payment_pending: "neutral",
};

export function GeneratedInvoiceList({ invoices, canDelete }: { invoices: GeneratedInvoice[]; canDelete: boolean }) {
  if (invoices.length === 0) return <EmptyState>No invoices issued yet.</EmptyState>;
  return (
    <div className="flex flex-col gap-3">
      {/* Card passes on only its className, so the row is marked here. */}
      {invoices.map((inv) => (
        <div key={inv.id} data-invoice-row={inv.id}>
          <InvoiceRow inv={inv} canDelete={canDelete} />
        </div>
      ))}
    </div>
  );
}

function InvoiceRow({ inv, canDelete }: { inv: GeneratedInvoice; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the last button did, said beside that button. One object per
  // result, so the confirmation belongs to that press and not the next.
  const [done, setDone] = useState<{ which: string; state: ActionResultLike; label: string } | null>(null);
  const doneFor = (which: string) => (done?.which === which ? done.state : undefined);

  async function run(label: string, fn: () => Promise<{ error?: string } | undefined>) {
    setBusy(label);
    setError(null);
    setDone(null);
    const r = await fn();
    if (r?.error) setError(r.error);
    setBusy(null);
    return !r?.error;
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">
            {inv.studentName}
            {inv.invoiceNumber ? <span className="text-muted"> · {inv.invoiceNumber}</span> : null}
          </p>
          {/* The paid figure is what this list is scanned for when chasing
              payments, so it is not left as one grey word among four. */}
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted">
            {fmt(inv.currency, inv.math.total)} total ·
            <span className="rounded bg-success-bg px-1.5 py-0.5 text-sm font-semibold text-success">
              {fmt(inv.currency, inv.paid)}
            </span>
            <span className="text-success">paid</span>· outstanding{" "}
            <span className={inv.outstanding > 0 ? "font-medium text-warning" : ""}>{fmt(inv.currency, inv.outstanding)}</span>
            {inv.nextDueDate ? ` · next due ${formatDateOnly(inv.nextDueDate)}` : ""}
          </p>
          <p className="text-xs text-muted">
            {inv.intake ? `${inv.intake} · ` : ""}issued {fmtTimestamp(inv.createdAt)}
            {inv.sentStatus === "sent" && inv.sentAt ? ` · emailed ${fmtTimestamp(inv.sentAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TONE[inv.status]}>{PAYMENT_STATUS_LABELS[inv.status]}</Badge>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "View"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Modify"}
          </Button>
          <Button
            type="button"
            variant="outline-primary"
            size="sm"
            pending={busy === "pdf"}
            onClick={async () => {
              const ok = await run("pdf", () => generateInvoicePdf(inv.id, inv.studentId, REVALIDATE_TO));
              if (ok)
                setDone({
                  which: "pdf",
                  state: { success: true },
                  label: "PDF regenerated — open it from the student's Payments tab or the link below.",
                });
            }}
            status={{ state: doneFor("pdf"), label: done?.label }}
          >
            {inv.hasPdf ? "Rebuild PDF" : "Build PDF"}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            pending={busy === "send"}
            disabled={!inv.studentEmail}
            onClick={async () => {
              const already = inv.sentStatus === "sent";
              if (
                !confirm(
                  already
                    ? `This invoice was already emailed. Send it to ${inv.studentEmail} again? The previous receipt link will stop working.`
                    : `Email this invoice to ${inv.studentEmail}?`
                )
              )
                return;
              setBusy("send");
              setError(null);
              setDone(null);
              const r = await sendInvoiceToStudent(inv.id, inv.studentId);
              if (r?.error) setError(r.error);
              else setDone({ which: "send", state: { success: true }, label: `Emailed to ${r?.sentTo ?? inv.studentEmail}.` });
              setBusy(null);
            }}
            status={{ state: doneFor("send"), label: done?.label }}
          >
            {inv.sentStatus === "sent" ? "Resend email" : "Send to student"}
          </Button>
          {!inv.studentEmail && <span className="text-xs text-warning">No email on record</span>}
          {canDelete && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              pending={busy === "del"}
              onClick={async () => {
                if (!confirm(`Delete invoice for ${inv.studentName}? This removes its installments and payment history and cannot be undone.`)) return;
                // The invoice's card goes with it, so success is a toast.
                if (await run("del", () => deleteInvoice(inv.id, inv.studentId, REVALIDATE_TO))) toast("Invoice deleted.");
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {editing && (
        <form
          action={async (fd: FormData) => {
            setError(null);
            const r = await updateInvoice(inv.id, inv.studentId, REVALIDATE_TO, undefined, fd);
            if (r?.error) setError(r.error);
            else {
              // The form closes on success, taking its button with it.
              setEditing(false);
              toast("Invoice updated.");
            }
          }}
          className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            Invoice number
            <Input name="invoice_number" defaultValue={inv.invoiceNumber ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Intake
            <Input name="intake" defaultValue={inv.intake ?? ""} />
          </label>
          <div className="sm:col-span-2">
            <SubmitButton variant="primary" size="sm">
              Save changes
            </SubmitButton>
          </div>
        </form>
      )}

      {open && (
        <div className="mt-3 border-t border-border pt-3">
          <dl className="mb-3 flex flex-col gap-0.5 text-xs">
            <Line label={SERVICE_FEE_NAME[inv.serviceType ?? "full"]} value={fmt(inv.currency, inv.math.consultancyFee)} />
            {inv.math.discountAmount > 0 && (
              <Line
                label={`Discount${inv.discountReason ? ` (${inv.discountReason})` : ""}`}
                value={`− ${fmt(inv.currency, inv.math.discountAmount)}`}
              />
            )}
            {inv.lineItems.map((li) => (
              <Line key={li.id} label={li.name} value={fmt(inv.currency, li.amount)} />
            ))}
            <Line label={`SRB tax (${inv.math.taxRate}%)`} value={fmt(inv.currency, inv.math.taxAmount)} />
            {inv.serviceType !== "visa_only" && <Line label="Administrative fee" value={fmt(inv.currency, inv.math.adminCharge)} />}
            <Line label="Total" value={fmt(inv.currency, inv.math.total)} strong />
          </dl>

          <h5 className="mb-2 text-xs font-medium uppercase text-muted">Installments</h5>
          <div className="flex flex-col gap-2">
            {inv.installments.map((i) => (
              <InstallmentRow key={i.id} inv={inv} inst={i} />
            ))}
          </div>

          <p className="mt-3 text-xs text-muted">
            Full payment history and receipts live on{" "}
            <Link href={`/students/${inv.studentId}`} className="text-primary underline">
              this student&apos;s page
            </Link>
            .
          </p>
        </div>
      )}
    </Card>
  );
}

function InstallmentRow({ inv, inst }: { inv: GeneratedInvoice; inst: GeneratedInvoice["installments"][number] }) {
  const [error, setError] = useState<string | null>(null);
  const settled = inst.status === "paid";

  return (
    <form
      action={async (fd: FormData) => {
        setError(null);
        const r = await markInstallmentPaid(inst.id, inv.studentId, undefined, fd);
        if (r?.error) setError(r.error);
        // A payment that settles the installment replaces this button with
        // the Paid badge, so the confirmation is a toast either way.
        else toast("Payment recorded.");
      }}
      className="flex flex-wrap items-end gap-2 rounded-md bg-bg px-2 py-2 text-xs"
    >
      <span className="min-w-24 text-ink">
        #{inst.no} · {fmt(inv.currency, inst.amount)}
      </span>
      <span className="text-muted">
        {inst.dueDate ? `due ${formatDateOnly(inst.dueDate)}` : "no due date"}
        {inst.amountPaid > 0 && !settled ? ` · paid ${fmt(inv.currency, inst.amountPaid)}` : ""}
      </span>
      {settled ? (
        <Badge tone="success">
          Paid{inst.paidDate ? ` ${formatDateOnly(inst.paidDate)}` : ""}
          {inst.paymentMethod ? ` · ${inst.paymentMethod}` : ""}
        </Badge>
      ) : (
        <>
          <label className="flex flex-col gap-0.5 text-muted">
            Amount received
            <Input name="amount_paid" type="number" step="0.01" defaultValue={String(inst.amount)} className="h-7 w-28 py-0 text-xs" />
          </label>
          <label className="flex flex-col gap-0.5 text-muted">
            Date
            <Input name="paid_date" type="date" className="h-7 w-36 py-0 text-xs" />
          </label>
          <label className="flex flex-col gap-0.5 text-muted">
            Method
            <Select name="payment_method" className="h-7 py-0 text-xs">
              <option value="">Method…</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="card">Card</option>
              <option value="online">Online</option>
            </Select>
          </label>
          <SubmitButton variant="outline-primary" size="sm">
            Record payment
          </SubmitButton>
        </>
      )}
      {error && <span className="text-danger">{error}</span>}
    </form>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? "border-t border-border pt-1 font-semibold text-ink" : "text-muted"}`}>
      <dt>{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

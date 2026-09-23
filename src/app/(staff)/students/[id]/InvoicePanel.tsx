"use client";

import { useActionState, useState } from "react";
import {
  generateInvoice,
  markInstallmentPaid,
  sendInvoiceToStudent,
  sendReceipt,
  generateInvoicePdf,
  updateInvoice,
  deleteInvoice,
  updateInstallment,
} from "@/lib/actions/invoices";
import { addLineItem, deleteLineItem } from "@/lib/actions/consultancyFee";
import { computeInvoiceStatus, INVOICE_STATUS_LABELS } from "@/lib/invoiceStatus";
import { computeInvoiceMath, computePaymentProgress, installmentNote, sumLineItems, type TaxBase } from "@/lib/invoiceMath";
import { formatDateOnly } from "@/lib/formatDate";
import { balanceDueDate, carriedFromNote } from "@/lib/partialPayment";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";
import { toast } from "@/lib/toast";
import { Input, Select, Textarea } from "@/components/ui/Input";

/** Karachi's day, not the browser's — the office books payments by its own date. */
function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

const DEFAULT_TERMS =
  "Only upon refusal from the university, 100% of the paid consultancy charges only will be refundable. There is no refund on withdrawal or rejection from the embassy or on failing the admission test, or under any other condition. Refunds are processed within 90 working days of the refusal notice.";

export type InvoiceCountry = {
  destinationId: string;
  label: string;
  isBackup: boolean;
  defaultAdminCharge: number;
};

export function GenerateInvoiceForm({
  studentId,
  agreementId,
  defaultInstallmentPlan,
  defaultAdminCharge,
  defaultConsultancyFee,
  defaultCurrency,
  defaultInstallmentCount,
  defaultDiscount,
  defaultDiscountReason,
  countries = [],
}: {
  studentId: string;
  agreementId: string;
  defaultInstallmentPlan?: string | null;
  defaultAdminCharge?: number | null;
  defaultConsultancyFee?: number | null;
  defaultCurrency?: string | null;
  /** From the signed agreement, which is where the number of payments was
   *  agreed with the student. */
  defaultInstallmentCount?: number | null;
  /** Also from the agreement, falling back to what was captured at
   *  registration. */
  defaultDiscount?: number | null;
  defaultDiscountReason?: string | null;
  /** The countries this student registered for — primary first, then backups.
   *  Each carries its own administrative fee. */
  countries?: InvoiceCountry[];
}) {
  const action = generateInvoice.bind(null, studentId, agreementId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {(defaultAdminCharge != null || defaultConsultancyFee != null) && (
        <p className="text-xs text-muted">Pre-filled from the signed agreement (discount already applied) — adjust if needed.</p>
      )}
      {/* One administrative fee per country: a backup country's agreement is
          administrative-fee only, so a student with backups owes one for each.
          A student whose registration predates lead_destinations still gets
          the single field. */}
      {countries.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
          {countries.map((c) => (
            <label key={c.destinationId} className="flex flex-col gap-0.5 text-xs text-muted">
              Admin fee — {c.label}
              {c.isBackup && <span className="text-[10px]">backup country</span>}
              <Input
                name={`admin_charge__${c.destinationId}`}
                type="number"
                step="0.01"
                min="0"
                defaultValue={c.defaultAdminCharge}
                className="w-32"
              />
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {countries.length === 0 && (
          <Input
            name="admin_charge"
            type="number"
            step="0.01"
            placeholder="Admin charge"
            defaultValue={defaultAdminCharge ?? undefined}
            required
            className="w-32"
          />
        )}
        <Input
          name="consultancy_fee"
          type="number"
          step="0.01"
          placeholder="Consultancy fee"
          defaultValue={defaultConsultancyFee ?? undefined}
          required
          className="w-36"
        />
        <Select name="currency" defaultValue={defaultCurrency ?? "EUR"}>
          <option value="EUR">EUR</option>
          <option value="PKR">PKR</option>
          <option value="USD">USD</option>
        </Select>
        {/* Taken from the signed agreement, which is where the number of
            payments was agreed with the student. Still changeable, because
            the invoice is what is actually being raised. */}
        <Select name="installment_count" defaultValue={String(defaultInstallmentCount ?? 1)}>
          <option value="1">1 installment</option>
          <option value="2">2 installments</option>
          <option value="3">3 installments</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Discount
          <Input
            name="discount_amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaultDiscount ?? 0}
            className="w-28"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Discount reason
          <Input
            name="discount_reason"
            defaultValue={defaultDiscountReason ?? ""}
            placeholder="e.g. Early registration"
            className="w-48"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Input name="invoice_number" placeholder="Invoice # (optional, auto-generated)" className="w-56" />
        <Input name="intake" placeholder="Intake (e.g. Winter 2026)" className="w-44" />
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          First installment due date
          <Input name="first_due_date" type="date" required />
        </label>
        {/* Finance sometimes has to raise an invoice against a date that has
            passed. Blank means today. */}
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Invoice date <span className="text-[10px]">(blank = today)</span>
          <Input name="issued_on" type="date" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Installment plan
          <Input
            name="installment_plan"
            defaultValue={defaultInstallmentPlan ?? ""}
            placeholder="e.g. 2 installments"
            className="w-44"
          />
        </label>
      </div>
      <Textarea
        name="terms"
        defaultValue={DEFAULT_TERMS}
        rows={2}
        className="w-full"
        placeholder="Refund / consultancy terms shown on the invoice"
      />
      <Button
        type="submit"
        variant="primary"
        pending={pending}
        wrapperClassName="self-start"
        status={{ state, label: "Generated." }}
      >
        Generate invoice
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function EditInvoiceForm({
  invoice,
  adminCharges,
  installmentCount,
  paidCount,
  studentId,
  revalidateTo,
  onDone,
}: {
  invoice: {
    id: string;
    admin_charge: number;
    consultancy_fee: number;
    currency: string;
    invoice_number?: string | null;
    intake?: string | null;
    terms?: string | null;
    installment_plan?: string | null;
    discount_amount?: number | null;
    discount_reason?: string | null;
    issued_on?: string | null;
  };
  /** Per-country administrative charges, when this invoice has a breakdown. */
  adminCharges: AdminChargeRow[];
  /** How many instalments the schedule currently has, and how many are settled. */
  installmentCount: number;
  paidCount: number;
  studentId: string;
  revalidateTo: string;
  onDone: () => void;
}) {
  const action = updateInvoice.bind(null, invoice.id, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-xs text-muted">
        Changing a fee, a discount or the number of instalments rebuilds the schedule to match. Instalments that already
        have a payment recorded are never altered — the outstanding balance is re-spread over the rest.
        {paidCount > 0 && ` ${paidCount} of ${installmentCount} ${paidCount === 1 ? "is" : "are"} already paid.`}
      </p>
      {/* Edited per country when the invoice carries a breakdown: the single
          figure is their sum, so letting staff type over it would leave the
          two disagreeing about which country was charged what. */}
      {adminCharges.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
          {adminCharges.map((c) => (
            <label key={c.id} className="flex flex-col gap-0.5 text-xs text-muted">
              Admin fee — {c.country_label}
              {c.is_backup && <span className="text-[10px]">backup country</span>}
              <Input
                name={`admin_charge__${c.destination_id ?? ""}`}
                type="number"
                step="0.01"
                min="0"
                defaultValue={Number(c.amount)}
                className="w-32"
              />
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {adminCharges.length === 0 && (
          <Input name="admin_charge" type="number" step="0.01" defaultValue={invoice.admin_charge} required className="w-32" />
        )}
        <Input name="consultancy_fee" type="number" step="0.01" defaultValue={invoice.consultancy_fee} required className="w-36" />
        <Select name="currency" defaultValue={invoice.currency}>
          <option value="EUR">EUR</option>
          <option value="PKR">PKR</option>
          <option value="USD">USD</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Discount
          <Input name="discount_amount" type="number" step="0.01" min="0" defaultValue={invoice.discount_amount ?? 0} className="w-28" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Discount reason
          <Input name="discount_reason" defaultValue={invoice.discount_reason ?? ""} placeholder="e.g. Early registration" className="w-48" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Instalments
          <Input name="installment_count" type="number" min={Math.max(1, paidCount)} max="24" defaultValue={installmentCount} className="w-24" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Invoice date
          <Input name="issued_on" type="date" defaultValue={invoice.issued_on ?? ""} />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Input name="invoice_number" defaultValue={invoice.invoice_number ?? ""} placeholder="Invoice #" className="w-56" />
        <Input name="intake" defaultValue={invoice.intake ?? ""} placeholder="Intake" className="w-44" />
        <Input name="installment_plan" defaultValue={invoice.installment_plan ?? ""} placeholder="Installment plan" className="w-44" />
      </div>
      <Textarea name="terms" defaultValue={invoice.terms ?? DEFAULT_TERMS} rows={2} className="w-full" />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Saved." }}>
          Save invoice
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function DeleteInvoiceButton({ invoiceId, studentId, revalidateTo }: { invoiceId: string; studentId: string; revalidateTo: string }) {
  // The invoice card goes with the invoice, so a delete confirms with a toast.
  const del = useButtonAction();

  async function handle() {
    if (!confirm("Delete this invoice and all its installments? This cannot be undone.")) return;
    await del.run(() => deleteInvoice(invoiceId, studentId, revalidateTo), { toast: "Deleted." });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handle}
        disabled={del.pending}
        aria-busy={del.pending || undefined}
        className="w-fit rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:text-danger disabled:opacity-50"
      >
        🗑️ Delete invoice
      </button>
      {del.state?.error && <p className="mt-1 text-xs text-danger">{del.state.error}</p>}
    </div>
  );
}

function MarkPaidForm({ installmentId, studentId }: { installmentId: string; studentId: string }) {
  const markPaid = markInstallmentPaid.bind(null, installmentId, studentId);
  // A paid row shows a Paid badge in place of this form, so the success is
  // confirmed with a toast — there is no button left to sit beside.
  const action = async (prevState: unknown, formData: FormData) => {
    const result = await markPaid(prevState, formData);
    if (!result?.error) toast("Marked as paid.");
    return result;
  };
  // The state was discarded here, so a refused or failed payment looked
  // exactly like a successful one: the row stayed unpaid and nothing said why.
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <Select name="payment_method">
        <option value="Cash">Cash</option>
        <option value="Bank transfer">Bank transfer</option>
        <option value="Card">Card</option>
        <option value="Other">Other</option>
      </Select>
      <Button type="submit" variant="success" size="sm" pending={pending} status={{ state, label: "Marked as paid." }}>
        Mark paid
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function EditInstallmentForm({
  installment,
  studentId,
  revalidateTo,
  onDone,
}: {
  installment: {
    id: string;
    installment_no: number;
    amount: number;
    amount_paid?: number | null;
    status: string;
    due_date: string | null;
    payment_method?: string | null;
    paid_date?: string | null;
  };
  studentId: string;
  revalidateTo: string;
  onDone: () => void;
}) {
  const action = updateInstallment.bind(null, installment.id, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [status, setStatus] = useState(installment.status);
  const [paidDate, setPaidDate] = useState(installment.paid_date ?? today());
  const [amountPaid, setAmountPaid] = useState(String(installment.amount_paid ?? ""));
  // Staff can move it, but it defaults to a week after the payment so the
  // balance never ends up with no date at all.
  const [balanceDue, setBalanceDue] = useState(() => balanceDueDate(installment.paid_date ?? today()));
  const [balanceTouched, setBalanceTouched] = useState(false);

  const isPartial = status === "partial";
  const balance = Math.round((installment.amount - Number(amountPaid || 0)) * 100) / 100;

  function choosePaidDate(value: string) {
    setPaidDate(value);
    // Follows the payment date until staff set it themselves.
    if (!balanceTouched) setBalanceDue(balanceDueDate(value || today()));
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1 rounded-md border border-border p-2">
      <Input name="amount" type="number" step="0.01" defaultValue={installment.amount} required className="w-24" />
      <Input name="due_date" type="date" defaultValue={installment.due_date ?? ""} required />
      <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="unpaid">unpaid</option>
        <option value="paid">paid</option>
        <option value="partial">part-paid</option>
      </Select>
      <Input
        name="amount_paid"
        type="number"
        step="0.01"
        placeholder="Amount paid (if part-paid)"
        value={amountPaid}
        onChange={(e) => setAmountPaid(e.target.value)}
        className="w-36"
      />
      <Select name="payment_method" defaultValue={installment.payment_method ?? ""}>
        <option value="">Method…</option>
        <option value="Cash">Cash</option>
        <option value="Bank transfer">Bank transfer</option>
        <option value="Card">Card</option>
        <option value="Other">Other</option>
      </Select>
      <Input name="paid_date" type="date" value={paidDate} onChange={(e) => choosePaidDate(e.target.value)} />

      {/* A part payment splits this installment: what was paid is closed off
          at that amount, and the rest becomes an installment of its own. It
          needs its own due date or nothing will ever chase it. */}
      {isPartial && (
        <div className="w-full rounded-md border border-warning bg-warning-bg p-2">
          <p className="mb-1 text-xs text-warning">
            {balance > 0 ? (
              <>
                The remaining <strong className="font-semibold">{balance.toFixed(2)}</strong> becomes installment{" "}
                {installment.installment_no + 1}, and the later ones shift down. Choose when it is due:
              </>
            ) : (
              <>Enter how much was actually paid — it has to be less than the installment.</>
            )}
          </p>
          <label className="flex flex-wrap items-center gap-1 text-xs text-warning">
            Balance due
            <Input
              name="balance_due_date"
              type="date"
              value={balanceDue}
              onChange={(e) => {
                setBalanceDue(e.target.value);
                setBalanceTouched(true);
              }}
              required
            />
            {!balanceTouched && <span className="opacity-80">a week after the payment</span>}
          </label>
        </div>
      )}

      <Button type="submit" variant="primary" pending={pending} size="sm" status={{ state, label: "Saved." }}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Cancel
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function LineItemsSection({
  invoiceId,
  lineItems,
  feeProducts,
  currency,
  installments,
  revalidateTo,
  canManage,
}: {
  invoiceId: string;
  lineItems: { id: string; name: string; description?: string | null; amount: number }[];
  feeProducts: { id: string; name: string; default_amount: number | null; default_currency: string }[];
  currency: string;
  /** Unpaid instalments, in order — the ones an item can be put on. */
  installments: { id: string; installment_no: number; amount: number; status: string; amount_paid?: number | null }[];
  revalidateTo: string;
  canManage: boolean;
}) {
  const action = addLineItem.bind(null, invoiceId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [selectedProduct, setSelectedProduct] = useState("");
  // A removed item's row goes with it, so it confirms with a toast.
  const remove = useButtonAction();

  // A settled instalment is a record of money that changed hands, so an item
  // cannot be put on one. The next instalment still outstanding is the
  // default, because that is where the money would land anyway.
  const open = installments
    .filter((i) => i.status !== "paid" && Number(i.amount_paid ?? 0) === 0)
    .sort((a, b) => a.installment_no - b.installment_no);
  const [placement, setPlacement] = useState("");
  const defaultPlacement = open[0]?.id ?? "";

  async function handleDeleteLineItem(lineItemId: string) {
    await remove.run(() => deleteLineItem(invoiceId, lineItemId, revalidateTo), { toast: "Removed." });
  }

  const selectedFeeProduct = feeProducts.find((p) => p.id === selectedProduct) ?? null;
  // invoice_line_items has no currency column of its own — every line item's
  // amount is implicitly in the invoice's currency. A fee product's own
  // default_amount is priced in its own default_currency, which can differ
  // from the invoice's — auto-filling it in that case would silently insert
  // a number that looks plausible but is in the wrong currency, with the
  // invoice total then wrong by whatever the currency delta is. Only
  // auto-fill when the currencies actually match; otherwise leave the amount
  // blank and warn so staff consciously enter the correct converted amount.
  const currencyMismatch = selectedFeeProduct != null && selectedFeeProduct.default_currency !== currency;

  return (
    <div className="flex flex-col gap-1">
      {lineItems.length > 0 && (
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Added items</p>
      )}
      {lineItems.map((li) => (
        <div key={li.id} className="flex items-start justify-between text-xs text-muted">
          <span>
            {li.name} — {currency} {Number(li.amount).toFixed(2)}
            {li.description && <span className="mt-0.5 block italic opacity-80">{li.description}</span>}
          </span>
          {canManage && (
            <button
              type="button"
              onClick={() => handleDeleteLineItem(li.id)}
              disabled={remove.pending}
              className="w-fit text-danger hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {remove.state?.error && <p className="text-xs text-danger">{remove.state.error}</p>}
      {canManage && (
      <form action={formAction} className="flex flex-wrap items-center gap-1">
        <Select
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
        >
          <option value="">Custom item…</option>
          {feeProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.default_currency})
            </option>
          ))}
        </Select>
        <input type="hidden" name="product_id" value={selectedProduct} />
        <Input
          name="name"
          placeholder="Item name"
          defaultValue={feeProducts.find((p) => p.id === selectedProduct)?.name ?? ""}
          key={selectedProduct}
          required
          className="w-32"
        />
        <Input
          name="amount"
          type="number"
          step="0.01"
          placeholder={currencyMismatch ? `Amount (in ${currency})` : "Amount"}
          defaultValue={currencyMismatch ? "" : (selectedFeeProduct?.default_amount ?? "")}
          key={`${selectedProduct}-amount`}
          required
          className="w-24"
        />
        {/* The name is a label on a line of the receipt; some items need a
            sentence saying what the student is actually paying for. */}
        <Input name="description" placeholder="What it is for (optional)" className="w-56" />
        {/* Where the money goes. An item added to a plan the student is
            already part way through cannot simply appear on the first
            instalment, and spreading it thin is not always right either — so
            staff say which. Only outstanding instalments are offered. */}
        <label className="flex items-center gap-1 text-xs text-muted">
          on
          <Select name="placement" value={placement || defaultPlacement} onChange={(e) => setPlacement(e.target.value)}>
            {open.map((i) => (
              <option key={i.id} value={i.id}>
                Instalment {i.installment_no}
                {i.id === defaultPlacement ? " (next due)" : ""}
              </option>
            ))}
            {open.length > 1 && <option value="spread">Divide equally</option>}
          </Select>
        </label>
        <Button
          type="submit"
          variant="outline-primary"
          size="sm"
          pending={pending}
          disabled={open.length === 0}
          status={{ state, label: "Added." }}
        >
          + Add item
        </Button>
        {open.length === 0 && (
          <p className="w-full text-xs text-warning">
            Every instalment on this invoice has been paid, so there is nothing left to add an item to. Raise a new
            invoice for it instead.
          </p>
        )}
        {currencyMismatch && (
          <p className="w-full text-xs text-warning">
            {selectedFeeProduct?.name} is priced in {selectedFeeProduct?.default_currency}, but this invoice is in {currency} — enter
            the equivalent amount in {currency} manually.
          </p>
        )}
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
        {/* Said up front, because it is what happens: the item is taxed with
            the fee and the schedule moves to collect it. */}
        <p className="w-full text-[11px] text-muted">
          An added item is taxed at the invoice&rsquo;s rate, and the instalment it goes on is re-priced to collect it.
        </p>
      </form>
      )}
    </div>
  );
}

function GeneratePdfButton({ invoiceId, studentId, revalidateTo, hasExisting }: { invoiceId: string; studentId: string; revalidateTo: string; hasExisting: boolean }) {
  const generate = useButtonAction();

  return (
    <Button
      type="button"
      onClick={() => generate.run(() => generateInvoicePdf(invoiceId, studentId, revalidateTo))}
      pending={generate.pending}
      size="sm"
      status={{ state: generate.state, label: "Generated.", showError: true }}
    >
      {hasExisting ? "Regenerate PDF" : "Generate PDF"}
    </Button>
  );
}

function SendInvoiceEmailButton({ invoiceId, studentId }: { invoiceId: string; studentId: string }) {
  const send = useButtonAction();
  // Who it reached, said beside the button — see handleSendReceipt.
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handle() {
    await send.run(async () => {
      const result = await sendInvoiceToStudent(invoiceId, studentId);
      if (!result?.error) setSentTo(result?.sentTo ?? null);
      return result;
    });
  }

  return (
    <Button
      type="button"
      onClick={handle}
      pending={send.pending}
      size="sm"
      status={{ state: send.state, label: `Sent to ${sentTo ?? "the student"}.`, showError: true }}
    >
      📧 Email invoice
    </Button>
  );
}

const STATUS_TONE = { paid: "success", pending: "warning", overdue: "danger" } as const;

export type AdminChargeRow = {
  id: string;
  destination_id?: string | null;
  country_label: string;
  amount: number | string;
  is_backup: boolean;
};

export function InvoiceCard({
  invoice,
  installments,
  lineItems = [],
  adminCharges = [],
  feeProducts = [],
  studentId,
  studentName,
  pdfUrl,
  revalidateTo,
  canManage = false,
  isSuperAdmin = false,
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
    installment_plan?: string | null;
    admin_fee_status?: string;
    admin_fee_paid_date?: string | null;
    admin_fee_payment_method?: string | null;
    discount_amount?: number | null;
    discount_reason?: string | null;
    tax_rate?: number | null;
    /** Which rule priced this invoice's tax — see TaxBase. */
    tax_base?: string | null;
    issued_on?: string | null;
  };
  installments: {
    id: string;
    installment_no: number;
    amount: number;
    amount_paid?: number | null;
    status: string;
    due_date: string | null;
    payment_method?: string | null;
    paid_date?: string | null;
    carried_from_installment_no?: number | null;
    carried_part_paid?: number | null;
    carried_paid_date?: string | null;
    /** The part of this instalment that is added items plus their tax. */
    extras_amount?: number | string | null;
  }[];
  lineItems?: { id: string; name: string; description?: string | null; amount: number }[];
  /** Per-country administrative charges. Empty on an invoice raised before
   *  the breakdown existed, which shows the single figure as before. */
  adminCharges?: AdminChargeRow[];
  feeProducts?: { id: string; name: string; default_amount: number | null; default_currency: string }[];
  studentId: string;
  studentName?: string;
  pdfUrl?: string | null;
  revalidateTo: string;
  canManage?: boolean;
  isSuperAdmin?: boolean;
}) {
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [editingInstallmentId, setEditingInstallmentId] = useState<string | null>(null);
  const receipt = useButtonAction();
  const [receiptSentTo, setReceiptSentTo] = useState<string | null>(null);

  // Through computeInvoiceMath, the same function the PDF and the email use.
  // Adding the two fees directly ignored the discount and the SRB tax, so this
  // header disagreed with the total on the document the student was sent — and
  // with the installments printed directly beneath it. The added items then
  // went in here by hand, untaxed, while the PDF, the email and the schedule
  // never saw them at all; they are part of the one computation now.
  const math = computeInvoiceMath({
    consultancyFee: invoice.consultancy_fee,
    adminCharge: invoice.admin_charge,
    discountAmount: invoice.discount_amount ?? 0,
    taxRate: invoice.tax_rate ?? 0,
    // This invoice's own rule. Defaulting to the current one would restate
    // every invoice raised before the tax base changed.
    taxBase: (invoice.tax_base as TaxBase | null) ?? "services",
    extras: sumLineItems(lineItems),
  });
  const total = math.total;
  const fmt = (n: number) => `${invoice.currency} ${n.toFixed(2)}`;
  const status = computeInvoiceStatus(installments);
  // The same figures the student sees on their own Payments page and the
  // receipt prints, so the three cannot disagree about what has been received.
  const progress = computePaymentProgress(installments);

  // Says who it reached, not just that it went: this button used to report
  // success without sending anything at all, and "Sent." alone reads the same
  // either way. Said beside the button, as every other action here is.
  async function handleSendReceipt() {
    await receipt.run(async () => {
      const result = await sendReceipt(invoice.id, studentId);
      if (!result?.error) setReceiptSentTo(result?.sentTo ?? null);
      return result;
    });
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          {studentName && <span className="mr-2">{studentName}</span>}
          {invoice.invoice_number && <span className="mr-2 font-mono text-xs text-muted">{invoice.invoice_number}</span>}
          {invoice.currency} {total.toFixed(2)}
          {invoice.installment_plan && <span className="ml-2 text-xs font-normal text-muted">· {invoice.installment_plan}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>
          <Badge tone={invoice.sent_status === "sent" ? "success" : "neutral"}>{invoice.sent_status}</Badge>
          {canManage && (
            <>
              <Button
                type="button"
                onClick={handleSendReceipt}
                size="sm"
                pending={receipt.pending}
                status={{ state: receipt.state, label: `Sent to ${receiptSentTo ?? "the student"}.`, showError: true }}
              >
                Send receipt
              </Button>
              <Button type="button" onClick={() => setEditingInvoice((v) => !v)} size="sm">
                ✏️ Edit
              </Button>
            </>
          )}
          {isSuperAdmin && <DeleteInvoiceButton invoiceId={invoice.id} studentId={studentId} revalidateTo={revalidateTo} />}
        </div>
      </div>

      {editingInvoice && canManage && (
        <EditInvoiceForm
          invoice={invoice}
          adminCharges={adminCharges}
          installmentCount={installments.length}
          paidCount={installments.filter((i) => i.status === "paid" || Number(i.amount_paid ?? 0) > 0).length}
          studentId={studentId}
          revalidateTo={revalidateTo}
          onDone={() => setEditingInvoice(false)}
        />
      )}

      {/* Which country each slice of the administrative charge is for. Only
          worth the room when there is more than one — a single-country
          student's charge is already named on the receipt. */}
      {adminCharges.length > 1 && (
        <div className="mt-2 flex flex-col gap-0.5 border-t border-border pt-2">
          {adminCharges.map((c) => (
            <p key={c.id} className="flex items-center justify-between text-xs text-muted">
              <span>
                Administrative fee — {c.country_label}
                {c.is_backup && <span className="opacity-70"> (Backup)</span>}
              </span>
              <span className="tabular-nums">
                {invoice.currency} {Number(c.amount).toFixed(2)}
              </span>
            </p>
          ))}
        </div>
      )}

      {/* Received and outstanding, side by side and large enough to read at a
          glance. A counsellor asked where a student stands should not have to
          add up the installment rows to answer. */}
      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        <div className="min-w-[9rem] flex-1 rounded-md bg-success-bg px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-success">Received</p>
          <p className="text-xl font-semibold text-success">
            {invoice.currency} {progress.paid.toFixed(2)}
          </p>
          <p className="text-[11px] text-success opacity-80">
            {progress.installmentsPaid} of {progress.installmentsTotal} installments
          </p>
        </div>
        <div
          className={`min-w-[9rem] flex-1 rounded-md px-3 py-2 ${
            progress.outstanding <= 0 ? "bg-success-bg" : "bg-warning-bg"
          }`}
        >
          <p
            className={`text-[11px] font-medium uppercase tracking-wide ${
              progress.outstanding <= 0 ? "text-success" : "text-warning"
            }`}
          >
            Outstanding
          </p>
          <p className={`text-xl font-semibold ${progress.outstanding <= 0 ? "text-success" : "text-warning"}`}>
            {invoice.currency} {progress.outstanding.toFixed(2)}
          </p>
          <p className={`text-[11px] opacity-80 ${progress.outstanding <= 0 ? "text-success" : "text-warning"}`}>
            {progress.outstanding <= 0
              ? "Nothing owed"
              : progress.nextDueDate
                ? `next due ${formatDateOnly(progress.nextDueDate)}`
                : "no due date set"}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
        {installments.map((i) =>
          editingInstallmentId === i.id && canManage ? (
            <EditInstallmentForm key={i.id} installment={i} studentId={studentId} revalidateTo={revalidateTo} onDone={() => setEditingInstallmentId(null)} />
          ) : (
            <div key={i.id} className="flex items-start justify-between text-xs text-muted">
              <span>
                Installment {i.installment_no} — {invoice.currency} {Number(i.amount).toFixed(2)}
                {/* The admin charge is collected with the first installment and
                    an added item with the next unpaid one, so say so rather
                    than leaving staff to wonder why one is bigger. */}
                {installmentNote(i, math, fmt) && <span> ({installmentNote(i, math, fmt)})</span>}
                {i.due_date && ` · due ${formatDateOnly(i.due_date)}`}
                {i.status === "partial" && ` · paid ${invoice.currency} ${(i.amount_paid ?? 0).toFixed(2)}`}
                {/* Where a balance installment came from, so a schedule with
                    more installments than the agreement explains itself. */}
                {carriedFromNote(
                  i.carried_from_installment_no,
                  i.carried_part_paid,
                  i.carried_paid_date,
                  (n) => `${invoice.currency} ${n.toFixed(2)}`,
                  (d) => formatDateOnly(d)
                ) && (
                  <span className="mt-0.5 block italic opacity-80">
                    {carriedFromNote(
                      i.carried_from_installment_no,
                      i.carried_part_paid,
                      i.carried_paid_date,
                      (n) => `${invoice.currency} ${n.toFixed(2)}`,
                      (d) => formatDateOnly(d)
                    )}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1">
                {i.status === "paid" ? (
                  <Badge tone="success">Paid</Badge>
                ) : canManage ? (
                  <MarkPaidForm installmentId={i.id} studentId={studentId} />
                ) : (
                  <Badge tone="warning">{i.status}</Badge>
                )}
                {canManage && (
                  <button type="button" onClick={() => setEditingInstallmentId(i.id)} className="rounded-md border border-border px-1.5 py-0.5 text-xs hover:bg-bg">
                    ✏️
                  </button>
                )}
              </div>
            </div>
          )
        )}
      </div>

      <div className="mt-2 border-t border-border pt-2">
        <LineItemsSection
          invoiceId={invoice.id}
          lineItems={lineItems}
          feeProducts={feeProducts}
          currency={invoice.currency}
          installments={installments}
          revalidateTo={revalidateTo}
          canManage={canManage}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2">
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            👁️ View invoice
          </a>
        )}
        {canManage && (
          <>
            <GeneratePdfButton invoiceId={invoice.id} studentId={studentId} revalidateTo={revalidateTo} hasExisting={Boolean(pdfUrl)} />
            <SendInvoiceEmailButton invoiceId={invoice.id} studentId={studentId} />
          </>
        )}
      </div>
    </div>
  );
}

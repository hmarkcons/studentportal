import { SERVICE_FEE_NAME, serviceOf } from "@/lib/serviceType";
import { CalendarDays, Check, CircleCheck, CreditCard, Eye, PartyPopper, Receipt, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { documentUrls } from "@/lib/storageUrls";
import { formatDateOnly } from "@/lib/formatDate";
import { carriedFromNote } from "@/lib/partialPayment";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { PortalStat, PortalStats } from "@/components/studentPortal/PortalStat";
import { PortalEmpty } from "@/components/studentPortal/PortalEmpty";
import {
  computeInvoiceMath,
  computePaymentProgress,
  feeLineLabel,
  installmentNote,
  sumLineItems,
  PAYMENT_STATUS_LABELS,
} from "@/lib/invoiceMath";

// The figures here go through computeInvoiceMath and computePaymentProgress,
// the same functions behind the receipt PDF and the invoice email. This page
// used to total admin_charge + consultancy_fee on its own, which ignored the
// discount and the SRB tax — so a student's own portal showed them a different
// amount from the invoice they had been sent.

function money(currency: string, n: number) {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const LONG_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export default async function PortalPaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
  if (!student) return null;

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, intake, admin_charge, consultancy_fee, discount_amount, discount_reason, tax_rate, tax_base, currency, pdf_path, created_at, service_type"
    )
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  const pdfByPath = await documentUrls(supabase, (invoices ?? []).map((i) => i.pdf_path));
  const pdfUrls = new Map<string, string>();
  for (const i of invoices ?? []) {
    const url = i.pdf_path ? pdfByPath.get(i.pdf_path) : undefined;
    if (url) pdfUrls.set(i.id, url);
  }

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  // Ordered explicitly: without it the installments came back in whatever
  // order Postgres returned them, so "Installment 3" could sit above 1.
  const { data: installments } = invoiceIds.length
    ? await supabase
        .from("invoice_installments")
        // due_condition matters as much as due_date: the last instalment of a
        // two- or three-payment plan deliberately has no date and falls due on
        // the admission instead (installmentDueConditions). Without it this
        // page told the student "No due date" for the one instalment whose
        // timing is most carefully explained everywhere else.
        .select("id, invoice_id, installment_no, amount, amount_paid, status, due_date, due_condition, paid_date, carried_from_installment_no, carried_part_paid, carried_paid_date, extras_amount")
        .in("invoice_id", invoiceIds)
        .order("installment_no", { ascending: true })
    : { data: [] };

  // Items added after the invoice was raised. Readable by the student since
  // migration 0256; before it the policy named staff only, so this page could
  // not have shown them even if it had asked.
  const { data: lineItems } = invoiceIds.length
    ? await supabase
        .from("invoice_line_items")
        .select("id, invoice_id, name, amount")
        .in("invoice_id", invoiceIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  // One administrative fee per country they registered for — the primary and
  // any backups. Readable by the student since migration 0257.
  const { data: adminCharges } = invoiceIds.length
    ? await supabase
        .from("invoice_admin_charges")
        .select("id, invoice_id, country_label, amount, is_backup")
        .in("invoice_id", invoiceIds)
        .order("sort_order", { ascending: true })
    : { data: [] };

  const today = new Date().toISOString().slice(0, 10);

  // Every invoice worked out once, so the summary at the top and the cards
  // below cannot disagree.
  const rows = (invoices ?? []).map((inv) => {
    const mine = (installments ?? []).filter((i) => i.invoice_id === inv.id);
    const items = (lineItems ?? []).filter((li) => li.invoice_id === inv.id);
    const charges = (adminCharges ?? []).filter((c) => c.invoice_id === inv.id && Number(c.amount ?? 0) > 0);
    // The consultancy fee is the primary country's; a backup country never
    // carries one.
    const primaryCountry = charges.find((c) => !c.is_backup)?.country_label ?? null;
    const math = computeInvoiceMath({
      consultancyFee: Number(inv.consultancy_fee ?? 0),
      adminCharge: Number(inv.admin_charge ?? 0),
      discountAmount: Number(inv.discount_amount ?? 0),
      taxRate: Number(inv.tax_rate ?? 0),
      taxBase: (inv.tax_base as "services" | "total" | null) ?? "services",
      extras: sumLineItems(items),
    });
    const progress = computePaymentProgress(mine);
    // The instalment plan is what the student is actually asked to pay, so it
    // is what Total reports. It can drift from the fee breakdown: editing an
    // invoice's fee does not rebuild its instalments, so a later change leaves
    // the two disagreeing. Say so rather than printing two totals and letting
    // the student pick.
    const scheduleTotal = Math.round(mine.reduce((s, i) => s + Number(i.amount ?? 0), 0) * 100) / 100;
    const total = mine.length > 0 ? scheduleTotal : math.total;
    return {
      inv,
      mine,
      items,
      charges,
      primaryCountry,
      math,
      progress,
      settled: progress.outstanding <= 0,
      total,
      mismatch: mine.length > 0 && Math.abs(scheduleTotal - math.total) > 0.01,
    };
  });

  // Added up only when every invoice is in the same currency; two currencies
  // summed into one figure would be a number nobody owes.
  const currencies = [...new Set(rows.map((r) => r.inv.currency))];
  const oneCurrency = currencies.length === 1 ? currencies[0] : null;
  const outstanding = rows.reduce((s, r) => s + r.progress.outstanding, 0);
  const paidSoFar = rows.reduce((s, r) => s + r.progress.paid, 0);
  const nextDue = rows
    .map((r) => r.progress.nextDueDate)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <PortalPageHeader
        icon={CreditCard}
        title="Payments"
        description="What you owe, what you have paid, and when the next instalment is due. Payment details are on the invoice itself."
      >
        {rows.length > 0 && oneCurrency && (
          <PortalStats>
            <PortalStat
              icon={outstanding <= 0 ? PartyPopper : Wallet}
              value={outstanding <= 0 ? "Paid" : money(oneCurrency, outstanding)}
              label={outstanding <= 0 ? "in full" : "to pay"}
              tone={outstanding <= 0 ? "success" : "warning"}
            />
            <PortalStat icon={CircleCheck} value={money(oneCurrency, paidSoFar)} label="paid so far" tone="success" />
            <PortalStat
              icon={CalendarDays}
              value={nextDue ? formatDateOnly(nextDue, LONG_DATE) : "—"}
              label={nextDue ? (nextDue < today ? "overdue" : "next due") : "nothing due"}
              tone={nextDue && nextDue < today ? "danger" : "default"}
            />
            <PortalStat icon={Receipt} value={rows.length} label={`invoice${rows.length === 1 ? "" : "s"}`} />
          </PortalStats>
        )}
      </PortalPageHeader>

      {rows.length === 0 && (
        <Card>
          <PortalEmpty icon={Receipt} title="No invoices yet.">
            Your invoice appears here once your agreement is signed, with every instalment and the date each one is due.
          </PortalEmpty>
        </Card>
      )}

      <div className="flex flex-col gap-6">
        {rows.map(({ inv, mine, items, charges, primaryCountry, math, progress, settled, total, mismatch }) => {
          const cur = inv.currency;
          const paidPercent = total > 0 ? Math.round((progress.paid / total) * 100) : 0;

          return (
            <Card key={inv.id} className="relative overflow-hidden">
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${settled ? "bg-success" : "bg-transparent"}`} />
              <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                <div>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">{settled ? "Paid in full" : "Outstanding"}</p>
                    <Badge tone={settled ? "success" : progress.paid > 0 ? "warning" : "neutral"}>
                      {PAYMENT_STATUS_LABELS[progress.status]}
                    </Badge>
                  </div>
                  <p className={`text-3xl font-semibold tracking-tight ${settled ? "text-success" : "text-ink"}`}>
                    {money(cur, settled ? progress.paid : progress.outstanding)}
                  </p>
                  {/* What they have already paid, called out rather than left
                      as one line in the breakdown below. A student part-way
                      through a plan wants this figure first, and it is the one
                      piece of the page that is reassuring. */}
                  {!settled && progress.paid > 0 && (
                    <p className="mt-2 inline-flex items-baseline gap-1.5 rounded-lg bg-success-bg px-2.5 py-1">
                      <span className="text-xs font-medium text-success">Paid so far</span>
                      <span className="text-base font-semibold text-success">{money(cur, progress.paid)}</span>
                      <span className="text-[11px] text-success opacity-80">
                        of {money(cur, total)}
                      </span>
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-muted">
                    <Receipt aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px] shrink-0" />
                    {inv.invoice_number ?? "Invoice"}
                    {inv.intake && ` · ${inv.intake} intake`}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <ProgressRing value={paidPercent} label="Paid" size={96} tone={settled ? "success" : undefined} />
                  {/* No payment status shown for the invoice document itself:
                      whether staff have emailed it is our bookkeeping, not
                      something a student can act on. */}
                  {pdfUrls.has(inv.id) && (
                    <a
                      href={pdfUrls.get(inv.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-primary inline-flex w-fit items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-primary-ink shadow-sm transition-colors hover:bg-[var(--brand-strong)]"
                    >
                      <Eye aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      View invoice
                    </a>
                  )}
                </div>
              </div>

              {/* The breakdown and the schedule side by side on a wide screen:
                  what the total is made of, and when it is paid. */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl bg-bg/60 px-4 py-3">
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">What it is for</h3>
              <dl className="flex flex-col gap-0.5">
                <Line label={feeLineLabel(SERVICE_FEE_NAME[serviceOf(inv.service_type)], primaryCountry)} value={money(cur, math.consultancyFee)} />
                {math.discountAmount > 0 && (
                  <Line
                    label={`Discount${inv.discount_reason ? ` · ${inv.discount_reason}` : ""}`}
                    value={`- ${money(cur, math.discountAmount)}`}
                  />
                )}
                {/* Each added item on its own line, beside the fee it is taxed
                    with, so every figure in the total has a name. */}
                {items.map((li) => (
                  <Line key={li.id} label={li.name} value={money(cur, Number(li.amount ?? 0))} />
                ))}
                {math.taxAmount > 0 && <Line label={`SRB tax · ${math.taxRate}%`} value={money(cur, math.taxAmount)} />}
                {/* One line per country. A student who registered for a
                    primary and two backups pays an administrative fee for
                    each, and should be able to see which is which. */}
                {charges.length > 0
                  ? charges.map((c) => (
                      <Line
                        key={c.id}
                        label={feeLineLabel("Administrative fee", c.country_label, c.is_backup)}
                        value={money(cur, Number(c.amount ?? 0))}
                      />
                    ))
                  : math.adminCharge > 0 && <Line label="Administrative fee" value={money(cur, math.adminCharge)} />}
                <Line label="Total" value={money(cur, total)} strong />
                {progress.paid > 0 && <Line label="Paid" value={`- ${money(cur, progress.paid)}`} tone="success" />}
                <Line label="Balance" value={money(cur, progress.outstanding)} strong tone={settled ? "success" : undefined} />
              </dl>

              {mismatch && (
                <p className="mt-3 rounded-lg bg-warning-bg p-3 text-xs text-warning">
                  Please check with your counsellor before paying: the instalment plan below and the fee breakdown above
                  don&rsquo;t currently add up to the same figure. The instalments are what we have on record.
                </p>
              )}
              </div>

              {mine.length > 0 && (
                <div>
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Instalments</h3>
                  <ol className="relative flex flex-col gap-3 pl-9">
                    <span aria-hidden className="absolute bottom-3 left-[13px] top-3 w-0.5 rounded-full bg-border" />
                    {mine.map((i) => {
                      const overdue = i.status !== "paid" && i.due_date && i.due_date < today;
                      const note = installmentNote(i, math, (n) => money(cur, n));
                      const carried = carriedFromNote(
                        i.carried_from_installment_no,
                        i.carried_part_paid ? Number(i.carried_part_paid) : null,
                        i.carried_paid_date,
                        (n) => money(cur, n),
                        (d) => formatDateOnly(d, LONG_DATE)
                      );
                      return (
                        <li key={i.id} className="relative flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                          <span
                            aria-hidden
                            className={`absolute -left-9 top-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                              i.status === "paid"
                                ? "bg-[var(--brand-bright)] text-white"
                                : overdue
                                  ? "bg-danger text-white"
                                  : "border-2 border-border bg-card text-muted"
                            }`}
                          >
                            {i.status === "paid" ? <Check className="h-4 w-4" strokeWidth={3} /> : overdue ? "!" : "•"}
                          </span>
                          <span className="min-w-0 text-ink">
                            <span className="font-medium">
                              {i.installment_no}. {money(cur, Number(i.amount ?? 0))}
                            </span>
                            {/* The administrative charge is collected with the
                                first instalment, and an added item with the
                                next one to be paid, so either can be larger
                                by design. */}
                            {note && <span className="text-muted"> · {note}</span>}
                            {i.status === "partial" && Number(i.amount_paid ?? 0) > 0 && (
                              <span className="text-muted"> · {money(cur, Number(i.amount_paid))} received</span>
                            )}
                            {/* An instalment the student only part-paid was
                                split, and this is the rest of it. Said plainly,
                                or an extra instalment nobody recognises looks
                                like a mistake in their plan. */}
                            {carried && <span className="mt-0.5 block text-xs text-muted">{carried}</span>}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {/* Not nowrap when it is a condition: the sentence
                                is far longer than a date and has to wrap. */}
                            <span className={`text-xs ${i.due_condition && i.status !== "paid" ? "" : "whitespace-nowrap"} ${overdue ? "text-danger" : "text-muted"}`}>
                              {i.status === "paid"
                                ? i.paid_date
                                  ? `Paid ${formatDateOnly(i.paid_date, LONG_DATE)}`
                                  : "Paid"
                                : i.due_date
                                  ? `Due ${formatDateOnly(i.due_date, LONG_DATE)}`
                                  // The condition reads as a sentence of its
                                  // own ("On admission approval from your
                                  // first public university"), so no "Due"
                                  // prefix in front of it.
                                  : (i.due_condition ?? "No due date")}
                            </span>
                            <Badge tone={i.status === "paid" ? "success" : overdue ? "danger" : "warning"}>
                              {i.status === "paid" ? "Paid" : overdue ? "Overdue" : i.status === "partial" ? "Part paid" : "Due"}
                            </Badge>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "success";
}) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-2 py-1 ${strong ? "border-t border-border pt-2" : ""}`}>
      <dt className={strong ? "text-sm font-medium text-ink" : "text-xs text-muted"}>{label}</dt>
      <dd
        className={`tabular-nums ${strong ? "text-sm font-semibold" : "text-sm"} ${
          tone === "success" ? "text-success" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { computeInvoiceMath, computePaymentProgress, PAYMENT_STATUS_LABELS } from "@/lib/invoiceMath";

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
      "id, invoice_number, intake, admin_charge, consultancy_fee, discount_amount, discount_reason, tax_rate, currency, pdf_path, created_at"
    )
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  const pdfUrls = new Map<string, string>();
  await Promise.all(
    (invoices ?? [])
      .filter((i) => i.pdf_path)
      .map(async (i) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(i.pdf_path!, 3600);
        if (data?.signedUrl) pdfUrls.set(i.id, data.signedUrl);
      })
  );

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  // Ordered explicitly: without it the installments came back in whatever
  // order Postgres returned them, so "Installment 3" could sit above 1.
  const { data: installments } = invoiceIds.length
    ? await supabase
        .from("invoice_installments")
        .select("id, invoice_id, installment_no, amount, amount_paid, status, due_date, paid_date")
        .in("invoice_id", invoiceIds)
        .order("installment_no", { ascending: true })
    : { data: [] };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Payments</h2>
      <p className="mb-4 text-sm text-muted">
        What you owe, what you have paid, and when the next instalment is due. Payment details are on the invoice itself.
      </p>

      {(invoices ?? []).length === 0 && <EmptyState>No invoices yet.</EmptyState>}

      <div className="flex flex-col gap-6">
        {(invoices ?? []).map((inv) => {
          const mine = (installments ?? []).filter((i) => i.invoice_id === inv.id);
          const math = computeInvoiceMath({
            consultancyFee: Number(inv.consultancy_fee ?? 0),
            adminCharge: Number(inv.admin_charge ?? 0),
            discountAmount: Number(inv.discount_amount ?? 0),
            taxRate: Number(inv.tax_rate ?? 0),
          });
          const progress = computePaymentProgress(mine);
          const settled = progress.outstanding <= 0;
          const cur = inv.currency;

          return (
            <Card key={inv.id}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div>
                  <p className="text-xs text-muted">{settled ? "Paid in full" : "Outstanding"}</p>
                  <p className={`text-2xl font-semibold ${settled ? "text-success" : "text-ink"}`}>
                    {money(cur, settled ? progress.paid : progress.outstanding)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {inv.invoice_number ?? "Invoice"}
                    {inv.intake && ` · ${inv.intake} intake`}
                  </p>
                </div>
                <Badge tone={settled ? "success" : progress.paid > 0 ? "warning" : "neutral"}>
                  {PAYMENT_STATUS_LABELS[progress.status]}
                </Badge>
              </div>

              <dl className="flex flex-col gap-0.5 border-t border-border pt-3">
                <Line label="Consultancy fee" value={money(cur, math.consultancyFee)} />
                {math.discountAmount > 0 && (
                  <Line
                    label={`Discount${inv.discount_reason ? ` · ${inv.discount_reason}` : ""}`}
                    value={`- ${money(cur, math.discountAmount)}`}
                  />
                )}
                {math.taxAmount > 0 && <Line label={`SRB tax · ${math.taxRate}%`} value={money(cur, math.taxAmount)} />}
                {math.adminCharge > 0 && <Line label="Administrative charge" value={money(cur, math.adminCharge)} />}
                <Line label="Total" value={money(cur, math.total)} strong />
                {progress.paid > 0 && <Line label="Paid" value={`- ${money(cur, progress.paid)}`} tone="success" />}
                <Line label="Balance" value={money(cur, progress.outstanding)} strong tone={settled ? "success" : undefined} />
              </dl>

              {mine.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Instalments</h3>
                  <div className="flex flex-col gap-2">
                    {mine.map((i) => {
                      const overdue = i.status !== "paid" && i.due_date && i.due_date < today;
                      return (
                        <div key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                          <span className="text-ink">
                            {i.installment_no}. {money(cur, Number(i.amount ?? 0))}
                            {/* The administrative charge is collected with the
                                first instalment, so it is larger by design. */}
                            {i.installment_no === 1 && math.adminCharge > 0 && (
                              <span className="text-muted"> · includes the {money(cur, math.adminCharge)} admin charge</span>
                            )}
                            {i.status === "partial" && Number(i.amount_paid ?? 0) > 0 && (
                              <span className="text-muted"> · {money(cur, Number(i.amount_paid))} received</span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className={`whitespace-nowrap text-xs ${overdue ? "text-danger" : "text-muted"}`}>
                              {i.status === "paid"
                                ? i.paid_date
                                  ? `Paid ${formatDateOnly(i.paid_date, LONG_DATE)}`
                                  : "Paid"
                                : i.due_date
                                  ? `Due ${formatDateOnly(i.due_date, LONG_DATE)}`
                                  : "No due date"}
                            </span>
                            <Badge tone={i.status === "paid" ? "success" : overdue ? "danger" : "warning"}>
                              {i.status === "paid" ? "Paid" : overdue ? "Overdue" : i.status === "partial" ? "Part paid" : "Due"}
                            </Badge>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No payment status shown for the invoice document itself: whether
                  staff have emailed it is our bookkeeping, not something a
                  student can act on. */}
              {pdfUrls.has(inv.id) && (
                <a
                  href={pdfUrls.get(inv.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  👁️ View invoice
                </a>
              )}
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

import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function PortalPaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
  if (!student) return null;

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, admin_charge, consultancy_fee, currency, sent_status, pdf_path")
    .eq("student_id", student.id);

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
  const { data: installments } = invoiceIds.length
    ? await supabase.from("invoice_installments").select("*").in("invoice_id", invoiceIds)
    : { data: [] };

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Payments & Invoices</h2>
      {(invoices ?? []).map((inv) => (
        <Card key={inv.id} className="mb-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">
              Total: {inv.currency} {(inv.admin_charge + inv.consultancy_fee).toFixed(2)}
            </p>
            <Badge tone={inv.sent_status === "sent" ? "success" : "neutral"}>{inv.sent_status}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            Administrative charge: {inv.currency} {inv.admin_charge} · Consultancy fee: {inv.currency} {inv.consultancy_fee}
          </p>
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            {(installments ?? [])
              .filter((i) => i.invoice_id === inv.id)
              .map((i) => (
                <div key={i.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">
                    Installment {i.installment_no} — {inv.currency} {i.amount}
                    {i.due_date && ` · due ${formatDateOnly(i.due_date)}`}
                  </span>
                  <Badge tone={i.status === "paid" ? "success" : "warning"}>{i.status}</Badge>
                </div>
              ))}
          </div>
          {pdfUrls.has(inv.id) && (
            <a
              href={pdfUrls.get(inv.id)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-bg"
            >
              Download invoice
            </a>
          )}
        </Card>
      ))}
      {(!invoices || invoices.length === 0) && <EmptyState>No invoices yet.</EmptyState>}
    </div>
  );
}

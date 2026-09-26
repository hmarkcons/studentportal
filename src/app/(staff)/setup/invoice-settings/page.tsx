import { hasRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { getInvoiceBankSettings } from "@/lib/actions/invoiceSettings";
import { bankFromSettings, hasBankDetails } from "@/lib/invoiceIssuer";
import { InvoiceSettingsForm } from "./InvoiceSettingsForm";

export default async function InvoiceSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle();
  // Fixed rather than a Role Permissions switch, and the database agrees (0286).
  const canEdit = hasRole(staffRow, "super_admin", "finance");

  const [settings, { count: pdfCount }] = await Promise.all([
    getInvoiceBankSettings(),
    supabase.from("invoices").select("id", { count: "exact", head: true }).not("pdf_path", "is", null),
  ]);
  const bankSet = hasBankDetails(bankFromSettings(settings));

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Invoice Settings</h2>
      <p className="mb-4 text-sm text-muted">
        Everything an invoice or receipt says apart from the student&rsquo;s own figures: who it is from, its wording, and
        where to pay. The invoice PDF and the invoice email both read it.
      </p>

      {!bankSet && (
        <Card className="mb-4 bg-warning-bg">
          <p className="text-sm text-warning">
            No bank details are set, so invoices leave the bank out entirely and tell the student nothing about where to
            pay{settings?.payment_note?.trim() ? " beyond the note below" : ""}. Fill them in if students should pay by bank
            transfer.
          </p>
        </Card>
      )}

      <Card>
        <InvoiceSettingsForm settings={settings} canEdit={canEdit} pdfCount={pdfCount ?? 0} />
      </Card>
    </div>
  );
}

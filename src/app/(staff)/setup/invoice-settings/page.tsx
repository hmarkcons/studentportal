import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { getInvoiceBankSettings } from "@/lib/actions/invoiceSettings";
import { InvoiceSettingsForm } from "./InvoiceSettingsForm";

export default async function InvoiceSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const isSuperAdmin = staffRow?.role === "super_admin";

  const settings = await getInvoiceBankSettings();
  const configured = Boolean(
    settings?.account_title || settings?.bank_name || settings?.iban || settings?.account_number
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Invoice Settings</h2>
      <p className="mb-4 text-sm text-muted">
        These bank details print on every invoice and receipt as the account the student should pay into.
      </p>

      {!configured && (
        <Card className="mb-4 bg-warning-bg">
          <p className="text-sm text-warning">
            No bank details are set yet, so invoices currently print &ldquo;Bank details not yet configured&rdquo; in place of
            the payment instructions. Fill these in before sending any invoice to a student.
          </p>
        </Card>
      )}

      <Card>
        <InvoiceSettingsForm settings={settings} canEdit={isSuperAdmin} />
      </Card>
    </div>
  );
}

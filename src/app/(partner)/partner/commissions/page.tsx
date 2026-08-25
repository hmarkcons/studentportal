import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CommissionRow } from "./CommissionRow";

export default async function PartnerCommissionsPage() {
  const supabase = await createClient();
  const { data: commissions } = await supabase
    .from("partner_commissions")
    .select("id, expected_amount, currency, status, student:leads(full_name)");

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Commissions</h2>
      <Card>
        <div className="flex flex-col divide-y divide-border">
          {(commissions ?? []).map((c) => (
            <CommissionRow key={c.id} commission={c} />
          ))}
          {(!commissions || commissions.length === 0) && <p className="py-6 text-sm text-muted">No commission records yet.</p>}
        </div>
      </Card>
    </div>
  );
}

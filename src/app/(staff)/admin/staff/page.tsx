import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { STAFF_ROLE_LABELS } from "@/lib/constants";
import { NewStaffForm } from "./NewStaffForm";
import { StaffStatusSelect } from "./StaffStatusSelect";
import { PartnerApprovalButton } from "./PartnerApprovalButton";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StaffAdminPage() {
  const supabase = await createClient();

  const { data: staff } = await supabase.from("staff").select("id, full_name, role, status").order("full_name");
  const { data: pendingPartners } = await supabase
    .from("partner_university_accounts")
    .select("id, staff_name, status, university:universities(name)")
    .eq("status", "pending");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Staff Management</h2>
      <Card className="mb-6">
        <NewStaffForm />
      </Card>

      <div className="mb-6 flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(staff ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-ink">
              {s.full_name} <span className="text-muted">· {STAFF_ROLE_LABELS[s.role as never] ?? s.role}</span>
            </span>
            <StaffStatusSelect id={s.id} status={s.status} />
          </div>
        ))}
      </div>

      {pendingPartners && pendingPartners.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Pending partner university accounts</h3>
          <div className="flex flex-col divide-y divide-border">
            {pendingPartners.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {p.staff_name} · {one(p.university)?.name}
                </span>
                <div className="flex items-center gap-2">
                  <Badge tone="warning">pending</Badge>
                  <PartnerApprovalButton id={p.id} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

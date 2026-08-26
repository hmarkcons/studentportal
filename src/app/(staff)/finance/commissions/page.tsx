import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { MarkPaidForm } from "./MarkPaidForm";
import { NewCommissionForm } from "./NewCommissionForm";
import { DeleteCommissionButton } from "./DeleteCommissionButton";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StaffCommissionsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const canManage = staffRow?.role === "finance" || staffRow?.role === "super_admin";
  const isSuperAdmin = staffRow?.role === "super_admin";

  const { data: commissions } = await supabase
    .from("staff_commissions")
    .select("id, amount, currency, status, registration_date, staff:staff(full_name), student:leads(full_name)")
    .order("registration_date", { ascending: false });

  const { data: staffList } = await supabase.from("staff").select("id, full_name").order("full_name");
  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Staff Commissions</h2>
      {isSuperAdmin && <NewCommissionForm staff={staffList ?? []} students={students ?? []} />}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              {(canManage || isSuperAdmin) && <th className="px-4 py-3">Action</th>}
            </tr>
          </thead>
          <tbody>
            {(commissions ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{one(c.staff)?.full_name}</td>
                <td className="px-4 py-3">{one(c.student)?.full_name}</td>
                <td className="px-4 py-3">{c.registration_date ? new Date(c.registration_date).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.currency} {c.amount}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={c.status === "paid" ? "success" : "warning"}>{c.status}</Badge>
                </td>
                {(canManage || isSuperAdmin) && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {canManage && c.status !== "paid" && <MarkPaidForm id={c.id} />}
                      {isSuperAdmin && <DeleteCommissionButton id={c.id} />}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {(!commissions || commissions.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No commission records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

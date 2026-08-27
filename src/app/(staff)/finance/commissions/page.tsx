import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { ProofFileCell } from "@/components/ProofFileCell";
import { uploadStaffCommissionProof } from "@/lib/actions/finance";
import { MarkPaidForm } from "./MarkPaidForm";
import { NewCommissionForm } from "./NewCommissionForm";
import { DeleteCommissionButton } from "./DeleteCommissionButton";
import { EditCommissionForm } from "./EditCommissionForm";

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
    .select("id, amount, currency, status, registration_date, payment_proof_path, staff:staff(full_name), student:leads(full_name)")
    .order("registration_date", { ascending: false });

  const proofUrls = new Map<string, string>();
  await Promise.all(
    (commissions ?? [])
      .filter((c) => c.payment_proof_path)
      .map(async (c) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(c.payment_proof_path!, 3600);
        if (data?.signedUrl) proofUrls.set(c.id, data.signedUrl);
      })
  );

  const { data: staffList } = await supabase.from("staff").select("id, full_name").order("full_name");
  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Staff Payroll</h2>
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
              <th className="px-4 py-3">Proof</th>
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
                <td className="px-4 py-3">
                  {canManage ? (
                    <ProofFileCell
                      viewUrl={proofUrls.get(c.id)}
                      uploadAction={uploadStaffCommissionProof.bind(null, c.id, "/finance/commissions")}
                    />
                  ) : proofUrls.has(c.id) ? (
                    <a href={proofUrls.get(c.id)} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                      View proof
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                {(canManage || isSuperAdmin) && (
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-2">
                      <div className="flex items-center gap-2">
                        {canManage && c.status !== "paid" && <MarkPaidForm id={c.id} />}
                        {canManage && <EditCommissionForm id={c.id} amount={c.amount} currency={c.currency} registration_date={c.registration_date} status={c.status} />}
                        {isSuperAdmin && <DeleteCommissionButton id={c.id} />}
                      </div>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {(!commissions || commissions.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
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

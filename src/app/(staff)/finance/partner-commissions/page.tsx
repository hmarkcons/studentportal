import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { ProofFileCell } from "@/components/ProofFileCell";
import { uploadPartnerCommissionProof } from "@/lib/actions/finance";
import { StatusButtons } from "./StatusButtons";
import { DeletePartnerCommissionButton } from "./DeletePartnerCommissionButton";
import { EditPartnerCommissionForm } from "./EditPartnerCommissionForm";
import { AddPartnerCommissionForm } from "./AddPartnerCommissionForm";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  received: "success",
  pending: "warning",
  not_yet_due: "neutral",
  partially_received: "warning",
  overdue: "danger",
  disputed: "danger",
};

export default async function PartnerCommissionsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const isSuperAdmin = staffRow?.role === "super_admin";
  const canManage = staffRow?.role === "finance" || staffRow?.role === "super_admin";

  const { data: rowsRaw } = await supabase
    .from("partner_commissions")
    .select(
      "id, paid_fee, fee_payment_date, rate_percent, fixed_amount, expected_amount, currency, channel, wallet_platform, received_date, hmark_bank_account, payment_proof_path, status, student:leads(full_name), application:applications(university:universities(name), program:programs(tuition_fee, rate:program_commission_rates(rate_percent, fixed_amount, currency)))"
    );
  const rows = (rowsRaw ?? []).map((r) => {
    const app = one(r.application);
    const program = app ? (one(app.program as never) as { tuition_fee: number | null; rate: unknown } | null) : null;
    const configuredRate = program ? (one(program.rate as never) as { rate_percent: number | null; fixed_amount: number | null; currency: string } | null) : null;
    return {
      ...r,
      tuitionFee: program?.tuition_fee ?? null,
      configuredRatePercent: configuredRate?.rate_percent ?? null,
      configuredFixedAmount: configuredRate?.fixed_amount ?? null,
      configuredRateCurrency: configuredRate?.currency ?? null,
    };
  });

  const proofUrls = new Map<string, string>();
  await Promise.all(
    rows
      .filter((r) => r.payment_proof_path)
      .map(async (r) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(r.payment_proof_path!, 3600);
        if (data?.signedUrl) proofUrls.set(r.id, data.signedUrl);
      })
  );

  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");
  const { data: rawApplications } = await supabase
    .from("applications")
    .select(
      "id, student_id, university:universities(name), program:programs(tuition_fee, rate:program_commission_rates(rate_percent, fixed_amount, currency))"
    )
    .order("created_at", { ascending: false });
  const applications = (rawApplications ?? []).map((a) => {
    const program = one(a.program as never) as { tuition_fee: number | null; rate: unknown } | null;
    const rate = program ? (one(program.rate as never) as { rate_percent: number | null; fixed_amount: number | null; currency: string } | null) : null;
    return {
      id: a.id,
      student_id: a.student_id,
      universityName: (one(a.university as never) as { name?: string } | null)?.name ?? "Unknown university",
      tuitionFee: program?.tuition_fee ?? null,
      ratePercent: rate?.rate_percent ?? null,
      fixedAmount: rate?.fixed_amount ?? null,
      rateCurrency: rate?.currency ?? null,
    };
  });

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">University Commissions</h2>
      {canManage && <AddPartnerCommissionForm students={students ?? []} applications={applications} />}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">University</th>
              <th className="px-4 py-3 text-right">Expected</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Proof</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const app = one(r.application);
              const uni = app ? one(app.university as never) : null;
              return (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{one(r.student)?.full_name}</td>
                  <td className="px-4 py-3">{(uni as { name?: string } | null)?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.currency} {r.expected_amount ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[r.status] ?? "neutral"}>{r.status.replace(/_/g, " ")}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <ProofFileCell
                        viewUrl={proofUrls.get(r.id)}
                        uploadAction={uploadPartnerCommissionProof.bind(null, r.id, "/finance/partner-commissions")}
                      />
                    ) : proofUrls.has(r.id) ? (
                      <a href={proofUrls.get(r.id)} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        View proof
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-2">
                      <div className="flex items-center gap-2">
                        {canManage ? (
                          <StatusButtons id={r.id} />
                        ) : (
                          "—"
                        )}
                        {canManage && <EditPartnerCommissionForm row={r} />}
                        {isSuperAdmin && <DeletePartnerCommissionButton id={r.id} />}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No partner commission records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

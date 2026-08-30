import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { RefundActions } from "./RefundActions";
import { NewRefundForm } from "./NewRefundForm";
import { RefundEligibilityForm } from "./RefundEligibilityForm";
import { syncVisaRefusalRefunds } from "@/lib/actions/finance";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  requested: "warning",
  approved: "info",
  processed: "success",
  rejected: "danger",
};

const TRIGGER_LABEL: Record<string, string> = {
  no_admission: "No admission — 100%",
  visa_refusal: "Visa refusal (private) — 50%",
  manual: "Manual",
};

const REFUND_WINDOW_DAYS = 90;

function deadlineInfo(refusalNoticeDate: string | null) {
  if (!refusalNoticeDate) return null;
  const notice = new Date(refusalNoticeDate + "T00:00:00Z");
  const deadline = new Date(notice.getTime() + REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const overdue = deadline.getTime() < Date.now();
  return { deadline, overdue };
}

export default async function RefundsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const isSuperAdmin = staffRow?.role === "super_admin";
  const canManage = staffRow?.role === "finance" || staffRow?.role === "management" || staffRow?.role === "super_admin";

  const { errors: syncErrors } = await syncVisaRefusalRefunds();

  const { data: refunds } = await supabase
    .from("refund_requests")
    .select(
      "id, reason, amount, currency, status, requested_at, trigger_type, refund_percent, refusal_notice_date, eligibility_status, next_intake_note, next_intake_country_id, next_intake_country:destinations!refund_requests_next_intake_country_id_fkey(country, display_name), student:leads(full_name)"
    )
    .order("requested_at", { ascending: false });

  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");
  const { data: privateDestinations } = await supabase
    .from("destinations")
    .select("id, country, display_name")
    .eq("track", "private")
    .eq("status", "active")
    .order("country");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Refund Requests</h2>
      <p className="mb-4 text-sm text-muted">
        No admission: 100% of consultancy fee refunded within 90 days of the refusal notice. Visa refusal in a
        private-university country: 50% within 90 days — those appear below automatically once a visa is marked
        refused.
      </p>
      {syncErrors.length > 0 && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <p className="font-medium">Some visa-refusal refunds couldn&apos;t be auto-created:</p>
          <ul className="mt-1 list-disc pl-5">
            {syncErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {isSuperAdmin && <NewRefundForm students={students ?? []} />}
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(refunds ?? []).map((r) => {
          const deadline = deadlineInfo(r.refusal_notice_date);
          const country = one(r.next_intake_country as never) as { country?: string; display_name?: string } | null;
          const ineligible = r.eligibility_status === "ineligible_reapplying";
          return (
            <div key={r.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink">
                    {one(r.student)?.full_name} — {r.currency ?? ""} {r.amount ?? "—"}
                    {r.refund_percent != null && <span className="text-xs text-muted"> ({r.refund_percent}%)</span>}
                  </p>
                  <p className="text-xs text-muted">{r.reason}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone="neutral">{TRIGGER_LABEL[r.trigger_type] ?? r.trigger_type}</Badge>
                    {deadline && (
                      <span className={deadline.overdue && r.status !== "processed" ? "text-danger" : ""}>
                        Refund due by {deadline.deadline.toISOString().slice(0, 10)}
                        {deadline.overdue && r.status !== "processed" ? " — overdue" : ""}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                  {ineligible && <Badge tone="danger">Ineligible — reapplying</Badge>}
                  <RefundActions id={r.id} status={r.status} canManage={canManage} isSuperAdmin={isSuperAdmin} ineligible={ineligible} />
                </div>
              </div>

              {canManage && (
                <RefundEligibilityForm
                  id={r.id}
                  eligibilityStatus={r.eligibility_status}
                  nextIntakeNote={r.next_intake_note}
                  nextIntakeCountryId={(r.next_intake_country_id as string | null) ?? ""}
                  destinations={privateDestinations ?? []}
                />
              )}
              {!canManage && ineligible && (
                <p className="text-xs text-muted">
                  Reapplying for {country?.display_name ?? country?.country ?? "next intake"}
                  {r.next_intake_note ? ` — ${r.next_intake_note}` : ""}
                </p>
              )}
            </div>
          );
        })}
        {(!refunds || refunds.length === 0) && <p className="px-4 py-6 text-sm text-muted">No refund requests.</p>}
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { Card } from "@/components/ui/Card";
import { AddProgramForm } from "./AddProgramForm";
import { DeleteProgramButton } from "./DeleteProgramButton";

export default async function PartnerProgramsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: account } = await supabase.from("partner_university_accounts").select("university_id").eq("id", user?.id ?? "").maybeSingle();
  if (!account) return null;

  const { data: programs } = await supabase
    .from("programs")
    .select("id, level, name, core_field, sub_field, duration, tuition_fee, language_requirement, application_deadline")
    .eq("university_id", account.university_id)
    .order("level");

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Course/Program Management</h2>
      <p className="mb-4 text-sm text-muted">
        Manage your university&apos;s own program directory — this feeds directly into HMARK&apos;s course database.
      </p>
      <Card className="mb-6">
        <AddProgramForm />
      </Card>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(programs ?? []).map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="text-ink">
                {p.level} · {p.name}
                {p.core_field && <span className="text-muted"> · {p.core_field}</span>}
              </p>
              <p className="text-xs text-muted">
                {p.duration ?? "—"} · {p.language_requirement ?? "—"}
                {p.tuition_fee != null ? ` · ${p.tuition_fee}` : ""}
                {p.application_deadline ? ` · deadline ${formatDateOnly(p.application_deadline)}` : ""}
              </p>
            </div>
            <DeleteProgramButton id={p.id} />
          </div>
        ))}
        {(!programs || programs.length === 0) && <p className="px-4 py-6 text-sm text-muted">No programs added yet.</p>}
      </div>
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PortalDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, assigned_counselor:staff(full_name, designation, phone, whatsapp_number)")
    .eq("auth_user_id", user?.id ?? "")
    .maybeSingle();

  if (!student) return null;

  const { data: applications } = await supabase
    .from("applications")
    .select("id, current_stage, intake, university:universities(name, destination:destinations(pipeline_stages)), program:programs(name)")
    .eq("student_id", student.id);

  const { count: pendingDocs } = await supabase
    .from("student_documents")
    .select("id", { count: "exact", head: true })
    .eq("student_id", student.id)
    .in("status", ["missing", "rejected"]);

  const counselor = one(student.assigned_counselor);

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-6 text-lg font-semibold text-ink">Welcome back, {student.full_name}</h2>

      {counselor && (
        <Card className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-ink">Your counselor</h3>
          <p className="text-sm text-ink">{counselor.full_name}</p>
          <p className="text-xs text-muted">
            {counselor.designation ?? "Counselor"} · {counselor.phone ?? counselor.whatsapp_number ?? "—"}
          </p>
        </Card>
      )}

      <Card className="mb-6 bg-warning-bg">
        <p className="text-sm text-warning">{pendingDocs ?? 0} document(s) need your attention.</p>
      </Card>

      <h3 className="mb-3 text-sm font-medium text-ink">Your applications</h3>
      <div className="flex flex-col gap-4">
        {(applications ?? []).map((app) => {
          const uni = one(app.university);
          const dest = uni ? one(uni.destination as never) : null;
          return (
            <Link key={app.id} href={`/portal/applications/${app.id}`}>
              <BoardingPassTracker
                universityName={uni?.name ?? "University"}
                programName={one(app.program)?.name}
                intake={app.intake}
                currentStage={app.current_stage}
                pipelineStages={(dest as { pipeline_stages?: string[] } | null)?.pipeline_stages ?? []}
              />
            </Link>
          );
        })}
        {(!applications || applications.length === 0) && <p className="text-sm text-muted">No applications yet.</p>}
      </div>
    </div>
  );
}

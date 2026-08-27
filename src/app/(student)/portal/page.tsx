import Link from "next/link";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { EmptyState } from "@/components/ui/EmptyState";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PortalDashboardPage() {
  const { supabase, userId } = await getStudentUser();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, assigned_counselor:staff(full_name, designation, phone, whatsapp_number)")
    .eq("auth_user_id", userId ?? "")
    .maybeSingle();

  if (!student) return null;

  const [{ data: applications }, { count: pendingDocs }, { count: unassignedDocs }] = await Promise.all([
    supabase
      .from("applications")
      .select("id, current_stage, intake, university:universities(name, destination:destinations(pipeline_stages)), program:programs(name)")
      .eq("student_id", student.id),
    supabase
      .from("student_documents")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .in("status", ["missing", "rejected"]),
    supabase
      .from("student_documents")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .is("application_id", null)
      .in("status", ["missing", "rejected"]),
  ]);

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

      {(pendingDocs ?? 0) > 0 && (
        <Link href="/portal/documents">
          <Card className="mb-6 bg-warning-bg">
            <p className="text-sm text-warning">
              {pendingDocs} document(s) need your attention{(unassignedDocs ?? 0) > 0 ? ` — including ${unassignedDocs} general document(s)` : ""}. Tap
              to upload.
            </p>
          </Card>
        </Link>
      )}

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
        {(!applications || applications.length === 0) && <EmptyState>No applications yet.</EmptyState>}
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function daysUntil(dateStr: string) {
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function CountdownBadge({ dateStr }: { dateStr: string }) {
  const days = daysUntil(dateStr);
  if (days < 0) return <Badge tone="neutral">Past</Badge>;
  if (days === 0) return <Badge tone="danger">Today</Badge>;
  if (days <= 7) return <Badge tone="warning">In {days} day{days === 1 ? "" : "s"}</Badge>;
  return <Badge tone="info">In {days} days</Badge>;
}

export default async function PortalAppointmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
  if (!student) return null;

  const { data: applications } = await supabase
    .from("applications")
    .select(
      "id, university:universities(name), visa_record:visa_records(biometric_appointment, interview_appointment, medical_appointment)"
    )
    .eq("student_id", student.id);

  type Appointment = { applicationId: string; universityName: string; type: string; date: string };
  const appointments: Appointment[] = [];
  for (const app of applications ?? []) {
    const visa = one(app.visa_record);
    const universityName = one(app.university)?.name ?? "Application";
    if (visa?.interview_appointment) appointments.push({ applicationId: app.id, universityName, type: "Visa interview", date: visa.interview_appointment });
    if (visa?.biometric_appointment) appointments.push({ applicationId: app.id, universityName, type: "Biometric appointment", date: visa.biometric_appointment });
    if (visa?.medical_appointment) appointments.push({ applicationId: app.id, universityName, type: "Medical exam", date: visa.medical_appointment });
  }
  appointments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Appointments</h2>
      <p className="mb-4 text-sm text-muted">Upcoming visa biometric, interview, and medical exam appointments.</p>

      <Card>
        <div className="flex flex-col divide-y divide-border">
          {appointments.map((a, i) => (
            <div key={i} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="text-ink">
                  {a.type} · {a.universityName}
                </p>
                <p className="text-xs text-muted">{new Date(a.date).toLocaleString()}</p>
              </div>
              <CountdownBadge dateStr={a.date} />
            </div>
          ))}
          {appointments.length === 0 && (
            <div className="py-4">
              <EmptyState>No appointments scheduled yet.</EmptyState>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

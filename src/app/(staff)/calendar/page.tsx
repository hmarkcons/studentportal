import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CalendarTaskRow } from "./CalendarTaskRow";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

type Event = { date: string; type: string; label: string; tone: "warning" | "danger" | "info"; taskId?: string; priority?: string };

function groupByDay(events: Event[]) {
  const groups = new Map<string, Event[]>();
  for (const e of events) {
    const day = e.date.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), e]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default async function CalendarPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: tasks } = await supabase
    .from("application_tasks")
    .select("id, description, due_date, priority, application:applications(student:leads(full_name))")
    .eq("status", "pending")
    .not("due_date", "is", null)
    .order("due_date");

  const { data: reminders } = await supabase
    .from("reminders")
    .select("id, type, due_date, student:leads(full_name)")
    .eq("resolved", false)
    .not("due_date", "is", null)
    .order("due_date");

  const { data: visaRecords } = await supabase
    .from("visa_records")
    .select("biometric_appointment, interview_appointment, medical_appointment, application:applications(student:leads(full_name))");

  const { data: programDeadlines } = await supabase
    .from("applications")
    .select("id, intake, program:programs(name, application_deadline), student:leads(full_name)")
    .not("program_id", "is", null);

  const events: Event[] = [];

  (tasks ?? []).forEach((t) => {
    events.push({
      date: t.due_date!,
      type: "Task",
      label: `${t.description} — ${one(one(t.application)?.student)?.full_name ?? "?"}`,
      tone: t.due_date! < today ? "danger" : "warning",
      taskId: t.id,
      priority: t.priority,
    });
  });

  (reminders ?? []).forEach((r) => {
    events.push({
      date: r.due_date!,
      type: r.type.replace(/_/g, " "),
      label: `${one(r.student)?.full_name ?? "?"}`,
      tone: r.due_date! < today ? "danger" : "info",
    });
  });

  (visaRecords ?? []).forEach((v) => {
    const name = one(one(v.application)?.student)?.full_name ?? "?";
    if (v.biometric_appointment) events.push({ date: v.biometric_appointment, type: "Biometric appointment", label: name, tone: "info" });
    if (v.interview_appointment) events.push({ date: v.interview_appointment, type: "Visa interview", label: name, tone: "info" });
    if (v.medical_appointment) events.push({ date: v.medical_appointment, type: "Medical exam", label: name, tone: "info" });
  });

  (programDeadlines ?? []).forEach((a) => {
    const deadline = one(a.program)?.application_deadline;
    if (deadline) {
      events.push({
        date: deadline,
        type: "Application deadline",
        label: `${one(a.program)?.name} — ${one(a.student)?.full_name ?? "?"}`,
        tone: deadline < today ? "danger" : "warning",
      });
    }
  });

  events.sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = events.filter((e) => e.date >= today);
  const overdue = events.filter((e) => e.date < today);

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Calendar</h2>
      <p className="mb-6 text-sm text-muted">Intake/application deadlines, visa appointments, tasks, and reminders across your students.</p>

      {overdue.length > 0 && (
        <Card className="mb-6 border-danger/40">
          <h3 className="mb-3 text-sm font-medium text-danger">Overdue ({overdue.length})</h3>
          <div className="flex flex-col divide-y divide-border">
            {overdue.map((e, i) =>
              e.taskId ? (
                <div key={i} className="py-2">
                  <CalendarTaskRow taskId={e.taskId} label={e.label} priority={e.priority ?? "medium"} tone={e.tone} />
                </div>
              ) : (
                <div key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">
                    {e.label} <span className="text-muted">· {e.type}</span>
                  </span>
                  <span className="text-xs text-muted">{new Date(e.date).toLocaleDateString()}</span>
                </div>
              )
            )}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Upcoming</h3>
        <div className="flex flex-col divide-y divide-border">
          {groupByDay(upcoming).map(([day, dayEvents]) => (
            <div key={day} className="py-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                {new Date(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </p>
              <div className="flex flex-col gap-1.5">
                {dayEvents.map((e, i) =>
                  e.taskId ? (
                    <CalendarTaskRow key={i} taskId={e.taskId} label={e.label} priority={e.priority ?? "medium"} tone={e.tone} />
                  ) : (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-ink">{e.label}</span>
                      <Badge tone={e.tone}>{e.type}</Badge>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
          {upcoming.length === 0 && <p className="py-4 text-sm text-muted">Nothing scheduled.</p>}
        </div>
      </Card>
    </div>
  );
}

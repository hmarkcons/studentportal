import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { NewTicketForm } from "./NewTicketForm";

const FAQS = [
  { q: "How do I upload a document?", a: "Open the application card on your dashboard and use the Upload button next to the document." },
  { q: "When does my portal activate?", a: "As soon as your signed agreement is uploaded by the HMARK team." },
  { q: "How do I reschedule an appointment?", a: "Contact your counselor via Messages, phone, or by visiting the office — there's no self-service reschedule yet." },
];

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
  if (!student) return null;

  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id, subject, status, created_at")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Support</h2>

      <Card className="mb-6">
        <a
          href="https://wa.me/923000000000"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink"
        >
          💬 WhatsApp HMARK Consultants
        </a>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">FAQ</h3>
        <div className="flex flex-col gap-3">
          {FAQS.map((f) => (
            <div key={f.q}>
              <p className="text-sm font-medium text-ink">{f.q}</p>
              <p className="text-sm text-muted">{f.a}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Submit a ticket</h3>
        <NewTicketForm studentId={student.id} />
      </Card>

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(tickets ?? []).map((t) => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-ink">{t.subject}</span>
            <Badge tone={t.status === "resolved" ? "success" : "warning"}>{t.status.replace("_", " ")}</Badge>
          </div>
        ))}
        {(!tickets || tickets.length === 0) && <p className="px-4 py-6 text-sm text-muted">No tickets submitted.</p>}
      </div>
    </div>
  );
}

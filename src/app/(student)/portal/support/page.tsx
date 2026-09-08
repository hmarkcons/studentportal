import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewTicketForm } from "./NewTicketForm";
import { WHATSAPP_LINK, WHATSAPP_DISPLAY } from "@/lib/constants";
import { loadTicketActivity, loadTicketReadMarkers, hasUnseenStaffReply } from "@/lib/supportSignals";

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

  const ticketIds = (tickets ?? []).map((t) => t.id);
  const activity = await loadTicketActivity(supabase, ticketIds);
  const markers = await loadTicketReadMarkers(supabase, ticketIds, "student");

  // Maintained in Setup > Support FAQ. Only published entries reach a student,
  // so staff can leave a half-written answer in place.
  const { data: faqs } = await supabase
    .from("support_faqs")
    .select("id, question, answer")
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Support</h2>

      <Card className="mb-6">
        <a
          href={WHATSAPP_LINK}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink"
        >
          💬 WhatsApp HMARK Consultants
        </a>
        {/* Shown as well as linked: a student on a desktop browser has no
            WhatsApp to hand off to, and may want to save the number. */}
        <p className="mt-2 text-xs text-muted">{WHATSAPP_DISPLAY}</p>
      </Card>

      {/* Hidden entirely when nothing is published, rather than showing an
          empty "FAQ" heading. */}
      {(faqs ?? []).length > 0 && (
        <Card className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-ink">FAQ</h3>
          <div className="flex flex-col gap-3">
            {(faqs ?? []).map((f) => (
              <div key={f.id}>
                <p className="text-sm font-medium text-ink">{f.question}</p>
                <p className="whitespace-pre-wrap text-sm text-muted">{f.answer}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Submit a ticket</h3>
        <NewTicketForm studentId={student.id} />
      </Card>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="flex flex-col divide-y divide-border">
          {(tickets ?? []).map((t) => (
            <Link key={t.id} href={`/portal/support/${t.id}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-bg">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-ink">{t.subject}</span>
                {/* A reply the student has not opened yet — the whole reason
                    they would come back to this page. */}
                {hasUnseenStaffReply(t.id, activity, markers) && (
                  <span className="shrink-0 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    New reply
                  </span>
                )}
              </span>
              <Badge tone={t.status === "resolved" ? "success" : t.status === "in_progress" ? "info" : "warning"}>
                {t.status.replace("_", " ")}
              </Badge>
            </Link>
          ))}
          {(!tickets || tickets.length === 0) && (
            <div className="px-4 py-6">
              <EmptyState>No tickets submitted.</EmptyState>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

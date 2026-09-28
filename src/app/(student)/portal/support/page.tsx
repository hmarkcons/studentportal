import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { NewTicketForm } from "./NewTicketForm";
import { WHATSAPP_LINK, WHATSAPP_DISPLAY } from "@/lib/constants";
import { loadTicketActivity, loadTicketReadMarkers, hasUnseenStaffReply } from "@/lib/supportSignals";
import { formatStamp } from "@/lib/activityStamp";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { PortalStat, PortalStats } from "@/components/studentPortal/PortalStat";
import { PortalEmpty } from "@/components/studentPortal/PortalEmpty";

function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2.5 text-base font-semibold text-ink">
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-base">
        {icon}
      </span>
      {children}
    </h3>
  );
}

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
  if (!student) return null;

  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id, subject, status, created_at, updated_at")
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

  const open = (tickets ?? []).filter((t) => t.status !== "resolved").length;
  const resolved = (tickets ?? []).length - open;
  const newReplies = ticketIds.filter((id) => hasUnseenStaffReply(id, activity, markers)).length;

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <PortalPageHeader
        icon="🎧"
        title="Support"
        description="Stuck on something? Raise a ticket and HMARK Support will answer here — or reach us straight away on WhatsApp."
      >
        {(tickets ?? []).length > 0 && (
          <PortalStats className="xl:grid-cols-3">
            <PortalStat icon="📨" value={open} label={`open ticket${open === 1 ? "" : "s"}`} tone={open > 0 ? "info" : "default"} />
            <PortalStat icon="🔔" value={newReplies} label={`new repl${newReplies === 1 ? "y" : "ies"}`} tone={newReplies > 0 ? "danger" : "default"} />
            <PortalStat icon="✅" value={resolved} label="resolved" tone="success" />
          </PortalStats>
        )}
      </PortalPageHeader>

      {/* Tickets on the left, the quick ways to get help beside them. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:order-2">
          <div className="bg-hero relative overflow-hidden rounded-2xl p-5 text-white shadow-lg shadow-primary/20" data-rise>
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/10" />
            <p className="relative text-[11px] font-semibold uppercase tracking-wider text-white/80">Fastest answer</p>
            <p className="relative mt-1 text-base font-semibold">Chat with us on WhatsApp</p>
            <a
              href={WHATSAPP_LINK}
              className="relative mt-3 inline-flex w-fit items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[var(--hero-to)] hover:bg-white/90"
            >
              💬 WhatsApp HMARK Consultants
            </a>
            {/* Shown as well as linked: a student on a desktop browser has no
                WhatsApp to hand off to, and may want to save the number. */}
            <p className="relative mt-2 text-xs text-white/85">{WHATSAPP_DISPLAY}</p>
          </div>

          {/* Hidden entirely when nothing is published, rather than showing an
              empty "FAQ" heading. */}
          {(faqs ?? []).length > 0 && (
            <Card>
              <SectionTitle icon="❓">FAQ</SectionTitle>
              <div className="flex flex-col gap-2">
                {(faqs ?? []).map((f) => (
                  <details key={f.id} className="group rounded-xl border border-border px-3 py-2 open:bg-bg/60">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-ink">
                      {f.question}
                      <span aria-hidden className="text-xs text-muted transition-transform group-open:rotate-90">
                        ›
                      </span>
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{f.answer}</p>
                  </details>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6 lg:order-1 lg:col-span-2">
          <Card>
            <SectionTitle icon="✍️">Submit a ticket</SectionTitle>
            <NewTicketForm studentId={student.id} />
          </Card>

          {/* A card with no padding of its own, so each ticket row runs edge to edge. */}
          <div data-card className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold text-ink">Your tickets</h3>
              <span className="text-xs text-muted">{(tickets ?? []).length}</span>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {(tickets ?? []).map((t) => (
                <Link
                  key={t.id}
                  href={`/portal/support/${t.id}`}
                  className="group flex items-center justify-between gap-4 px-5 py-3.5 text-sm transition-colors hover:bg-bg"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${
                        t.status === "resolved" ? "bg-success-bg" : t.status === "in_progress" ? "bg-info-bg" : "bg-warning-bg"
                      }`}
                    >
                      {t.status === "resolved" ? "✅" : t.status === "in_progress" ? "🛠️" : "📨"}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-ink">{t.subject}</span>
                        {/* A reply the student has not opened yet — the whole
                            reason they would come back to this page. */}
                        {hasUnseenStaffReply(t.id, activity, markers) && (
                          <span className="shrink-0 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                            New reply
                          </span>
                        )}
                      </span>
                      {/* This list carried no date at all, so a student could
                          not tell a ticket they raised this morning from one
                          they raised in June, nor whether anything had
                          happened since. */}
                      <span className="text-xs text-muted">
                        Raised {formatStamp(t.created_at)}
                        {t.updated_at && t.updated_at !== t.created_at && ` · last activity ${formatStamp(t.updated_at)}`}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={t.status === "resolved" ? "success" : t.status === "in_progress" ? "info" : "warning"}>
                      {t.status.replace("_", " ")}
                    </Badge>
                    <span aria-hidden className="text-xs text-muted transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </span>
                </Link>
              ))}
              {(!tickets || tickets.length === 0) && (
                <PortalEmpty icon="🎧" title="No tickets submitted.">
                  When you raise one, it appears here with every reply from HMARK Support.
                </PortalEmpty>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { MessageThread, type MessageRow } from "@/components/MessageThread";
import { MarkMessagesRead } from "@/components/MarkMessagesRead";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { loadStudentTeam } from "@/lib/studentTeam";
import { getCurrentUser } from "@/lib/auth/currentUser";

export default async function PortalMessagesPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
  if (!student) return null;

  const [{ data: messages }, team] = await Promise.all([
    supabase
      .from("messages")
      .select("id, body, channel, direction, sent_at, sent_by:staff(full_name)")
      .eq("entity_type", "student")
      .eq("entity_id", student.id)
      .neq("channel", "internal_note")
      .order("sent_at", { ascending: true })
      .returns<MessageRow[]>(),
    // Who is on the other end, so the thread is with a person, not a form.
    loadStudentTeam(supabase, student.id),
  ]);
  const counsellor = team.counsellor;

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <PortalPageHeader
        icon={MessageCircle}
        title="Messages"
        description="Anything you send here reaches your counsellor in the CRM. Internal staff notes are never shown here."
        aside={
          counsellor ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2" data-message-counsellor>
              {counsellor.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, sized here
                <img src={counsellor.photoUrl} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/20" />
              ) : (
                <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold bg-[var(--brand-soft)] text-[var(--brand-strong)]">
                  {counsellor.full_name
                    .split(/\s+/)
                    .map((w) => w[0]?.toUpperCase() ?? "")
                    .slice(0, 2)
                    .join("")}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-primary">You are talking to</span>
                <span className="block truncate text-sm font-semibold text-ink">{counsellor.full_name}</span>
                {counsellor.designation && <span className="block truncate text-xs text-muted">{counsellor.designation}</span>}
              </span>
            </div>
          ) : undefined
        }
      />
      {/* Opening the page is what clears the badge in the menu. */}
      <MarkMessagesRead studentId={student.id} side="student" />
      <Card>
        <MessageThread
          messages={messages ?? []}
          entityType="student"
          entityId={student.id}
          channel="inapp"
          revalidateTo="/portal/messages"
          placeholder="Message your counsellor…"
          ownDirection="inbound"
          counterpartName="Your counsellor"
        />
      </Card>
    </div>
  );
}

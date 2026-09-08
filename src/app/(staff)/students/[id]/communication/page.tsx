import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { MessageThread, type MessageRow } from "@/components/MessageThread";
import { MarkMessagesRead } from "@/components/MarkMessagesRead";

export default async function StudentCommunicationTab(props: PageProps<"/students/[id]/communication">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, body, channel, direction, sent_at, sent_by:staff(full_name)")
    .eq("entity_type", "student")
    .eq("entity_id", id)
    .order("sent_at", { ascending: true })
    .returns<MessageRow[]>();

  const { data: messageTemplates } = await supabase.from("message_templates").select("id, purpose, channel, body").order("purpose");
  const { data: student } = await supabase.from("students").select("full_name").eq("id", id).maybeSingle();

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* Opening the thread is what clears the badge for the team. */}
      <MarkMessagesRead studentId={id} side="staff" />
      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Message student</h3>
        <p className="mb-3 text-xs text-muted">
          Visible to the student in their portal. Real email/SMS/WhatsApp sending needs a gateway integration —
          this sends as an in-app portal message for now.
        </p>
        <MessageThread
          messages={(messages ?? []).filter((m) => m.channel !== "internal_note")}
          entityType="student"
          entityId={id}
          channel="inapp"
          revalidateTo={`/students/${id}/communication`}
          placeholder="Message to the student…"
          templates={messageTemplates ?? []}
          ownDirection="outbound"
          counterpartName={student?.full_name ?? "Student"}
        />
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Internal notes</h3>
        <p className="mb-3 text-xs text-muted">Staff-only — never visible to the student.</p>
        <MessageThread
          messages={(messages ?? []).filter((m) => m.channel === "internal_note")}
          entityType="student"
          entityId={id}
          channel="internal_note"
          revalidateTo={`/students/${id}/communication`}
          ownDirection="outbound"
          counterpartName={student?.full_name ?? "Student"}
        />
      </Card>
    </div>
  );
}

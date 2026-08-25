import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { MessageThread, type MessageRow } from "@/components/MessageThread";

export default async function PortalMessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
  if (!student) return null;

  const { data: messages } = await supabase
    .from("messages")
    .select("id, body, channel, direction, sent_at, sent_by:staff(full_name)")
    .eq("entity_type", "student")
    .eq("entity_id", student.id)
    .neq("channel", "internal_note")
    .order("sent_at", { ascending: true })
    .returns<MessageRow[]>();

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Messages</h2>
      <Card>
        <MessageThread
          messages={messages ?? []}
          entityType="student"
          entityId={student.id}
          channel="inapp"
          revalidateTo="/portal/messages"
          placeholder="Message your counselor…"
        />
      </Card>
    </div>
  );
}

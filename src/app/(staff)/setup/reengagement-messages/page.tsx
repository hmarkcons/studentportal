import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { ReengagementMessagesForm, type ReengagementRow } from "./ReengagementMessagesForm";

export const dynamic = "force-dynamic";

export default async function ReengagementMessagesPage() {
  const supabase = await createClient();
  const canEdit = await hasPermission("settings.reengagement_messages");

  const { data } = await supabase
    .from("reengagement_messages")
    .select("ghost_subject, ghost_body, withdrawn_subject, withdrawn_body")
    .eq("id", true)
    .maybeSingle();

  // Seeded by 0188, so this only covers a database where the row was deleted.
  // Blank rather than invented wording: the student's page then says there is
  // nothing saved instead of offering an empty message to send to someone.
  const initial: ReengagementRow =
    data ?? { ghost_subject: "", ghost_body: "", withdrawn_subject: "", withdrawn_body: "" };

  return (
    <div className="w-full max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Re-engagement messages</h2>
      <p className="mb-5 text-sm text-muted">
        What a student is sent when they go quiet or withdraw. Neither is ever sent automatically — a counsellor opens
        the draft on the student&rsquo;s dashboard, reads it, and sends it. Writing them here means the wording is the
        office&rsquo;s rather than whatever whoever is chasing happens to type at the time.
      </p>
      <ReengagementMessagesForm initial={initial} canEdit={canEdit} />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { VisaMessagesForm, type VisaMessageRow } from "./VisaMessagesForm";

export const dynamic = "force-dynamic";

export default async function VisaMessagesPage() {
  const supabase = await createClient();
  const canEdit = await hasPermission("settings.visa_messages");

  const { data } = await supabase
    .from("visa_messages")
    .select("approved_heading, approved_body, approved_signoff, refused_heading, refused_body, refused_signoff")
    .eq("id", true)
    .maybeSingle();

  // The row is seeded by 0177 and cannot be blank, so this only covers a
  // database where somebody deleted it — the portal falls back to the same
  // built-in copy, so an empty form here would be misleading rather than safe.
  const initial: VisaMessageRow = data ?? {
    approved_heading: "",
    approved_body: "",
    approved_signoff: "",
    refused_heading: "",
    refused_body: "",
    refused_signoff: "",
  };

  return (
    <div className="w-full max-w-5xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Visa messages</h2>
      <p className="mb-5 max-w-3xl text-sm text-muted">
        What a student reads on their Visa tab when the decision comes through. These are the only words in the portal
        that carry real news, and each student reads them once — so they are worth getting right, and worth changing
        when they do not land.
      </p>
      <VisaMessagesForm initial={initial} canEdit={canEdit} />
    </div>
  );
}

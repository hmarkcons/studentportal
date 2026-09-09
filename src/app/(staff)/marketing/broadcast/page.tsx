import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { BroadcastForm } from "./BroadcastForm";

export default async function BroadcastPage() {
  const { supabase, staff } = await getStaffSession();
  if (!staff) redirect("/");
  // Sending the same message to every student is not ordinary work, and this
  // page had no check at all. Messaging one student from their own page is
  // unaffected.
  if (!(await hasPermission("messages.broadcast"))) redirect("/dashboard");
  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");
  const { data: templates } = await supabase.from("message_templates").select("id, purpose, channel, body").order("purpose");

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Broadcast Message</h2>
      <p className="mb-4 text-sm text-muted">
        Send the same in-app portal message to multiple students at once. Only students visible to your role are
        listed.
      </p>
      <Card>
        <BroadcastForm students={students ?? []} templates={templates ?? []} />
      </Card>
    </div>
  );
}

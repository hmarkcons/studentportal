import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { BroadcastForm } from "./BroadcastForm";

export default async function BroadcastPage() {
  const supabase = await createClient();
  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");
  const { data: templates } = await supabase.from("message_templates").select("id, purpose, channel, body").order("purpose");

  return (
    <div className="mx-auto max-w-2xl">
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

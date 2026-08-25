import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NewLeadForm } from "./NewLeadForm";

export default async function NewLeadPage() {
  const supabase = await createClient();
  const { data: counselors } = await supabase.from("staff").select("id, full_name").order("full_name");

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="mb-4 text-lg font-semibold text-ink">New lead</h2>
      <Card>
        <NewLeadForm counselors={counselors ?? []} />
      </Card>
    </div>
  );
}

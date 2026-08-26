import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NewLeadForm } from "./NewLeadForm";

export default async function NewLeadPage() {
  const supabase = await createClient();
  const { data: counselors } = await supabase.from("staff").select("id, full_name").order("full_name");
  const { data: destinations } = await supabase.from("destinations").select("id, display_name").order("display_name");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">New lead</h2>
      <Card>
        <NewLeadForm counselors={counselors ?? []} destinations={destinations ?? []} />
      </Card>
    </div>
  );
}

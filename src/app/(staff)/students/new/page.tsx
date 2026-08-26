import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { RegisterStudentForm } from "./RegisterStudentForm";

export default async function NewRegisteredStudentPage() {
  const supabase = await createClient();
  const { data: counselors } = await supabase.from("staff").select("id, full_name").order("full_name");
  const { data: destinations } = await supabase.from("destinations").select("id, display_name").order("display_name");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Register student manually</h2>
      <Card>
        <RegisterStudentForm counselors={counselors ?? []} destinations={destinations ?? []} />
      </Card>
    </div>
  );
}

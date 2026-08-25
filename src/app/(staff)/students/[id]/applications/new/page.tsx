import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NewApplicationForm } from "./NewApplicationForm";

export default async function NewApplicationPage(props: PageProps<"/students/[id]/applications/new">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: universities } = await supabase.from("universities").select("id, name").eq("status", "active").order("name");
  const { data: programs } = await supabase.from("programs").select("id, university_id, name").order("name");

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="mb-4 text-lg font-semibold text-ink">New application</h2>
      <Card>
        <NewApplicationForm studentId={id} universities={universities ?? []} programs={programs ?? []} />
      </Card>
    </div>
  );
}

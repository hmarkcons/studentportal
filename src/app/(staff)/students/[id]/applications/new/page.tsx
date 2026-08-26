import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NewApplicationForm } from "./NewApplicationForm";

export default async function NewApplicationPage(props: PageProps<"/students/[id]/applications/new">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: leadDestinations } = await supabase.from("lead_destinations").select("destination_id").eq("lead_id", id);
  const registeredDestinationIds = (leadDestinations ?? []).map((d) => d.destination_id);

  let destinationsQuery = supabase.from("destinations").select("id, display_name").order("display_name");
  if (registeredDestinationIds.length > 0) destinationsQuery = destinationsQuery.in("id", registeredDestinationIds);
  const { data: destinations } = await destinationsQuery;

  let universitiesQuery = supabase.from("universities").select("id, name, destination_id").eq("status", "active").order("name");
  if (registeredDestinationIds.length > 0) universitiesQuery = universitiesQuery.in("destination_id", registeredDestinationIds);
  const { data: universities } = await universitiesQuery;

  const { data: programs } = await supabase.from("programs").select("id, university_id, name").order("name");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">New application</h2>
      <Card>
        <NewApplicationForm
          studentId={id}
          destinations={destinations ?? []}
          universities={universities ?? []}
          programs={programs ?? []}
        />
      </Card>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NewApplicationForm } from "./NewApplicationForm";
import { getCachedActiveUniversities, getCachedDestinations } from "@/lib/cachedQueries";

export default async function NewApplicationPage(props: PageProps<"/students/[id]/applications/new">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const [{ data: leadDestinations }, { data: programs }, allDestinations, allUniversities] = await Promise.all([
    supabase.from("lead_destinations").select("destination_id").eq("lead_id", id),
    supabase.from("programs").select("id, university_id, name").order("name"),
    getCachedDestinations(),
    getCachedActiveUniversities(),
  ]);

  const registeredDestinationIds = (leadDestinations ?? []).map((d) => d.destination_id);
  const destinations =
    registeredDestinationIds.length > 0 ? allDestinations.filter((d) => registeredDestinationIds.includes(d.id)) : allDestinations;
  const universities =
    registeredDestinationIds.length > 0
      ? allUniversities.filter((u) => registeredDestinationIds.includes(u.destination_id))
      : allUniversities;

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">New application</h2>
      <Card>
        <NewApplicationForm studentId={id} destinations={destinations} universities={universities} programs={programs ?? []} />
      </Card>
    </div>
  );
}

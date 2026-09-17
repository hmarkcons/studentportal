import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NewApplicationForm } from "./NewApplicationForm";
import { getCachedActiveUniversities, getCachedDestinations } from "@/lib/cachedQueries";
import { karachiToday } from "@/lib/calendarDates";
import type { ProgramRound } from "@/lib/programRounds";

/** PostgREST returns at most 1,000 rows per request unless a range is given. */
const PAGE = 1000;

export default async function NewApplicationPage(props: PageProps<"/students/[id]/applications/new">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const [{ data: leadDestinations }, allDestinations, allUniversities] = await Promise.all([
    supabase.from("lead_destinations").select("destination_id").eq("lead_id", id),
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

  // Programmes for the universities this form can actually offer, fetched in
  // pages.
  //
  // This query used to be an unbounded `select(...).order("name")` over the
  // whole table, which PostgREST silently truncates at 1,000 rows. With 1,957
  // programmes that made 957 of them — everything sorting after "International
  // Trade Relations" — impossible to pick, and left four universities with no
  // selectable programme at all. Narrowing to the relevant universities is the
  // real fix; the paging is so that a destination growing past a thousand
  // programmes cannot bring the bug back silently.
  //
  // The catalogue dates come along so the form can show them beside the
  // Deadline box a staff member is about to fill in by hand — every intake
  // round, since which round is still open is the thing being judged.
  const universityIds = universities.map((u) => u.id);
  const programs: { id: string; university_id: string; name: string; rounds: ProgramRound[] }[] = [];
  if (universityIds.length > 0) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("programs")
        .select("id, university_id, name, rounds:program_intake_rounds(id, label, start_date, application_deadline, sort_order)")
        .in("university_id", universityIds)
        .order("name")
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      programs.push(...data);
      if (data.length < PAGE) break;
    }
  }

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">New application</h2>
      <Card>
        <NewApplicationForm
          studentId={id}
          destinations={destinations}
          universities={universities}
          programs={programs}
          today={karachiToday()}
        />
      </Card>
    </div>
  );
}

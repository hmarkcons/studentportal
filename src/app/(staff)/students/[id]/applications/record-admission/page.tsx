import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { getCachedActiveUniversities, getCachedDestinations } from "@/lib/cachedQueries";
import { readAllIn } from "@/lib/catalogueReads";
import { canSetService, serviceOf } from "@/lib/serviceType";
import { Card } from "@/components/ui/Card";
import { RecordAdmissionForm } from "./RecordAdmissionForm";

/**
 * Recording the admission a visa-only client (0279) already holds: the
 * university and programme it is for, and the letter itself. Saving puts the
 * application where it counts as admitted, finalizes it for the visa and
 * marks the admission stages done (recordExistingAdmission).
 */
export default async function RecordAdmissionPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, staff } = await getStaffSession();

  const [{ data: lead }, { data: leadDestinations }, allDestinations, allUniversities] = await Promise.all([
    supabase.from("leads").select("service_type, intake").eq("id", id).maybeSingle(),
    supabase.from("lead_destinations").select("destination_id, is_backup").eq("lead_id", id),
    getCachedDestinations(),
    getCachedActiveUniversities(),
  ]);

  const back = (
    <Link href={`/students/${id}/applications`} className="text-sm text-primary hover:underline">
      ← Back to applications
    </Link>
  );
  if (!canSetService(staff)) {
    return (
      <Card className="max-w-xl">
        <p className="text-sm text-ink">Only a Super Admin or the processing team can record an admission.</p>
        <div className="mt-3">{back}</div>
      </Card>
    );
  }
  if (serviceOf(lead?.service_type) !== "visa_only") {
    return (
      <Card className="max-w-xl">
        <p className="text-sm text-ink">This student is registered for the full service, so their admission is applied for as usual.</p>
        <p className="mt-1 text-sm text-muted">To record one they already hold, set them to the visa service only on their Registration card first.</p>
        <div className="mt-3">{back}</div>
      </Card>
    );
  }

  const destinationIds = (leadDestinations ?? []).map((d) => d.destination_id as string);
  const destinations = allDestinations
    .filter((d) => destinationIds.includes(d.id))
    .map((d) => ({ id: d.id, name: d.display_name }));
  const universities = allUniversities
    .filter((u) => destinationIds.includes(u.destination_id))
    .map((u) => ({ id: u.id, name: u.name, destinationId: u.destination_id }));
  const programs = await readAllIn<{ id: string; university_id: string; name: string; level: string }>(
    universities.map((u) => u.id),
    (chunk, from, to) => supabase.from("programs").select("id, university_id, name, level").in("university_id", chunk).order("name").order("id").range(from, to)
  );

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {back}
      <Card>
        <h2 className="text-base font-semibold text-ink">Record their admission</h2>
        <p className="mt-1 text-sm text-muted">
          For a client who already has an admission letter and wants the visa service only. Choose the university and programme it
          is for and attach the letter; the admission stages are marked done and the visa documentation starts from here.
        </p>
        {destinations.length === 0 ? (
          <p className="mt-3 text-sm text-danger">Add the country they are going to on their Registration card first.</p>
        ) : (
          <RecordAdmissionForm studentId={id} destinations={destinations} universities={universities} programs={programs} defaultIntake={lead?.intake ?? ""} />
        )}
      </Card>
    </div>
  );
}

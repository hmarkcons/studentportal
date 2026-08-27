import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CountryTrackerForm } from "@/components/CountryTrackerForm";
import { listTrackerDefinitions } from "@/lib/actions/countryTracker";
import { ScholarshipSection } from "./ScholarshipSection";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function CountryTrackerPage(props: PageProps<"/students/[id]/applications/[appId]/tracker">) {
  const { id, appId } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const canAccess = staffRow?.role === "processing" || staffRow?.role === "super_admin";

  const { data: app, error } = await supabase
    .from("applications")
    .select("id, preenrollment_finalized, university:universities(name, destination:destinations(country_code, display_name))")
    .eq("id", appId)
    .eq("student_id", id)
    .maybeSingle();

  if (error || !app) notFound();

  const university = one(app.university);
  const destination = university ? one(university.destination as never) : null;
  const countryCode = (destination as { country_code?: string } | null)?.country_code;
  const fields = countryCode ? (await listTrackerDefinitions([countryCode]))[countryCode] : undefined;

  const revalidateTo = `/students/${id}/applications/${appId}/tracker`;

  if (!canAccess) {
    return (
      <div className="w-full">
        <p className="text-sm text-muted">
          The country documentation tracker is visible only to the Documentation/Processing Officer role and Super Admin.
        </p>
      </div>
    );
  }

  const { data: extras } = await supabase.from("application_country_extra").select("field_key, field_value").eq("application_id", appId);
  const values: Record<string, string> = {};
  (extras ?? []).forEach((e) => (values[e.field_key] = e.field_value ?? ""));

  const isItaly = countryCode === "IT";
  const { data: bodies } = isItaly ? await supabase.from("scholarship_bodies").select("id, name, region, covers") : { data: [] };
  const { data: scholarships } = isItaly
    ? await supabase.from("student_scholarships").select("id, name, status, award_amount").eq("application_id", appId)
    : { data: [] };

  const regionByUniversityValue: Record<string, string> = {};

  const { data: studentApps } = await supabase
    .from("applications")
    .select("id, university:universities(name, destination:destinations(country_code))")
    .eq("student_id", id);

  const universityOptions = (studentApps ?? [])
    .filter((a) => {
      const uni = one(a.university as never) as { destination?: unknown } | null;
      const dest = uni?.destination ? (one(uni.destination as never) as { country_code?: string } | null) : null;
      return dest?.country_code === countryCode;
    })
    .map((a) => {
      const uni = one(a.university as never) as { name?: string } | null;
      return { value: a.id, label: uni?.name ?? "University" };
    });

  if (isItaly) {
    for (const opt of universityOptions) {
      const match = (bodies ?? []).find((b) => (b.covers ?? []).includes(opt.label));
      if (match?.region) regionByUniversityValue[opt.value] = match.region;
    }
  }

  return (
    <div className="w-full">
      <Link href={`/students/${id}/applications/${appId}`} className="text-sm text-muted hover:text-ink">
        &larr; Back to application
      </Link>
      <h2 className="mt-2 mb-6 text-xl font-semibold text-ink">
        {(destination as { display_name?: string } | null)?.display_name ?? "Country"} Documentation Tracker
      </h2>

      {!fields ? (
        <Card>
          <p className="text-sm text-muted">No documentation tracker is configured for this destination yet.</p>
        </Card>
      ) : (
        <Card className="mb-6">
          <CountryTrackerForm
            applicationId={appId}
            fields={fields}
            values={values}
            revalidateTo={revalidateTo}
            universityOptions={universityOptions}
            regionByUniversityValue={regionByUniversityValue}
          />
        </Card>
      )}

      {isItaly && (
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Scholarship</h3>
          <ScholarshipSection
            studentId={id}
            applicationId={appId}
            revalidateTo={revalidateTo}
            bodies={bodies ?? []}
            scholarships={scholarships ?? []}
            preenrollmentFinalized={app.preenrollment_finalized}
            isSuperAdmin={staffRow?.role === "super_admin"}
          />
        </Card>
      )}
    </div>
  );
}

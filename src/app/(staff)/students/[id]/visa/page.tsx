import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { VisaForm } from "../applications/[appId]/VisaForm";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentVisaTab(props: PageProps<"/students/[id]/visa">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: applications } = await supabase
    .from("applications")
    .select("id, university:universities(name, destination:destinations(display_name))")
    .eq("student_id", id);

  const appIds = (applications ?? []).map((a) => a.id);
  const { data: visas } = appIds.length
    ? await supabase.from("visa_records").select("*").in("application_id", appIds)
    : { data: [] };

  if (!applications || applications.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">No applications yet — visa tracking appears once an application is added.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {applications.map((a) => {
        const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
        const dest = uni?.destination ? (one(uni.destination as never) as { display_name?: string } | null) : null;
        const visa = (visas ?? []).find((v) => v.application_id === a.id) ?? null;
        return (
          <Card key={a.id}>
            <h3 className="mb-3 text-sm font-medium text-ink">
              {uni?.name ?? "University"} {dest?.display_name && `· ${dest.display_name}`}
            </h3>
            <VisaForm applicationId={a.id} studentId={id} visa={visa} />
          </Card>
        );
      })}
    </div>
  );
}

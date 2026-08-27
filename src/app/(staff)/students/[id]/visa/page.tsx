import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { VisaForm } from "../applications/[appId]/VisaForm";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentVisaTab(props: PageProps<"/students/[id]/visa">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: applications } = await supabase
    .from("applications")
    .select("id, is_finalized, university:universities(name, destination:destinations(display_name))")
    .eq("student_id", id);

  if (!applications || applications.length === 0) {
    return (
      <Card>
        <EmptyState>No applications yet — visa tracking appears once an application is added.</EmptyState>
      </Card>
    );
  }

  const finalized = applications.find((a) => a.is_finalized);

  if (!finalized) {
    return (
      <Card>
        <EmptyState>
          No university has been finalized for visa yet. Go to the{" "}
          <Link href={`/students/${id}/applications`} className="text-primary hover:underline">
            Applications tab
          </Link>{" "}
          and click &quot;Finalize for visa&quot; on the university the student is actually pursuing a visa for.
        </EmptyState>
      </Card>
    );
  }

  const { data: visa } = await supabase.from("visa_records").select("*").eq("application_id", finalized.id).maybeSingle();

  const uni = one(finalized.university as never) as { name?: string; destination?: unknown } | null;
  const dest = uni?.destination ? (one(uni.destination as never) as { display_name?: string } | null) : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">
          {uni?.name ?? "University"} {dest?.display_name && `· ${dest.display_name}`}
        </h3>
        <VisaForm applicationId={finalized.id} studentId={id} visa={visa} />
      </Card>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { AddProgramForm } from "./AddProgramForm";

export default async function UniversityDetailPage(props: PageProps<"/setup/universities/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: university, error } = await supabase
    .from("universities")
    .select("id, name, type, status, destination:destinations(display_name)")
    .eq("id", id)
    .maybeSingle();

  if (error || !university) notFound();

  const { data: programs } = await supabase
    .from("programs")
    .select("id, level, name, core_field, sub_field, tuition_fee")
    .eq("university_id", id)
    .order("level");

  function one<T>(v: T | T[] | null) {
    return Array.isArray(v) ? v[0] ?? null : v;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/setup/universities" className="text-sm text-muted hover:text-ink">
        &larr; Back to universities
      </Link>
      <h2 className="mt-2 mb-1 text-xl font-semibold text-ink">{university.name}</h2>
      <p className="mb-6 text-sm text-muted">
        {one(university.destination)?.display_name} · {university.type}
      </p>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Programs</h3>
        <div className="mb-4 flex flex-col divide-y divide-border">
          {(programs ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">
                {p.level} · {p.name}
                {p.core_field && <span className="text-muted"> · {p.core_field}</span>}
              </span>
              {p.tuition_fee != null && <span className="text-muted">{p.tuition_fee}</span>}
            </div>
          ))}
          {(!programs || programs.length === 0) && <p className="py-2 text-sm text-muted">No programs added yet.</p>}
        </div>
        <AddProgramForm universityId={id} />
      </Card>
    </div>
  );
}

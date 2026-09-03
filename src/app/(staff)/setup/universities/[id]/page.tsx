import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddProgramForm } from "./AddProgramForm";
import { ImportProgramsForm } from "./ImportProgramsForm";
import { UniversityEditForm } from "./UniversityEditForm";
import { ProgramRow } from "./ProgramRow";

export default async function UniversityDetailPage(props: PageProps<"/setup/universities/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const isSuperAdmin = staffRow?.role === "super_admin";
  const canManageRates = await hasPermission("finance.program_rates.manage");
  const canViewRates = canManageRates || staffRow?.role === "management" || staffRow?.role === "finance";

  const { data: university, error } = await supabase
    .from("universities")
    .select("id, name, city, region, type, status, destination:destinations(display_name)")
    .eq("id", id)
    .maybeSingle();

  if (error || !university) notFound();

  const { data: programsRaw } = await supabase
    .from("programs")
    .select(
      "id, level, name, core_field, sub_field, tuition_fee, duration, language_requirement, application_deadline, commission_rate:program_commission_rates(rate_percent, fixed_amount, currency)"
    )
    .eq("university_id", id)
    .order("level");

  function one<T>(v: T | T[] | null) {
    return Array.isArray(v) ? v[0] ?? null : v;
  }

  const programs = (programsRaw ?? []).map((p) => ({ ...p, commission_rate: one(p.commission_rate) }));

  return (
    <div className="w-full">
      <Link href="/setup/universities" className="text-sm text-muted hover:text-ink">
        &larr; Back to universities
      </Link>
      <h2 className="mt-2 mb-1 text-xl font-semibold text-ink">{university.name}</h2>
      <p className="mb-6 text-sm text-muted">{one(university.destination)?.display_name}</p>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Details</h3>
        {isSuperAdmin ? (
          <UniversityEditForm university={university} />
        ) : (
          <p className="text-sm text-muted">
            {university.type} · {university.city ?? "—"}
            {university.region ? `, ${university.region}` : ""} · {university.status}
            <br />
            Only Super Admin can edit or delete universities.
          </p>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Programs</h3>
        <div className="mb-4 flex flex-col divide-y divide-border">
          {programs.map((p) => (
            <ProgramRow
              key={p.id}
              program={p}
              universityId={id}
              canEdit={isSuperAdmin}
              canViewRate={canViewRates}
              canManageRate={canManageRates}
            />
          ))}
          {programs.length === 0 && (
            <div className="py-2">
              <EmptyState>No programs added yet.</EmptyState>
            </div>
          )}
        </div>
        <AddProgramForm universityId={id} />
        <ImportProgramsForm universityId={id} />
      </Card>
    </div>
  );
}

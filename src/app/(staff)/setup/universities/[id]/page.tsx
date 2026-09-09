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
import { uploadedLine } from "@/lib/activityStamp";

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

  // What the university has shared with HMARK through its own portal.
  //
  // Processing and Super Admin have been able to read this table since 0016 and
  // no page ever queried it, so a university could upload a brochure or a
  // template and nobody at HMARK would ever see it — it arrived into a table
  // with no reader. Restricted to the same two roles the policy names, so the
  // card is absent rather than empty for anyone else.
  const canSeeExchange = staffRow?.role === "super_admin" || staffRow?.role === "processing";
  const { data: exchange } = canSeeExchange
    ? await supabase
        .from("partner_document_exchange")
        .select("id, file_path, description, created_at, intake_label, uploaded_by_partner, uploaded_by_staff")
        .eq("university_id", id)
        .order("created_at", { ascending: false })
    : { data: null };

  const exchangeLinks = new Map<string, string>();
  await Promise.all(
    (exchange ?? []).map(async (d) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      if (data?.signedUrl) exchangeLinks.set(d.id, data.signedUrl);
    })
  );

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

      {canSeeExchange && (
        <Card className="mt-6">
          <h3 className="mb-1 text-sm font-medium text-ink">Document exchange</h3>
          <p className="mb-3 text-xs text-muted">
            Files this university has shared with HMARK from its own portal, newest first.
          </p>
          <div className="flex flex-col divide-y divide-border">
            {(exchange ?? []).map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block text-ink">{d.description ?? "Document"}</span>
                  <span className="block text-xs text-muted">
                    {uploadedLine({
                      at: d.created_at,
                      byRole: d.uploaded_by_partner ? "partner" : d.uploaded_by_staff ? "staff" : null,
                      audience: "staff",
                    })}
                    {d.intake_label ? ` · ${d.intake_label}` : ""}
                  </span>
                </span>
                {exchangeLinks.has(d.id) && (
                  <a
                    href={exchangeLinks.get(d.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    View file
                  </a>
                )}
              </div>
            ))}
            {(!exchange || exchange.length === 0) && (
              <div className="py-2">
                <EmptyState>Nothing shared by this university yet.</EmptyState>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

import Link from "next/link";
import { loadDocumentHistory } from "@/lib/documentHistory";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { DocumentChecklist, type DocRow } from "@/components/DocumentChecklist";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";
import { loadStudentChecklistSections } from "@/lib/studentChecklistSections";
import { hasPermission } from "@/lib/auth/permissions";
import { orderCycles, cycleTabLabel, resolveCycleDocuments, type Cycle } from "@/lib/intakeCycle";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentDocumentsTab(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { id } = await props.params;
  const { cycle: cycleParam } = await props.searchParams;
  const supabase = await createClient();

  await ensureStudentDocumentRequirements(id);

  const [sections, canManage] = await Promise.all([
    loadStudentChecklistSections(supabase, id),
    hasPermission("documents.manage_requirements"),
  ]);

  const [{ data: applications }, { data: cycleRows }, { data: renewTemplates }] = await Promise.all([
    supabase.from("applications").select("id, university:universities(name)").eq("student_id", id),
    supabase.from("student_cycles").select("id, sequence, intake, is_current").eq("student_id", id).order("sequence"),
    supabase.from("document_templates").select("id").eq("renew_each_intake", true),
  ]);

  const { data: rawDocs } = await supabase
    .from("student_documents")
    .select(
      "id, category, custom_name, status, file_path, deadline, rejected_reason, application_id, uploaded_at, uploaded_by_role, verified_at, created_at, template_id, derived_key, cycle_id, template:document_templates(name)"
    )
    .eq("student_id", id)
    .order("created_at", { ascending: false })
    .returns<
      (DocRow & {
        application_id: string | null;
        custom_name: string | null;
        cycle_id: string | null;
        derived_key: string | null;
        template: { name: string } | { name: string }[] | null;
      })[]
    >();

  // One tab per intake, the current one first. A student who has only gone
  // round once — almost all of them — gets no strip and the page is unchanged.
  const cycles = orderCycles((cycleRows ?? []) as Cycle[]);
  const showCycleTabs = cycles.length > 1;
  const currentCycleId = cycles.find((c) => c.is_current)?.id ?? cycles[0]?.id ?? null;
  const activeCycleId =
    showCycleTabs && cycleParam && cycles.some((c) => c.id === cycleParam) ? cycleParam : currentCycleId;
  const activeCycle = cycles.find((c) => c.id === activeCycleId) ?? null;
  const isPreviousIntake = Boolean(activeCycle && !activeCycle.is_current);

  // Which intake's paperwork to show. Approved documents from an earlier
  // intake are inherited rather than copied, so a student re-applying does not
  // re-upload their degree — but a requirement marked to be renewed each
  // intake, and the visa and scholarship documents, are asked for again.
  const sequenceById = new Map(cycles.map((c) => [c.id, c.sequence]));
  const renewTemplateIds = new Set((renewTemplates ?? []).map((t) => t.id as string));
  const inheritedFromById = new Map<string, number | null>();
  let docs = rawDocs ?? [];
  if (showCycleTabs && activeCycleId) {
    const resolved = resolveCycleDocuments(
      docs.map((d) => ({
        id: d.id,
        cycle_id: d.cycle_id,
        category: d.category ?? null,
        template_id: d.template_id ?? null,
        derived_key: d.derived_key ?? null,
        status: d.status,
      })),
      activeCycleId,
      sequenceById,
      renewTemplateIds
    );
    const keep = new Map(resolved.map((r) => [r.doc.id, r.inheritedFrom]));
    for (const [docId, from] of keep) inheritedFromById.set(docId, from);
    docs = docs.filter((d) => keep.has(d.id));
  }

  const appLabel = new Map((applications ?? []).map((a) => [a.id, one(a.university as never) as { name?: string } | null]));

  const history = await loadDocumentHistory(supabase, docs.map((d) => d.id));

  const docsWithUrls = await Promise.all(
    docs.map(async (d) => {
      const templateName = one(d.template as never) as { name?: string } | null;
      const uni = d.application_id ? appLabel.get(d.application_id) : null;
      // Only application-specific extras carry a university suffix; the standard
      // checklist is student-level and needs no label of its own.
      const inheritedFrom = inheritedFromById.get(d.id) ?? null;
      const base = d.custom_name ?? templateName?.name ?? d.category ?? "Document";
      // Said in the name, because a document approved last year sitting in
      // this year's checklist with no explanation looks like a mistake.
      const carried = inheritedFrom ? ` — carried over from intake ${inheritedFrom}` : "";
      const name = `${base}${uni?.name ? ` — ${uni.name}` : ""}${carried}`;
      const past = history.get(d.id) ?? [];
      if (!d.file_path) return { ...d, name, history: past };
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      return { ...d, name, history: past, fileUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <>
      {/* Intake tabs, matching Applications: the upcoming intake first, the
          previous year second. */}
      {showCycleTabs && (
        <div className="mb-4 flex flex-wrap gap-2">
          {cycles.map((c) => (
            <Link
              key={c.id}
              href={`/students/${id}/documents?cycle=${c.id}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                c.id === activeCycleId ? "bg-primary text-primary-ink" : "border border-border text-muted hover:text-ink"
              }`}
            >
              {cycleTabLabel("Docs", c)}
              {!c.is_current && <span className="ml-1.5 text-xs font-normal opacity-80">previous</span>}
            </Link>
          ))}
        </div>
      )}

      {isPreviousIntake && (
        <p className="mb-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          This is a previous intake&rsquo;s paperwork, kept for reference. Anything still valid is already carried over
          into <strong className="font-medium text-ink">{cycleTabLabel("Docs", cycles[0])}</strong>.
        </p>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">All documents</h3>
        <DocumentChecklist
          docs={docsWithUrls}
          studentId={id}
          applicationId={null}
          revalidateTo={`/students/${id}/documents${showCycleTabs && activeCycleId ? `?cycle=${activeCycleId}` : ""}`}
          sections={sections}
          canManage={canManage && !isPreviousIntake}
        />
      </Card>
    </>
  );
}

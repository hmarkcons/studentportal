import Link from "next/link";
import { loadDocumentHistory } from "@/lib/documentHistory";
import { loadDocumentGuides } from "@/lib/documentGuides";
import { loadDocumentFiles } from "@/lib/documentFilesLoad";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { DocumentChecklist, type DocRow } from "@/components/DocumentChecklist";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";
import { loadStudentChecklistSections } from "@/lib/studentChecklistSections";
import { hasPermission } from "@/lib/auth/permissions";
import { orderCycles, cycleTabLabel, resolveCycleDocuments, type Cycle } from "@/lib/intakeCycle";
import { zipFileName } from "@/lib/documentZip";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentDocumentsTab(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cycle?: string; doc?: string }>;
}) {
  const { id } = await props.params;
  // doc: the document Waiting on you was opened for, picked out on the page.
  const { cycle: cycleParam, doc: focusDocId } = await props.searchParams;
  const supabase = await createClient();

  // One wave for everything but the documents themselves, which are read once
  // the checklist is up to date. These were three waves of their own.
  const [, sections, canManage, { data: applications }, { data: cycleRows }, { data: renewTemplates }, { data: student }] = await Promise.all([
    ensureStudentDocumentRequirements(id),
    loadStudentChecklistSections(supabase, id),
    hasPermission("documents.manage_requirements"),
    supabase.from("applications").select("id, university:universities(name)").eq("student_id", id),
    supabase.from("student_cycles").select("id, sequence, intake, is_current").eq("student_id", id).order("sequence"),
    supabase.from("document_templates").select("id").eq("renew_each_intake", true),
    // For the name of the "Download all" ZIP.
    supabase.from("leads").select("full_name, student_code").eq("id", id).maybeSingle(),
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

  const [history, guides, filesByDoc, { data: removalRows }] = await Promise.all([
    loadDocumentHistory(supabase, docs.map((d) => d.id)),
    // The guide the student reads for each, so staff talk them through the same words (0300).
    loadDocumentGuides(supabase, id, docs),
    // Each requirement's files, each with its link (0328).
    loadDocumentFiles(supabase, docs),
    // Requirements taken off this student's checklist, to bring back (0328).
    supabase.from("student_document_removals").select("id, name, removed_at, template_id, derived_key").eq("student_id", id).order("removed_at", { ascending: false }),
  ]);
  // One brought back some other way — restored from the audit log — is not "removed".
  const present = new Set((rawDocs ?? []).flatMap((d) => [d.template_id ? `t:${d.template_id}` : null, d.derived_key ? `d:${d.derived_key}` : null]).filter(Boolean));
  const removals = (removalRows ?? [])
    .filter((r) => !present.has(r.template_id ? `t:${r.template_id}` : `d:${r.derived_key}`))
    .map((r) => ({ id: r.id as string, name: (r.name as string | null) ?? null, removedAt: (r.removed_at as string | null) ?? null }));

  const docsWithUrls = docs.map((d) => {
      const templateName = one(d.template as never) as { name?: string } | null;
      const uni = d.application_id ? appLabel.get(d.application_id) : null;
      // Only application-specific extras carry a university suffix; the standard
      // checklist is student-level and needs no label of its own.
      const inheritedFrom = inheritedFromById.get(d.id) ?? null;
      const base = d.custom_name ?? templateName?.name ?? d.category ?? "Document";
      // Said in the name, because a document approved last year sitting in
      // this year's checklist with no explanation looks like a mistake.
      const carried = inheritedFrom ? ` — carried over from intake ${inheritedFrom}` : "";
      const fileLabel = `${base}${uni?.name ? ` — ${uni.name}` : ""}`;
      const name = `${fileLabel}${carried}`;
      const past = history.get(d.id) ?? [];
      return { ...d, name, fileLabel, history: past, files: filesByDoc.get(d.id) ?? [] };
  });

  return (
    <>
      {/* Intake tabs, matching Applications: the upcoming intake first, the
          previous year second. */}
      {showCycleTabs && (
        <div className="mb-4 flex flex-wrap gap-2">
          {cycles.map((c) => (
            <Link
              prefetch={false}
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
          guides={guides}
          removals={isPreviousIntake ? [] : removals}
          focusDocId={typeof focusDocId === "string" ? focusDocId : null}
          downloadAll={{
            zipName: zipFileName(
              (student?.full_name as string | undefined) ?? "Student",
              (student?.student_code as string | null | undefined) ?? null,
              showCycleTabs ? (activeCycle?.intake ?? null) : null
            ),
          }}
        />
      </Card>
    </>
  );
}

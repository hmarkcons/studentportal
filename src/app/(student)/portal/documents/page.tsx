import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PortalDocumentRow } from "../applications/[id]/PortalDocumentRow";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";
import { loadStudentChecklistSections } from "@/lib/studentChecklistSections";
import { DocumentSectionShell } from "@/components/DocumentSectionShell";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PortalDocumentsPage() {
  const { supabase, userId } = await getStudentUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", userId ?? "").maybeSingle();
  if (!student) return null;

  await ensureStudentDocumentRequirements(student.id);

  const { data: applications } = await supabase.from("applications").select("id, university:universities(name)").eq("student_id", student.id);
  const appLabel = new Map((applications ?? []).map((a) => [a.id, one(a.university as never) as { name?: string } | null]));

  const { data: rawDocs } = await supabase
    .from("student_documents")
    .select("id, category, custom_name, status, file_path, deadline, rejected_reason, application_id, template:document_templates(name)")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  const docsWithUrls = await Promise.all(
    (rawDocs ?? []).map(async (d) => {
      const uni = d.application_id ? appLabel.get(d.application_id) : null;
      const templateName = one(d.template as never) as { name?: string } | null;
      const baseName = d.custom_name ?? templateName?.name ?? d.category ?? "Document";
      // Only application-scoped rows name a university; a student-level one is
      // shared across every application, and labelling it "General" is what
      // stops it reading as a document nobody asked for.
      const custom_name = `${baseName}${uni?.name ? ` — ${uni.name}` : ""}`;
      if (!d.file_path) return { ...d, custom_name };
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      return { ...d, custom_name, fileUrl: data?.signedUrl ?? null };
    })
  );

  // Grouped and numbered the same way staff see them on the Documents tab, so
  // "section 2, item 3" means the same thing to a student on the phone as to
  // the counsellor talking them through it. Previously this page was two flat
  // lists while staff had numbered categories.
  // Order and labels come from what the Create Doc Checklist builder set for
  // this student's destinations, so a section created in Setup reads under its
  // own name here instead of being lumped in as "Other documents".
  const configured = await loadStudentChecklistSections(supabase, student.id);
  const sections: { category: string; label: string; docs: typeof docsWithUrls }[] = configured
    .map((entry) => ({
      category: entry.key,
      label: entry.label,
      docs: docsWithUrls.filter((d) => (d.category ?? "other") === entry.key),
    }))
    .filter((s) => s.docs.length > 0);

  // Anything with a category the order does not know about would otherwise
  // vanish from this page entirely.
  const known = new Set<string>(configured.map((c) => c.key));
  const uncategorised = docsWithUrls.filter((d) => !known.has(d.category ?? "other"));
  if (uncategorised.length > 0) sections.push({ category: "unsorted", label: "Other documents", docs: uncategorised });

  const total = docsWithUrls.length;
  const approved = docsWithUrls.filter((d) => d.status === "verified").length;
  const outstanding = docsWithUrls.filter((d) => d.status === "missing" || d.status === "rejected").length;

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Documents</h2>
      <p className="mb-4 text-sm text-muted">
        Everything we need from you, in the order your counsellor works through it.
      </p>

      {total > 0 && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink">
              {approved} of {total} approved
            </p>
            <Badge tone={outstanding > 0 ? "warning" : "success"}>
              {outstanding > 0
                ? `${outstanding} to upload`
                : approved === total
                  ? "All approved"
                  : "Nothing to upload — with us for review"}
            </Badge>
          </div>
          {outstanding === 0 && approved < total && (
            <p className="mt-1 text-xs text-muted">
              We&rsquo;re checking what you sent. Your counsellor will be in touch if anything needs replacing.
            </p>
          )}
        </Card>
      )}

      {sections.length === 0 && (
        <Card>
          <p className="text-sm text-muted">Nothing is required from you yet.</p>
        </Card>
      )}

      {/* Collapsed on every load, the same as the staff Documents tab and
          through the same component, so a student reading their checklist on a
          phone gets an index rather than forty rows to scroll. The outstanding
          and rejected counts stay in each header, so nothing that needs acting
          on is hidden by a shut section — and the summary card above still
          gives the totals for the whole page. */}
      <div className="flex flex-col gap-3">
        {sections.map((section, i) => (
          <DocumentSectionShell
            key={section.category}
            number={i + 1}
            label={section.label}
            total={section.docs.length}
            approved={section.docs.filter((d) => d.status === "verified").length}
            outstanding={section.docs.filter((d) => d.status === "missing").length}
            rejected={section.docs.filter((d) => d.status === "rejected").length}
          >
            <div className="flex flex-col divide-y divide-border">
              {section.docs.map((doc, j) => (
                <PortalDocumentRow
                  key={doc.id}
                  doc={doc}
                  number={`${i + 1}.${j + 1}`}
                  studentId={student.id}
                  revalidateTo="/portal/documents"
                />
              ))}
            </div>
          </DocumentSectionShell>
        ))}
      </div>
    </div>
  );
}

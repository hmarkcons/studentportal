import Link from "next/link";
import { MAX_UPLOAD_BYTES, formatFileSize } from "@/lib/fileSize";
import { documentUrls } from "@/lib/storageUrls";
import { loadDocumentHistory } from "@/lib/documentHistory";
import { cycleTabLabel } from "@/lib/intakeCycle";
import { loadCycleDocuments, documentCounts } from "@/lib/studentCycleDocuments";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PortalDocumentRow } from "../applications/[id]/PortalDocumentRow";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";
import { loadStudentChecklistSections } from "@/lib/studentChecklistSections";
import { DocumentSectionList } from "@/components/DocumentSectionList";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PortalDocumentsPage(props: { searchParams: Promise<{ cycle?: string }> }) {
  const { cycle: cycleParam } = await props.searchParams;
  const { supabase, userId } = await getStudentUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", userId ?? "").maybeSingle();
  if (!student) return null;

  await ensureStudentDocumentRequirements(student.id);

  const [{ data: applications }, cycleDocs] = await Promise.all([
    supabase.from("applications").select("id, university:universities(name)").eq("student_id", student.id),
    // Which intake's rows to show — shared with the dashboard, so its
    // document ring counts exactly these.
    loadCycleDocuments(supabase, student.id, cycleParam),
  ]);
  const appLabel = new Map((applications ?? []).map((a) => [a.id, one(a.university as never) as { name?: string } | null]));
  const { docs: rawDocs, cycles, showCycleTabs, activeCycleId, isPreviousIntake, inheritedFromById } = cycleDocs;

  const docHistory = await loadDocumentHistory(supabase, rawDocs.map((d) => d.id));

  // Every file's link in one request, then a plain synchronous map. This was
  // one round trip to Storage per document before the page could render.
  const docUrls = await documentUrls(supabase, rawDocs.map((d) => d.file_path));

  const docsWithUrls = rawDocs.map((d) => {
      const uni = d.application_id ? appLabel.get(d.application_id) : null;
      const templateName = one(d.template as never) as { name?: string } | null;
      const baseName = d.custom_name ?? templateName?.name ?? d.category ?? "Document";
      // Only application-scoped rows name a university; a student-level one is
      // shared across every application, and labelling it "General" is what
      // stops it reading as a document nobody asked for.
      // A document approved for an earlier intake says so, or it looks like a
      // mistake sitting in this year's list already ticked off.
      const carried = inheritedFromById.get(d.id) ? " — already approved, carried over" : "";
      const custom_name = `${baseName}${uni?.name ? ` — ${uni.name}` : ""}${carried}`;
      const past = docHistory.get(d.id) ?? [];
      if (!d.file_path) return { ...d, custom_name, history: past };
      return { ...d, custom_name, history: past, fileUrl: docUrls.get(d.file_path) ?? null };
  });

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

  const counts = documentCounts(docsWithUrls);
  const total = counts.total;
  const approved = counts.verified;
  const outstanding = counts.waiting;

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Documents</h2>
      <p className="mb-2 text-sm text-muted">
        Everything we need from you, in the order your counsellor works through it.
      </p>
      {/* Said once, up front, as well as under every picker: a student on a
          phone should know before choosing a file, not after. */}
      <p className="mb-4 rounded-md border border-info bg-info-bg px-3 py-2 text-xs text-info" data-upload-limit>
        Each file can be up to <strong className="font-semibold">{formatFileSize(MAX_UPLOAD_BYTES)}</strong> — a PDF, a Word file
        or a photo. If a photo is larger, you can shrink it with one click when you choose it.
      </p>

      {showCycleTabs && (
        <div className="mb-4 flex flex-wrap gap-2">
          {cycles.map((c) => (
            <Link
              key={c.id}
              href={`/portal/documents?cycle=${c.id}`}
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
          This is what you sent us for an earlier intake, kept so you always have it. Anything still valid has already
          been carried over to <strong className="font-medium text-ink">{cycleTabLabel("Docs", cycles[0])}</strong>.
        </p>
      )}

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
          {/* The same share the dashboard's ring draws. */}
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-border" aria-hidden>
            <div className="h-full bg-success" style={{ width: `${(approved / total) * 100}%` }} />
            <div className="h-full bg-warning/60" style={{ width: `${(counts.inReview / total) * 100}%` }} />
          </div>
          <p className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-muted">
            <span><span className="text-success">■</span> Approved {approved}</span>
            <span><span className="text-warning">■</span> Being checked {counts.inReview}</span>
            <span>■ To upload {outstanding}</span>
          </p>
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
          through the same components, so a student reading their checklist on a
          phone gets an index rather than forty rows to scroll. The outstanding
          and rejected counts stay in each header, so nothing that needs acting
          on is hidden by a shut section — and the summary card above still
          gives the totals for the whole page.

          Expand-all comes from the shared list wrapper: the staff tab has had
          it since these sections became collapsible, and without it reading a
          whole checklist here was one click per section. */}
      <DocumentSectionList
        sections={sections.map((section, i) => ({
          key: section.category,
          number: i + 1,
          label: section.label,
          total: section.docs.length,
          approved: section.docs.filter((d) => d.status === "verified").length,
          outstanding: section.docs.filter((d) => d.status === "missing").length,
          rejected: section.docs.filter((d) => d.status === "rejected").length,
          content: (
            <div className="flex flex-col divide-y divide-border">
              {section.docs.map((doc, j) => (
                <PortalDocumentRow
                  key={doc.id}
                  doc={doc}
                  number={`${i + 1}.${j + 1}`}
                  studentId={student.id}
                  revalidateTo={`/portal/documents${showCycleTabs && activeCycleId ? `?cycle=${activeCycleId}` : ""}`}
                  readOnly={isPreviousIntake}
                />
              ))}
            </div>
          ),
        }))}
      />
    </div>
  );
}

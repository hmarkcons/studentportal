"use client";

import { useActionState, useState } from "react";
import { FileText, Trash2, X } from "lucide-react";
import { useButtonAction } from "@/components/useButtonAction";
import {
  uploadDocument,
  reviewDocumentFile,
  removeDocumentFile,
  addDocumentRequirement,
  deleteDocumentRequirement,
  restoreDocumentRequirement,
} from "@/lib/actions/documents";
import { fileDisplayName, type DocFile } from "@/lib/documentFileNames";
import { formatDateOnly } from "@/lib/formatDate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { DOCUMENT_STATUS_TONE, DOCUMENT_STATUS_LABELS } from "@/lib/constants";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";
import { CATEGORY_ORDER, CATEGORY_LABELS, sectionOfCategory } from "@/lib/documentCategories";
import { uploadedLine, reviewedLine, addedLine, type UploaderRole } from "@/lib/activityStamp";
import { DocumentHistory, type ArchivedUpload } from "@/components/DocumentHistory";
import { DocumentSectionShell, ExpandAllToggle } from "@/components/DocumentSectionShell";
import { FileField } from "@/components/FileField";
import { DocumentGuidePanel, DocumentGuideToggle, guideHasMore } from "@/components/DocumentGuide";
import type { ResolvedGuide } from "@/lib/documentGuides";
import { DownloadAllDocuments } from "@/components/DownloadAllDocuments";

export type DocRow = {
  id: string;
  /** Everything previously sent against this requirement (0165). */
  history?: ArchivedUpload[];
  category: string | null;
  status: string;
  file_path: string | null;
  deadline: string | null;
  rejected_reason: string | null;
  fileUrl?: string | null;
  name?: string | null;
  /**
   * The checklist name the file is saved under by "Download all" — the name
   * without what the page adds to it ("carried over from intake 1").
   */
  fileLabel?: string | null;
  /** When the file arrived, and from which side. Recorded all along; never shown. */
  uploaded_at?: string | null;
  uploaded_by_role?: UploaderRole | null;
  /** When it was reviewed — set whichever way the review went. */
  verified_at?: string | null;
  /** When the requirement itself was added to the checklist. */
  created_at?: string | null;
  /** Null for a requirement somebody added by hand rather than a template. */
  template_id?: string | null;
  /** Its files, each with its name and its own review (0328). */
  files?: DocFile[];
};

/**
 * One file of a requirement, for staff: its name as uploaded (and what it was
 * joined from), its own status, and its own Approve, Send back and Remove
 * (0328). Sending back asks for the reason the student will read.
 */
function StaffFileRow({
  file,
  doc,
  studentId,
  revalidateTo,
}: {
  file: DocFile;
  doc: DocRow;
  studentId: string;
  revalidateTo: string;
}) {
  const approve = useButtonAction();
  const sendBack = useButtonAction();
  const remove = useButtonAction();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const busy = approve.pending || sendBack.pending || remove.pending;
  const uploaded = uploadedLine({ at: file.uploadedAt, byRole: file.uploadedByRole, audience: "staff" });

  return (
    <li className="flex flex-col gap-1 rounded-md border border-border px-2 py-1.5" data-document-file={file.id ?? "legacy"} data-file-status={file.status}>
      <div className="flex flex-wrap items-center gap-2">
        <FileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
        {file.url ? (
          <a href={file.url} target="_blank" rel="noreferrer" className="min-w-0 break-all text-xs font-medium text-primary hover:underline" data-file-name>
            {file.name}
          </a>
        ) : (
          <span className="min-w-0 break-all text-xs font-medium text-ink" data-file-name>
            {file.name}
          </span>
        )}
        <Badge tone={DOCUMENT_STATUS_TONE[file.status] ?? "neutral"}>{DOCUMENT_STATUS_LABELS[file.status] ?? file.status.replace("_", " ")}</Badge>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          {file.status !== "verified" && (
            <Button
              type="button"
              variant="success"
              size="sm"
              disabled={busy}
              pending={approve.pending}
              onClick={() => void approve.run(() => reviewDocumentFile(file.id, doc.id, revalidateTo, "verified"))}
              status={{ state: approve.state, label: "Approved.", showError: true }}
            >
              Approve
            </Button>
          )}
          {file.status !== "rejected" && !asking && (
            <Button type="button" variant="danger" size="sm" disabled={busy} onClick={() => setAsking(true)}>
              Send back
            </Button>
          )}
          {file.id && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              pending={remove.pending}
              aria-label={`Remove ${file.name}`}
              title="Remove this file"
              onClick={() => {
                if (!confirm(`Remove "${file.name}" from ${doc.name ?? "this document"}? It can be restored from the audit log.`)) return;
                void remove.run(() => removeDocumentFile(file.id!, studentId, revalidateTo), { toast: "File removed." });
              }}
            >
              <X aria-hidden className="h-3.5 w-3.5 shrink-0" />
            </Button>
          )}
        </span>
      </div>
      {file.sources && (
        <p className="text-[11px] text-muted" data-file-sources>
          {fileDisplayName("", file.sources).replace(/^ — /, "").replace(/^joined/, "Joined")}
        </p>
      )}
      {uploaded && <p className="text-[11px] text-muted">{uploaded}</p>}
      {file.status === "rejected" && file.reason && <p className="text-xs text-danger">Sent back: {file.reason}</p>}
      {asking && (
        <div className="flex flex-wrap items-center gap-1">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What needs fixing — the student reads this"
            aria-label={`Why ${file.name} is sent back`}
            className="min-w-48 flex-1"
            autoFocus
          />
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={busy || !reason.trim()}
            pending={sendBack.pending}
            onClick={() =>
              void sendBack.run(async () => {
                const result = await reviewDocumentFile(file.id, doc.id, revalidateTo, "rejected", reason);
                if (!result?.error) {
                  setAsking(false);
                  setReason("");
                }
                return result;
              })
            }
            status={{ state: sendBack.state, label: "Sent back.", showError: true }}
          >
            Send back
          </Button>
          <button type="button" onClick={() => setAsking(false)} className="text-xs text-muted hover:underline">
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}

function UploadRow({
  doc,
  studentId,
  revalidateTo,
  number,
  canManage,
  guide = null,
  focused = false,
}: {
  doc: DocRow;
  /** The guide the student reads for it (0300) — the same words, to talk them through. */
  guide?: ResolvedGuide | null;
  /** The document Waiting on you was opened for: picked out, and scrolled to. */
  focused?: boolean;
  studentId: string;
  revalidateTo: string;
  /** Whether this viewer may delete the requirement (and its files). */
  canManage: boolean;
  /** Position within the whole checklist, e.g. "2.3" for the third document
   *  of the second section. */
  number?: string;
}) {
  const action = uploadDocument.bind(null, doc.id, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  // Upload stays disabled until a file within the limit is chosen, so an
  // oversized one is refused where it was picked rather than after the wait.
  const [ready, setReady] = useState(false);
  const del = useButtonAction();

  const files = doc.files ?? [];
  const sentBack = files.some((f) => f.status === "rejected");
  const hasMore = guideHasMore(guide);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideId = `staff-guide-${doc.id}`;

  function remove() {
    if (!confirm(`Remove "${doc.name ?? doc.category ?? "this document"}" from this student's checklist? It stays off until it is brought back.`)) return;
    // The row goes with the requirement, so success is a toast.
    void del.run(() => deleteDocumentRequirement(doc.id, revalidateTo), { toast: "Removed." });
  }

  return (
    // Horizontal only from lg. The name block, the upload form and the
    // delete button need ~600px between them, and at 768px the sidebar leaves
    // the content column narrower than it is at 767px — so switching at sm
    // overflowed exactly where room is tightest.
    <div
      id={`doc-${doc.id}`}
      className={`waiting-target flex flex-col gap-2 py-3${focused ? " px-2" : ""}`}
      data-document-row={doc.id}
      data-focused={focused || undefined}
    >
    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-[180px] flex-1">
        <p className="text-sm text-ink">
          {number && <span className="mr-1.5 font-mono text-xs text-muted">{number}</span>}
          {doc.name ?? doc.category ?? "Document"}
        </p>
        {guide?.note && (
          <p className="mt-0.5 text-xs text-muted" data-guide-note>
            {guide.note}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <Badge tone={DOCUMENT_STATUS_TONE[doc.status] ?? "neutral"}>{DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status.replace("_", " ")}</Badge>
          {doc.deadline && <span className="text-xs text-muted">Due {formatDateOnly(doc.deadline)}</span>}
          {files.length > 1 && <span className="text-xs text-muted">{files.length} files</span>}
        </div>

        {/* Each file on its own: its name, its own review (0328). */}
        {files.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5" data-document-files>
            {files.map((f) => (
              <StaffFileRow key={f.id ?? f.path} file={f} doc={doc} studentId={studentId} revalidateTo={revalidateTo} />
            ))}
          </ul>
        )}

        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
          {reviewedLine(doc.verified_at, doc.status, "staff") && <span>{reviewedLine(doc.verified_at, doc.status, "staff")}</span>}
          {/* Only for a requirement somebody added by hand — for the seeded
              ones "Added" is just when the checklist was provisioned, which
              tells nobody anything. */}
          {!doc.template_id && !doc.uploaded_at && addedLine(doc.created_at, "Requirement added") && (
            <span>{addedLine(doc.created_at, "Requirement added")}</span>
          )}
        </div>
        {/* What was sent before and replaced, and why it came back. */}
        <DocumentHistory versions={doc.history ?? []} audience="staff" deletable={{ revalidateTo }} />
        {hasMore && (
          <div className="mt-1">
            <DocumentGuideToggle open={guideOpen} onToggle={() => setGuideOpen((o) => !o)} controls={guideId} />
          </div>
        )}
      </div>

      <form action={formAction} className="flex flex-col gap-1" data-document-upload>
        <div className="flex flex-wrap items-start gap-2">
          <FileField multiple accept={ACCEPTED_DOCUMENT_ACCEPT} hint="PDF, Word or image" onChange={(s) => setReady(Boolean(s.file))} />
          <Button
            type="submit"
            pending={pending}
            size="sm"
            disabled={!ready}
            wrapperClassName="mt-0.5"
            status={{ state, label: "Uploaded." }}
          >
            {files.length === 0 ? "Upload" : sentBack ? "Upload replacement" : "Add file"}
          </Button>
        </div>
        <p className="max-w-xs text-[11px] text-muted">
          {sentBack
            ? "Replaces the file sent back; the others stay."
            : "Uploaded one at a time, each is kept as a file of its own."}
        </p>
      </form>

      {canManage && (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={remove}
            disabled={del.pending}
            pending={del.pending}
            title="Remove this requirement from the checklist"
            aria-label="Remove requirement"
            status={{ state: del.state, label: "Removed.", showError: true }}
          >
            <Trash2 aria-hidden className="h-4 w-4 shrink-0" />
          </Button>
        </div>
      )}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
      {guide && hasMore && guideOpen && (
        <div className="flex flex-col gap-1">
          <DocumentGuidePanel id={guideId} guide={guide} title={doc.name ?? "this document"} />
          <p className="text-[11px] text-muted">
            What the student reads for this document. Written in{" "}
            <a href="/setup/create-doc-checklist" className="text-primary hover:underline">
              Setup › Create Doc Checklist
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Requirements taken off this student's checklist (0328), each with Bring
 * back. Without this, one deleted by mistake could only come back by hand.
 */
function RemovedRequirements({
  removals,
  studentId,
  revalidateTo,
}: {
  removals: { id: string; name: string | null; removedAt: string | null }[];
  studentId: string;
  revalidateTo: string;
}) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-2" data-removed-requirements>
      <p className="text-xs font-semibold text-muted">Removed from this student&apos;s checklist</p>
      <ul className="mt-1 flex flex-col gap-1">
        {removals.map((r) => (
          <RemovedRequirement key={r.id} removal={r} studentId={studentId} revalidateTo={revalidateTo} />
        ))}
      </ul>
    </div>
  );
}

function RemovedRequirement({
  removal,
  studentId,
  revalidateTo,
}: {
  removal: { id: string; name: string | null; removedAt: string | null };
  studentId: string;
  revalidateTo: string;
}) {
  const back = useButtonAction();
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs" data-removed-requirement={removal.id}>
      <span className="text-ink">{removal.name ?? "A requirement"}</span>
      {removal.removedAt && <span className="text-muted">removed {formatDateOnly(removal.removedAt.slice(0, 10))}</span>}
      <Button
        type="button"
        size="sm"
        variant="outline"
        pending={back.pending}
        onClick={() => void back.run(() => restoreDocumentRequirement(removal.id, studentId, revalidateTo), { toast: "Back on the checklist." })}
        status={{ state: back.state, label: "Back.", showError: true }}
      >
        Bring back
      </Button>
    </li>
  );
}

// One per section, with the section fixed rather than chosen from a dropdown.
// It used to be a single form at the foot of the page whose category had to be
// picked from a list of raw keys, which meant scrolling away from the section
// you were looking at and then naming it again from memory.
function AddRequirementForm({
  studentId,
  applicationId,
  revalidateTo,
  category,
  categoryLabel,
}: {
  studentId: string;
  applicationId: string | null;
  revalidateTo: string;
  category: string;
  categoryLabel: string;
}) {
  const action = addDocumentRequirement.bind(null, studentId, applicationId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="my-3 text-xs font-medium text-primary hover:underline"
      >
        + Add requirement
      </button>
    );
  }

  return (
    <form action={formAction} className="my-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <input type="hidden" name="category" value={category} />
      <label className="flex flex-col gap-1 text-xs text-muted">
        Requirement for {categoryLabel}
        <Input name="name" placeholder="e.g. Police clearance certificate" required autoFocus className="w-64" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Due (optional)
        <Input name="deadline" type="date" className="w-auto" />
      </label>
      <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Added." }}>
        Add
      </Button>
      <button type="button" onClick={() => setOpen(false)} className="pb-2 text-xs text-muted hover:underline">
        Cancel
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function DocumentChecklist({
  docs,
  studentId,
  applicationId = null,
  revalidateTo,
  emptyMessage = "No documents required yet.",
  canManage = false,
  sections,
  emptySections = "all",
  guides = {},
  focusDocId = null,
  downloadAll,
  removals = [],
}: {
  docs: DocRow[];
  /** Requirements taken off this student's checklist (0328), to bring back. */
  removals?: { id: string; name: string | null; removedAt: string | null }[];
  /**
   * Shows "Download all": every uploaded document in the sections listed, as
   * one ZIP under this name. The student's Documents tab, for staff.
   */
  downloadAll?: { zipName: string };
  /**
   * The document somebody came here for — from Waiting on you, which links
   * ?doc=<id>#doc-<id>. Its section starts open, so the row is on the page to
   * be scrolled to, and the row is picked out.
   */
  focusDocId?: string | null;
  /** Each document's guide by its id (loadDocumentGuides), as the student reads it. */
  guides?: Record<string, ResolvedGuide>;
  studentId: string;
  applicationId?: string | null;
  revalidateTo: string;
  emptyMessage?: string;
  /** Super Admin / Processing: may add and delete requirements. */
  canManage?: boolean;
  /**
   * Which sections to show even when they hold nothing, so there is somewhere
   * to add a requirement. "all" suits a student's Documents tab, where the
   * whole checklist is the subject. An application's page passes just the one
   * or two sections its extras belong in — every empty section rendered there
   * would be nine headings and nothing under them.
   */
  emptySections?: "all" | string[];
  /**
   * The sections this student's destinations ask for, in the order the
   * builder put them. Falls back to the built-in order when not supplied, so
   * the student portal and any caller that has not been updated still render.
   */
  sections?: { key: string; label: string }[];
}) {
  // Collapsed is the default state, so this map holds only the sections
  // somebody has opened during this visit — and the one holding the document
  // this visit is for. Worked out from props alone, so the server and the
  // browser start from the same page.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const focus = focusDocId ? docs.find((d) => d.id === focusDocId) : null;
    if (!focus) return {};
    // The same rule the grouping below uses: a category no section carries is
    // listed under "other".
    const keys: string[] = sections && sections.length > 0 ? sections.map((s) => s.key) : CATEGORY_ORDER.map(String);
    const section = sectionOfCategory(focus.category);
    return { [focus.category && keys.includes(section) ? section : "other"]: true };
  });

  const grouped = new Map<string, DocRow[]>();
  for (const doc of docs) {
    const cat = sectionOfCategory(doc.category);
    (grouped.get(cat) ?? grouped.set(cat, []).get(cat)!).push(doc);
  }
  // Section order and labels come from the builder when the caller supplies
  // them, so a section created in Setup shows up here under its own name
  // instead of falling through to the hardcoded list.
  const order: { key: string; label: string }[] =
    sections && sections.length > 0
      ? sections
      : CATEGORY_ORDER.map((c) => ({ key: c as string, label: CATEGORY_LABELS[c] ?? c }));

  const known = new Set(order.map((o) => o.key));
  const uncategorized = docs.filter((d) => !d.category || !known.has(sectionOfCategory(d.category)));

  // Only the sections that will actually render, so the numbering runs 1..n
  // without gaps.
  const visibleSections = order.flatMap((entry) => {
    const catDocs =
      entry.key === "other" ? [...(grouped.get("other") ?? []), ...uncategorized] : (grouped.get(entry.key) ?? []);
    // An empty section is still shown to whoever can add to it — that is where
    // the "Add requirement" button lives, and a section with nothing in it is
    // exactly the one that needs something adding.
    const showWhenEmpty = canManage && (emptySections === "all" || emptySections.includes(entry.key));
    if (catDocs.length === 0 && !showWhenEmpty) return [];
    return [{ key: entry.key, label: entry.label, docs: catDocs }];
  });

  // A requirement filed under a section this student's destinations do not
  // carry would otherwise be invisible. "other" already absorbs those, but if
  // "other" itself is not in the order, add it rather than lose the rows.
  if (uncategorized.length > 0 && !visibleSections.some((v) => v.key === "other")) {
    visibleSections.push({ key: "other", label: CATEGORY_LABELS.other ?? "Other", docs: uncategorized });
  }

  // Derived from what is open rather than tracked separately, so the button
  // cannot say "Collapse all" while a section is already shut.
  const allExpanded = visibleSections.length > 0 && visibleSections.every((s) => openSections[s.key]);

  return (
    <div>
      {/* Gated on what will render, not on whether any document exists.
          Checking docs.length short-circuited the emptySections mechanism
          entirely: an application with nothing on it yet — every new one —
          showed "No documents required yet" and no section, so the
          "+ Add requirement" button that only lives inside a section could
          never be reached, and a university's own document ask could not be
          added until some other document happened to exist first. */}
      {visibleSections.length === 0 ? (
        <EmptyState>{emptyMessage}</EmptyState>
      ) : (
        <>
          {(() => {
            const toggle = (
              <ExpandAllToggle
                allExpanded={allExpanded}
                onToggle={() =>
                  setOpenSections(allExpanded ? {} : Object.fromEntries(visibleSections.map((s) => [s.key, true])))
                }
              />
            );
            if (!downloadAll) return toggle;
            // The same sections, numbered the same way, as the folders of the ZIP.
            const zipSections = visibleSections.map((s, i) => ({
              number: i + 1,
              label: s.label,
              docs: s.docs.filter((d) => d.file_path).map((d) => ({ id: d.id, name: d.fileLabel ?? d.name ?? "Document", files: d.files?.length })),
            }));
            return (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <DownloadAllDocuments studentId={studentId} zipName={downloadAll.zipName} sections={zipSections} />
                {toggle}
              </div>
            );
          })()}

          {/* Sections are numbered by the order they actually appear, not by
              their position in CATEGORY_ORDER — a student with no attestation
              documents should read 1, 2, 3 rather than 1, 3, 4. */}
          <div className="flex flex-col gap-3">
            {visibleSections.map((section, i) => {
              const n = i + 1;
              return (
                <DocumentSectionShell
                  key={section.key}
                  number={n}
                  label={section.label}
                  total={section.docs.length}
                  approved={section.docs.filter((d) => d.status === "verified").length}
                  outstanding={section.docs.filter((d) => d.status === "missing").length}
                  rejected={section.docs.filter((d) => d.status === "rejected").length}
                  open={openSections[section.key] ?? false}
                  onToggle={() => setOpenSections((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                >
                  <div className="flex flex-col divide-y divide-border">
                    {section.docs.map((doc, j) => (
                      <UploadRow
                        key={doc.id}
                        doc={doc}
                        studentId={studentId}
                        revalidateTo={revalidateTo}
                        number={`${n}.${j + 1}`}
                        canManage={canManage}
                        guide={guides[doc.id] ?? null}
                        focused={doc.id === focusDocId}
                      />
                    ))}
                    {section.docs.length === 0 && (
                      <p className="py-3 text-xs text-muted">Nothing required here yet.</p>
                    )}
                  </div>
                  {canManage && (
                    <AddRequirementForm
                      studentId={studentId}
                      applicationId={applicationId}
                      revalidateTo={revalidateTo}
                      category={section.key}
                      categoryLabel={section.label}
                    />
                  )}
                </DocumentSectionShell>
              );
            })}
          </div>
        </>
      )}
      {canManage && removals.length > 0 && <RemovedRequirements removals={removals} studentId={studentId} revalidateTo={revalidateTo} />}
    </div>
  );
}

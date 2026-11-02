import type { SupabaseClient } from "@supabase/supabase-js";
// Relative, with their extensions: the checks load this under plain Node.
import { readAll, readAllIn } from "./catalogueReads.ts";
import { CATEGORY_LABELS } from "./documentCategories.ts";
import { pickCycleDocuments } from "./studentCycleDocuments.ts";
import { checklistSectionsFor } from "./studentChecklistSections.ts";
import { karachiToday, type Cycle } from "./intakeCycle.ts";
import {
  buildChecklistReport,
  type ChecklistDocInput,
  type ChecklistFilters,
  type ChecklistReport,
  type ChecklistSectionRef,
  type ChecklistStudentInput,
} from "./documentChecklistReport.ts";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

export type ChecklistOption = { id: string; name: string };

/** A registered student as the picker offers them: name and Student ID. */
export type ChecklistStudentOption = { id: string; name: string; code: string | null };

export type LoadedChecklist = {
  report: ChecklistReport;
  /** Every processing officer with a registered student, for the filter. */
  officers: ChecklistOption[];
  /** Every destination a registered student is pursuing, for the filter. */
  countries: ChecklistOption[];
  /** Every registered student, whatever the filters, for picking particular ones. */
  students: ChecklistStudentOption[];
  /** Registered students before any filter, so the page can say "12 of 47". */
  registered: number;
};

type DocRow = {
  id: string;
  student_id: string;
  category: string | null;
  custom_name: string | null;
  status: string;
  deadline: string | null;
  rejected_reason: string | null;
  application_id: string | null;
  uploaded_at: string | null;
  verified_at: string | null;
  template_id: string | null;
  derived_key: string | null;
  cycle_id: string | null;
  template: { name: string | null } | { name: string | null }[] | null;
};

/**
 * Every registered student's documents checklist, for the report and its
 * downloads.
 *
 * Read through the caller's own session, so row-level security decides what
 * is in it (Processing and Super Admin see every registered student). Paged
 * throughout: there are thousands of documents and PostgREST stops at 1000.
 *
 * Each student's documents are their current intake's, chosen exactly as
 * their Documents page chooses them (pickCycleDocuments), in that page's
 * sections (checklistSectionsFor) — so the report's "18 of 43" is the tab's.
 * The checklist is reported as it stands: a requirement is added to it when
 * someone opens the student's record, not by reading this report.
 */
export async function loadDocumentChecklist(
  db: SupabaseClient,
  filters: ChecklistFilters,
  today: string = karachiToday()
): Promise<LoadedChecklist> {
  const [students, renewRows, sectionRows, placementRows] = await Promise.all([
    readAll<{ id: string; full_name: string | null; student_code: string | null; intake: string | null; processing_officer_id: string | null }>(
      (from, to) =>
        db
          .from("students")
          .select("id, full_name, student_code, intake, processing_officer_id")
          .eq("registration_status", "registered")
          .order("id")
          .range(from, to)
    ),
    readAll<{ id: string }>((from, to) => db.from("document_templates").select("id").eq("renew_each_intake", true).order("id").range(from, to)),
    readAll<{ key: string; label: string }>((from, to) => db.from("document_sections").select("key, label").order("key").range(from, to)),
    readAll<{ destination_id: string | null; section_key: string; sort_order: number }>((from, to) =>
      db.from("destination_document_sections").select("destination_id, section_key, sort_order").order("section_key").order("destination_id").range(from, to)
    ),
  ]);

  const ids = students.map((s) => s.id);
  const officerIds = [...new Set(students.map((s) => s.processing_officer_id).filter((v): v is string => Boolean(v)))];

  const [docRows, cycleRows, destRows, appRows, staffRows] = await Promise.all([
    readAllIn<DocRow>(ids, (chunk, from, to) =>
      db
        .from("student_documents")
        .select(
          "id, student_id, category, custom_name, status, deadline, rejected_reason, application_id, uploaded_at, verified_at, template_id, derived_key, cycle_id, template:document_templates(name)"
        )
        .in("student_id", chunk)
        // The Documents tab's order (newest first), with the id to keep pages stable.
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    readAllIn<Cycle & { student_id: string }>(ids, (chunk, from, to) =>
      db.from("student_cycles").select("id, student_id, sequence, intake, is_current").in("student_id", chunk).order("id").range(from, to)
    ),
    readAllIn<{ lead_id: string; destination_id: string; destination: unknown }>(ids, (chunk, from, to) =>
      db
        .from("lead_destinations")
        .select("lead_id, destination_id, destination:destinations(display_name, country)")
        .in("lead_id", chunk)
        .order("lead_id")
        .order("destination_id")
        .range(from, to)
    ),
    readAllIn<{ id: string; university: unknown }>(ids, (chunk, from, to) =>
      db.from("applications").select("id, university:universities(name)").in("student_id", chunk).order("id").range(from, to)
    ),
    officerIds.length
      ? readAllIn<{ id: string; full_name: string | null }>(officerIds, (chunk, from, to) =>
          db.from("staff").select("id, full_name").in("id", chunk).order("id").range(from, to)
        )
      : Promise.resolve([]),
  ]);

  const renewIds = new Set(renewRows.map((r) => r.id));
  const universityOf = new Map(appRows.map((a) => [a.id, (one(a.university as never) as { name?: string | null } | null)?.name ?? null]));

  const countriesOf = new Map<string, { id: string; name: string }[]>();
  const countryNames = new Map<string, string>();
  for (const r of destRows) {
    const dest = one(r.destination as never) as { display_name?: string | null; country?: string | null } | null;
    const name = dest?.display_name?.trim() || dest?.country?.trim() || "Destination";
    (countriesOf.get(r.lead_id) ?? countriesOf.set(r.lead_id, []).get(r.lead_id)!).push({ id: r.destination_id, name });
    countryNames.set(r.destination_id, name);
  }

  const docsOf = new Map<string, DocRow[]>();
  for (const d of docRows) (docsOf.get(d.student_id) ?? docsOf.set(d.student_id, []).get(d.student_id)!).push(d);
  const cyclesOf = new Map<string, Cycle[]>();
  for (const c of cycleRows) (cyclesOf.get(c.student_id) ?? cyclesOf.set(c.student_id, []).get(c.student_id)!).push(c);

  const docs: ChecklistDocInput[] = [];
  const sectionsByStudent = new Map<string, ChecklistSectionRef[]>();
  for (const s of students) {
    const picked = pickCycleDocuments(docsOf.get(s.id) ?? [], cyclesOf.get(s.id) ?? [], renewIds);
    for (const d of picked.docs) {
      const template = one(d.template)?.name ?? null;
      const base = d.custom_name?.trim() || template?.trim() || (d.category ? CATEGORY_LABELS[d.category] ?? d.category : "") || "Document";
      const uni = d.application_id ? universityOf.get(d.application_id) : null;
      docs.push({
        id: d.id,
        studentId: s.id,
        name: uni ? `${base} — ${uni}` : base,
        category: d.category,
        status: d.status,
        uploadedAt: d.uploaded_at,
        verifiedAt: d.verified_at,
        rejectedReason: d.rejected_reason,
        deadline: d.deadline,
        carriedFrom: picked.inheritedFromById.get(d.id) ?? null,
      });
    }
    sectionsByStudent.set(
      s.id,
      checklistSectionsFor(new Set((countriesOf.get(s.id) ?? []).map((c) => c.id)), sectionRows, placementRows)
    );
  }

  const officerNames = new Map(staffRows.map((r) => [r.id, r.full_name?.trim() || "Unnamed staff member"]));
  const studentInputs: ChecklistStudentInput[] = students.map((s) => ({
    id: s.id,
    name: s.full_name ?? "",
    code: s.student_code,
    intake: s.intake,
    officerId: s.processing_officer_id,
    countries: countriesOf.get(s.id) ?? [],
  }));

  const byName = (a: ChecklistOption, b: ChecklistOption) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  return {
    report: buildChecklistReport({ students: studentInputs, docs, sectionsByStudent, officerNames, filters, today }),
    officers: [...officerNames].map(([id, name]) => ({ id, name })).sort(byName),
    countries: [...countryNames].map(([id, name]) => ({ id, name })).sort(byName),
    students: students
      .map((s) => ({ id: s.id, name: s.full_name?.trim() || "Unnamed student", code: s.student_code }))
      .sort((a, b) => byName(a, b) || (a.code ?? "").localeCompare(b.code ?? "")),
    registered: students.length,
  };
}

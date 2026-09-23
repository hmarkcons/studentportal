"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsvWithHeader } from "@/lib/csv";
import { requirePermission } from "@/lib/auth/permissions";
import { MAX_UPLOAD_BYTES, fileSizeError } from "@/lib/fileSize";
import { parseRoundsFromFormData, roundsWereSubmitted } from "@/lib/programRounds";
import { saveProgramRounds } from "@/lib/actions/programRoundsWrite";
import { hasRole } from "@/lib/auth/roles";
import {
  describeChange,
  emptyReport,
  findNearMiss,
  finishReport,
  isBlank,
  mergeRow,
  normalizeName,
  renderCell,
  type Cell,
  type CatalogueImportResult,
  type ImportReport,
} from "@/lib/importMerge";
import {
  programFromRow,
  roundsFromRow,
  sameRounds,
  programInsertValues,
  universityFromRow,
  universityInsertValues,
  type CatalogueRound,
  type ProgramInput,
  type UniversityInput,
} from "@/lib/catalogueRows";

export async function createUniversity(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const destination_id = String(formData.get("destination_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "");

  if (!destination_id || !name || !city || !["public", "private"].includes(type)) {
    return { error: "Fill in all required fields — city is mandatory." };
  }

  const { data, error } = await supabase.from("universities").insert({ destination_id, name, city, region, type }).select("id").single();
  if (error) return { error: error.message };

  revalidateTag("universities", { expire: 0 });
  redirect(`/setup/universities/${data.id}`);
}

export async function updateUniversity(universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "");
  const status = String(formData.get("status") ?? "active");

  if (!name || !["public", "private"].includes(type)) {
    return { error: "Name and type are required." };
  }

  const { error } = await supabase.from("universities").update({ name, city, region, type, status }).eq("id", universityId);
  if (error) return { error: error.message };

  revalidatePath(`/setup/universities/${universityId}`);
  revalidatePath("/setup/universities");
  revalidateTag("universities", { expire: 0 });
  return { success: true };
}

export async function deleteUniversity(universityId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("universities").delete().eq("id", universityId);
  if (error) return { error: error.message };
  revalidateTag("universities", { expire: 0 });
  redirect("/setup/universities");
}

export async function updateProgram(programId: string, universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const level = String(formData.get("level") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const core_field = String(formData.get("core_field") ?? "").trim() || null;
  const sub_field = String(formData.get("sub_field") ?? "").trim() || null;
  const tuition_fee = formData.get("tuition_fee") ? Number(formData.get("tuition_fee")) : null;
  const duration = String(formData.get("duration") ?? "").trim() || null;
  const language_requirement = String(formData.get("language_requirement") ?? "").trim() || null;

  if (!level || !name) return { error: "Level and name are required." };

  // No check that a round's deadline falls before its start date. It usually
  // does, but rolling admission runs the other way round and a programme is
  // allowed to be odd — rejecting it here would be guessing at the data rather
  // than validating it. The inputs are labelled instead, which is what actually
  // prevents them being typed the wrong way round.
  const { error } = await supabase
    .from("programs")
    .update({ level, name, core_field, sub_field, tuition_fee, duration, language_requirement })
    .eq("id", programId);
  if (error) return { error: error.message };

  // The dates live in program_intake_rounds now; programs.start_date and
  // programs.application_deadline are a trigger-maintained mirror of the first
  // round and are deliberately not written here.
  //
  // Only when the form actually carried the widget — otherwise a form that
  // does not edit rounds would delete the ones the programme has.
  if (roundsWereSubmitted(formData)) {
    const roundsError = await saveProgramRounds(supabase, programId, parseRoundsFromFormData(formData));
    if (roundsError) return { error: roundsError };
  }

  revalidatePath(`/setup/universities/${universityId}`);
  return { success: true };
}

export async function upsertProgramCommissionRate(programId: string, universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.program_rates.manage", "Only Finance/Super Admin can set commission rates."); if (denied) return { error: denied.error };

  const rate_percent = formData.get("rate_percent") ? Number(formData.get("rate_percent")) : null;
  const fixed_amount = formData.get("fixed_amount") ? Number(formData.get("fixed_amount")) : null;
  const currency = String(formData.get("currency") ?? "").trim() || "EUR";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Clearing both fields removes the row rather than violating the table's
  // "rate_percent or fixed_amount" check constraint.
  if (rate_percent == null && fixed_amount == null) {
    const { error } = await supabase.from("program_commission_rates").delete().eq("program_id", programId);
    if (error) return { error: error.message };
    revalidatePath(`/setup/universities/${universityId}`);
    return { success: true };
  }

  const { error } = await supabase
    .from("program_commission_rates")
    .upsert({ program_id: programId, rate_percent, fixed_amount, currency, updated_by: user?.id }, { onConflict: "program_id" });
  if (error) return { error: error.message };

  revalidatePath(`/setup/universities/${universityId}`);
  return { success: true };
}

export async function deleteProgram(programId: string, universityId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("programs").delete().eq("id", programId);
  if (error) return { error: error.message };
  revalidatePath(`/setup/universities/${universityId}`);
  return { success: true };
}

export async function addProgram(universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const level = String(formData.get("level") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const core_field = String(formData.get("core_field") ?? "").trim() || null;
  const sub_field = String(formData.get("sub_field") ?? "").trim() || null;
  const tuition_fee = formData.get("tuition_fee") ? Number(formData.get("tuition_fee")) : null;

  if (!level || !name) return { error: "Level and name are required." };

  // The id comes back so the intake rounds can be attached — they are a child
  // table now, not two columns on this row.
  const { data: created, error } = await supabase
    .from("programs")
    .insert({ university_id: universityId, level, name, core_field, sub_field, tuition_fee })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const rounds = parseRoundsFromFormData(formData);
  if (rounds.length > 0) {
    const roundsError = await saveProgramRounds(supabase, created.id, rounds);
    // The programme itself was created, so this reports the partial outcome
    // rather than pretending the whole thing failed.
    if (roundsError) return { error: `Programme added, but its intake rounds could not be saved: ${roundsError}` };
  }

  revalidatePath(`/setup/universities/${universityId}`);
  return { success: true };
}

// ============================================================== bulk imports
//
// Three sheets reach the catalogue: universities for a destination, programmes
// for one university, and the combined sheet that carries both. All three ADD
// OR UPDATE rather than skipping whatever already exists.
//
// That change turns two quiet questions into decisions, both settled in
// src/lib/importMerge.ts: an empty cell changes nothing, and a name that is
// nearly-but-not-quite a match is held back rather than guessed at. The cell
// parsing lives in src/lib/catalogueRows.ts. Read those two before changing
// anything here.
//
// **Updating is Super Admin's alone, and not by choice.** Migration 0039 gives
// every active staff member INSERT on universities and programs but restricts
// UPDATE to super_admin. An UPDATE that RLS refuses does not raise an error —
// it simply matches no rows and reports success — so an import that merely
// tried would tell a counsellor it had changed forty programmes while changing
// nothing at all. The check is therefore made up front, and the rows that
// would have changed are named rather than silently passed over.
//
// Writes are batched where they can be: one insert for all new universities,
// one for all new programmes, one for all their rounds. Updates stay
// row-at-a-time because each carries a different patch. A thousand-row
// catalogue would otherwise be several thousand round trips inside one request.

/**
 * Whether this person may change what is already stored.
 *
 * Selects "role, roles" rather than "role": hasRole falls back to the primary
 * role when the array is absent, so asking for the primary alone would ignore
 * a Super Admin role somebody holds as their second.
 */
async function canUpdateCatalogue(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase
    .from("staff")
    .select("role, roles")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  return hasRole(staffRow, "super_admin");
}

/** Reads an uploaded sheet, .xlsx or .csv, into header-keyed rows. */
async function readImportRows(
  file: File | null,
  options: { sheet: string; knownHeaders: string[] }
): Promise<{ rows: Record<string, string>[] } | { error: string }> {
  if (file) {
    const tooLarge = fileSizeError(file.size, MAX_UPLOAD_BYTES, "file");
    if (tooLarge) return { error: `${tooLarge} A spreadsheet this large is usually a mistake — split it and import in batches.` };
  }
  if (!file || file.size === 0) return { error: "Choose a spreadsheet first — .xlsx or .csv." };

  const { isXlsx, parseXlsx } = await import("@/lib/spreadsheet");
  const rows = isXlsx(file) ? await parseXlsx(file, options) : parseCsvWithHeader(await file.text());
  if (rows.length === 0) return { error: "The file has no data rows." };
  return { rows };
}

// --------------------------------------------------------------- universities

const UNIVERSITY_COLUMNS = "id, name, city, region, type, levels_offered, fields_offered, contact_email";

type StoredUniversity = {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  type: string;
  levels_offered: string[];
  fields_offered: string[];
  contact_email: string | null;
};

/** The columns an import may change. Name is the key, so it is not among them. */
function universityPatchFields(input: UniversityInput): Record<string, Cell> {
  return {
    city: input.city,
    region: input.region,
    type: input.type,
    levels_offered: input.levels_offered,
    fields_offered: input.fields_offered,
    contact_email: input.contact_email,
  };
}

/**
 * Collapses the repeats a combined sheet necessarily has.
 *
 * One row per programme means the university's own columns are written out
 * again on every one of them. The first mention wins, and a later row that
 * fills in a blank adds to it; a later row that disagrees outright is reported
 * rather than quietly overwriting, because one of the two is a typo and
 * picking a winner would hide it.
 */
function collapseUniversities(inputs: UniversityInput[], report: ImportReport): UniversityInput[] {
  const byKey = new Map<string, UniversityInput>();
  const conflicts = new Set<string>();

  for (const input of inputs) {
    const key = normalizeName(input.name);
    const first = byKey.get(key);
    if (!first) {
      byKey.set(key, { ...input });
      continue;
    }

    const incoming = universityPatchFields(input);
    const established = universityPatchFields(first);
    for (const [field, value] of Object.entries(incoming)) {
      if (isBlank(value)) continue;
      const already = established[field];
      if (isBlank(already)) {
        (first as unknown as Record<string, Cell>)[field] = value;
        continue;
      }
      const same = Array.isArray(already)
        ? Array.isArray(value) && already.length === value.length && already.every((v, i) => v === value[i])
        : already === value;
      if (same) continue;
      const note = `"${input.name}" is listed more than once with a different ${field} — kept ${renderCell(already)}`;
      if (conflicts.has(note)) continue;
      conflicts.add(note);
      report.problems.push(note);
    }
  }

  return [...byKey.values()];
}

/**
 * Adds or updates every university in the list, and answers with the id of
 * each one — whether it was created here or was already on file — so the
 * programmes in a combined sheet can be hung off it.
 */
async function mergeUniversities(
  supabase: Awaited<ReturnType<typeof createClient>>,
  destinationId: string,
  defaultType: string,
  inputs: UniversityInput[],
  canUpdate: boolean,
  report: ImportReport
): Promise<Map<string, string>> {
  const { data: stored, error: readError } = await supabase
    .from("universities")
    .select(UNIVERSITY_COLUMNS)
    .eq("destination_id", destinationId)
    .returns<StoredUniversity[]>();
  if (readError) {
    report.failures.push(`Could not read the existing universities: ${readError.message}`);
    return new Map();
  }

  const byKey = new Map((stored ?? []).map((u) => [normalizeName(u.name), u]));
  const storedNames = (stored ?? []).map((u) => u.name);
  const idByKey = new Map([...byKey].map(([key, u]) => [key, u.id]));

  const toCreate: UniversityInput[] = [];

  for (const input of inputs) {
    const key = normalizeName(input.name);
    const existing = byKey.get(key);

    if (!existing) {
      const near = findNearMiss(input.name, storedNames);
      if (near) {
        report.heldBack.push(`"${input.name}" looks like "${near}", already on file — correct the sheet, or rename one of them`);
        continue;
      }
      if (!input.city) {
        report.problems.push(`"${input.name}" is new, and a new university needs a city`);
        continue;
      }
      toCreate.push(input);
      // Pushed now so a second near-miss inside the same file is caught
      // against this one too, rather than both being created.
      storedNames.push(input.name);
      continue;
    }

    const { patch, changes } = mergeRow(
      existing as unknown as Record<string, Cell>,
      universityPatchFields(input)
    );
    if (changes.length === 0) {
      report.universities.unchanged += 1;
      continue;
    }
    if (!canUpdate) {
      report.needsSuperAdmin.push(`${existing.name} (${changes.map((c) => c.field).join(", ")})`);
      continue;
    }

    const { error } = await supabase.from("universities").update(patch).eq("id", existing.id);
    if (error) {
      report.failures.push(`${existing.name}: ${error.message}`);
      continue;
    }
    Object.assign(existing, patch);
    report.universities.updated += 1;
    for (const change of changes) report.changes.push(`${existing.name} · ${describeChange(change)}`);
  }

  if (toCreate.length > 0) {
    const payload = toCreate.map((input) => universityInsertValues(input, destinationId, defaultType));
    const { data: created, error } = await supabase
      .from("universities")
      .insert(payload)
      .select("id, name")
      .returns<{ id: string; name: string }[]>();
    if (error) {
      report.failures.push(
        `Could not create ${toCreate.length} new universit${toCreate.length === 1 ? "y" : "ies"}: ${error.message}`
      );
    } else {
      report.universities.added += created?.length ?? 0;
      for (const row of created ?? []) idByKey.set(normalizeName(row.name), row.id);
    }
  }

  return idByKey;
}

// ------------------------------------------------------------------ programmes

const PROGRAM_COLUMNS =
  "id, university_id, name, level, core_field, sub_field, page_link, interview_required, interview_details, " +
  "admission_test_required, admission_test_type, application_portal_name, application_portal_link, intake_dates, " +
  "tuition_fee, duration, language_requirement";

type StoredProgram = {
  id: string;
  university_id: string;
  name: string;
  level: string;
};

type StoredRound = {
  program_id: string;
  label: string;
  start_date: string | null;
  application_deadline: string | null;
};

type ProgramEntry = {
  input: ProgramInput;
  rounds: CatalogueRound[];
  universityId: string;
  universityLabel: string;
};

const programKey = (name: string, level: string) => `${normalizeName(name)}__${level}`;

/** The columns an import may change. Name and level together are the key. */
function programPatchFields(input: ProgramInput): Record<string, Cell> {
  return {
    core_field: input.core_field,
    sub_field: input.sub_field,
    page_link: input.page_link,
    interview_required: input.interview_required,
    interview_details: input.interview_details,
    admission_test_required: input.admission_test_required,
    admission_test_type: input.admission_test_type,
    application_portal_name: input.application_portal_name,
    application_portal_link: input.application_portal_link,
    intake_dates: input.intake_dates,
    tuition_fee: input.tuition_fee,
    duration: input.duration,
    language_requirement: input.language_requirement,
  };
}

/**
 * Adds or updates programmes across any number of universities in one pass.
 *
 * Everything already stored for those universities is read in two queries
 * rather than two per programme, and the new rows and their rounds go in as
 * one insert each.
 */
async function mergePrograms(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entries: ProgramEntry[],
  canUpdate: boolean,
  report: ImportReport
) {
  const universityIds = [...new Set(entries.map((e) => e.universityId))];
  if (universityIds.length === 0) return;

  const { data: stored, error: readError } = await supabase
    .from("programs")
    .select(PROGRAM_COLUMNS)
    .in("university_id", universityIds)
    .returns<StoredProgram[]>();
  if (readError) {
    report.failures.push(`Could not read the existing programmes: ${readError.message}`);
    return;
  }

  const storedIds = (stored ?? []).map((p) => p.id);
  const { data: storedRounds } = storedIds.length
    ? await supabase
        .from("program_intake_rounds")
        .select("program_id, label, start_date, application_deadline")
        .in("program_id", storedIds)
        .returns<StoredRound[]>()
    : { data: [] as StoredRound[] };
  const roundsByProgram = new Map<string, StoredRound[]>();
  for (const round of storedRounds ?? []) {
    roundsByProgram.set(round.program_id, [...(roundsByProgram.get(round.program_id) ?? []), round]);
  }

  // Keyed by university as well as by name+level: two universities may
  // perfectly well both teach "Computer Science" at bachelors.
  const byKey = new Map<string, StoredProgram>();
  const namesByScope = new Map<string, string[]>();
  for (const program of stored ?? []) {
    byKey.set(`${program.university_id}::${programKey(program.name, program.level)}`, program);
    const scope = `${program.university_id}::${program.level}`;
    namesByScope.set(scope, [...(namesByScope.get(scope) ?? []), program.name]);
  }

  const toCreate: ProgramEntry[] = [];
  const seenInFile = new Set<string>();

  for (const entry of entries) {
    const { input, rounds, universityId, universityLabel } = entry;
    const scopedKey = `${universityId}::${programKey(input.name, input.level)}`;
    const label = `${universityLabel} · ${input.name} (${input.level})`;

    if (seenInFile.has(scopedKey)) {
      report.problems.push(`${label} appears more than once in the file — only the first was used`);
      continue;
    }
    seenInFile.add(scopedKey);

    const existing = byKey.get(scopedKey);

    if (!existing) {
      const scope = `${universityId}::${input.level}`;
      const near = findNearMiss(input.name, namesByScope.get(scope) ?? []);
      if (near) {
        report.heldBack.push(`${universityLabel} · "${input.name}" (${input.level}) looks like "${near}", already on file`);
        continue;
      }
      toCreate.push(entry);
      namesByScope.set(scope, [...(namesByScope.get(scope) ?? []), input.name]);
      continue;
    }

    const { patch, changes } = mergeRow(
      existing as unknown as Record<string, Cell>,
      programPatchFields(input)
    );
    const roundsDiffer = rounds.length > 0 && !sameRounds(roundsByProgram.get(existing.id) ?? [], rounds);

    if (changes.length === 0 && !roundsDiffer) {
      report.programs.unchanged += 1;
      continue;
    }
    if (!canUpdate) {
      const what = [...changes.map((c) => c.field), ...(roundsDiffer ? ["intake rounds"] : [])].join(", ");
      report.needsSuperAdmin.push(`${label} (${what})`);
      continue;
    }

    let touched = false;
    if (changes.length > 0) {
      const { error } = await supabase.from("programs").update(patch).eq("id", existing.id);
      if (error) {
        report.failures.push(`${label}: ${error.message}`);
        continue;
      }
      Object.assign(existing, patch);
      touched = true;
      for (const change of changes) report.changes.push(`${label} · ${describeChange(change)}`);
    }
    if (roundsDiffer) {
      const roundsError = await saveProgramRounds(supabase, existing.id, rounds);
      if (roundsError) {
        report.failures.push(`${label}: intake rounds — ${roundsError}`);
      } else {
        roundsByProgram.set(
          existing.id,
          rounds.map((r) => ({
            program_id: existing.id,
            label: r.label,
            start_date: r.start_date,
            application_deadline: r.application_deadline,
          }))
        );
        touched = true;
        report.changes.push(`${label} · intake rounds → ${rounds.map((r) => r.label).join(", ")}`);
      }
    }
    if (touched) report.programs.updated += 1;
  }

  if (toCreate.length === 0) return;

  const { data: created, error } = await supabase
    .from("programs")
    .insert(
      toCreate.map(({ input, universityId }) => programInsertValues(input, universityId))
    )
    .select("id, university_id, name, level")
    .returns<{ id: string; university_id: string; name: string; level: string }[]>();
  if (error) {
    report.failures.push(`Could not create ${toCreate.length} new programme(s): ${error.message}`);
    return;
  }
  report.programs.added += created?.length ?? 0;

  const idByKey = new Map((created ?? []).map((p) => [`${p.university_id}::${programKey(p.name, p.level)}`, p.id]));
  const newRounds = toCreate.flatMap(({ input, rounds, universityId }) => {
    const programId = idByKey.get(`${universityId}::${programKey(input.name, input.level)}`);
    if (!programId) return [];
    return rounds.map((round) => ({
      program_id: programId,
      label: round.label,
      start_date: round.start_date,
      application_deadline: round.application_deadline,
      sort_order: round.sort_order,
    }));
  });

  if (newRounds.length > 0) {
    const { error: roundsError } = await supabase.from("program_intake_rounds").insert(newRounds);
    // The programmes are in. Reporting the whole import as failed would be
    // wrong and would invite a re-upload, so this names what is missing.
    if (roundsError) {
      report.failures.push(`The new programmes were created, but their intake dates were not: ${roundsError.message}`);
    }
  }
}

// ------------------------------------------------------------- the three forms

/**
 * Universities for one destination.
 *
 * Columns: name (required), city (required only for a university that does not
 * exist yet), region, type (public/private — defaults to the destination's own
 * track), levels_offered, fields_offered, contact_email. The list columns are
 * semicolon-separated within the cell, since commas are the CSV delimiter.
 */
export async function importUniversities(_prevState: unknown, formData: FormData): Promise<CatalogueImportResult> {
  const supabase = await createClient();
  const destinationId = String(formData.get("destination_id") ?? "");
  if (!destinationId) return { error: "Choose a destination first." };

  const read = await readImportRows(formData.get("file") as File | null, {
    sheet: "Universities",
    knownHeaders: ["name", "city", "levels_offered"],
  });
  if ("error" in read) return { error: read.error };

  const { data: destination } = await supabase
    .from("destinations")
    .select("id, track")
    .eq("id", destinationId)
    .maybeSingle();
  if (!destination) return { error: "That destination no longer exists — reload the page." };

  const report = emptyReport();
  const inputs: UniversityInput[] = [];
  for (const row of read.rows) {
    const problems: string[] = [];
    const input = universityFromRow(row, "name", problems);
    if (!input) continue;
    for (const problem of problems) report.problems.push(`${input.name}: ${problem}`);
    inputs.push(input);
  }

  if (inputs.length === 0) return { error: "No rows had a 'name' column filled in." };

  const canUpdate = await canUpdateCatalogue(supabase);
  await mergeUniversities(
    supabase,
    destinationId,
    destination.track,
    collapseUniversities(inputs, report),
    canUpdate,
    report
  );

  revalidatePath("/setup/universities");
  revalidateTag("universities", { expire: 0 });
  return finishReport(report);
}

/**
 * Programmes for one university.
 *
 * Columns: level and name (both required, and together the key that decides
 * whether a row updates or creates), core_field, sub_field, page_link,
 * interview_required (yes/no), interview_details, admission_test_required
 * (yes/no), admission_test_type, application_portal_name,
 * application_portal_link, intake_dates, rounds, start_date,
 * application_deadline, tuition_fee, duration, language_requirement.
 */
export async function importPrograms(universityId: string, _prevState: unknown, formData: FormData): Promise<CatalogueImportResult> {
  const supabase = await createClient();

  const read = await readImportRows(formData.get("file") as File | null, {
    sheet: "Programmes",
    knownHeaders: ["level", "core_field", "language_requirement"],
  });
  if ("error" in read) return { error: read.error };

  const { data: university } = await supabase
    .from("universities")
    .select("id, name")
    .eq("id", universityId)
    .maybeSingle();
  if (!university) return { error: "That university no longer exists — reload the page." };

  const report = emptyReport();
  const entries: ProgramEntry[] = [];
  for (const row of read.rows) {
    const problems: string[] = [];
    const input = programFromRow(row, "name", problems);
    const rounds = roundsFromRow(row, problems);
    for (const problem of problems) report.problems.push(problem);
    if (!input) continue;
    entries.push({ input, rounds, universityId, universityLabel: university.name });
  }

  if (entries.length === 0) {
    return { error: "No rows had a valid 'name' and 'level' (bachelors/masters/phd)." };
  }

  const canUpdate = await canUpdateCatalogue(supabase);
  await mergePrograms(supabase, entries, canUpdate, report);

  revalidatePath(`/setup/universities/${universityId}`);
  revalidateTag("universities", { expire: 0 });
  return finishReport(report);
}

/**
 * A whole destination's catalogue in one sheet — universities and their
 * programmes together, one row per programme.
 *
 * The university columns repeat on every row belonging to that university,
 * which is how a spreadsheet says "these belong together"; the first mention
 * establishes it and later disagreements are reported. A row with a
 * university_name and no programme columns is a university on its own, which
 * is a legitimate thing to import.
 */
export async function importCatalogue(_prevState: unknown, formData: FormData): Promise<CatalogueImportResult> {
  const supabase = await createClient();
  const destinationId = String(formData.get("destination_id") ?? "");
  if (!destinationId) return { error: "Choose a destination first." };

  const read = await readImportRows(formData.get("file") as File | null, {
    sheet: "Catalogue",
    knownHeaders: ["university_name", "program_name"],
  });
  if ("error" in read) return { error: read.error };

  const { data: destination } = await supabase
    .from("destinations")
    .select("id, track")
    .eq("id", destinationId)
    .maybeSingle();
  if (!destination) return { error: "That destination no longer exists — reload the page." };

  const report = emptyReport();
  const universityInputs: UniversityInput[] = [];
  const programRows: { universityName: string; input: ProgramInput; rounds: CatalogueRound[] }[] = [];

  for (const row of read.rows) {
    const problems: string[] = [];
    const university = universityFromRow(row, "university_name", problems);
    if (!university) {
      if ((row.program_name ?? "").trim()) {
        report.problems.push(`"${row.program_name}" has no university_name on its row`);
      }
      continue;
    }
    universityInputs.push(university);

    const program = programFromRow(row, "program_name", problems);
    const rounds = roundsFromRow(row, problems);
    for (const problem of problems) report.problems.push(`${university.name}: ${problem}`);
    if (program) programRows.push({ universityName: university.name, input: program, rounds });
  }

  if (universityInputs.length === 0) {
    return { error: "No rows had a 'university_name' column filled in." };
  }

  const canUpdate = await canUpdateCatalogue(supabase);
  const idByName = await mergeUniversities(
    supabase,
    destinationId,
    destination.track,
    collapseUniversities(universityInputs, report),
    canUpdate,
    report
  );

  const entries: ProgramEntry[] = [];
  for (const { universityName, input, rounds } of programRows) {
    const universityId = idByName.get(normalizeName(universityName));
    // No id means the university was held back as a near-miss or could not be
    // created. Its programmes are skipped rather than attached to whatever
    // else is lying around; the university's own line already says why.
    if (!universityId) continue;
    entries.push({ input, rounds, universityId, universityLabel: universityName });
  }

  await mergePrograms(supabase, entries, canUpdate, report);

  revalidatePath("/setup/universities");
  revalidateTag("universities", { expire: 0 });
  return finishReport(report);
}

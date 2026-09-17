"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsvWithHeader } from "@/lib/csv";
import { requirePermission } from "@/lib/auth/permissions";
import { MAX_UPLOAD_BYTES, fileSizeError } from "@/lib/fileSize";
import { parseRoundsFromFormData, roundsWereSubmitted, type ProgramRound } from "@/lib/programRounds";
import { saveProgramRounds } from "@/lib/actions/programRoundsWrite";

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

function splitList(v: string | undefined): string[] {
  return (v ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBool(v: string | undefined): boolean {
  return ["yes", "true", "1", "y"].includes((v ?? "").trim().toLowerCase());
}

// University bulk import — one destination per file. Expected CSV columns
// (header row required): name, city, region, type, levels_offered,
// fields_offered — the last two are semicolon-separated within the cell
// (e.g. "bachelors;masters"), since commas are the CSV delimiter. Only
// `name` is required; anything else left blank keeps the column's DB
// default. `type` defaults to "public" when blank.
export async function importUniversities(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const destinationId = String(formData.get("destination_id") ?? "");
  if (!destinationId) return { error: "Choose a destination first." };

  const file = formData.get("file") as File | null;
  if (file) {
    const tooLarge = fileSizeError(file.size, MAX_UPLOAD_BYTES, "file");
    if (tooLarge) return { error: `${tooLarge} A spreadsheet this large is usually a mistake — split it and import in batches.` };
  }
  if (!file || file.size === 0) return { error: "Choose a CSV file first." };

  const text = await file.text();
  const rows = parseCsvWithHeader(text);
  if (rows.length === 0) return { error: "The file has no data rows." };

  const records = rows
    .filter((r) => r.name && r.city)
    .map((r) => ({
      destination_id: destinationId,
      name: r.name,
      city: r.city,
      region: r.region || null,
      type: r.type === "private" ? "private" : "public",
      levels_offered: splitList(r.levels_offered),
      fields_offered: splitList(r.fields_offered),
    }));

  if (records.length === 0) return { error: "No valid rows — 'name' and 'city' columns are both required." };

  // universities has no unique constraint on name — without this check,
  // re-uploading the same (or an overlapping) file would silently create
  // duplicate reference rows every time.
  const { data: existing } = await supabase.from("universities").select("name").eq("destination_id", destinationId);
  const existingNames = new Set((existing ?? []).map((u) => u.name.trim().toLowerCase()));
  const toInsert = records.filter((r) => !existingNames.has(r.name.trim().toLowerCase()));
  const skipped = records.length - toInsert.length;

  if (toInsert.length === 0) {
    return { error: "Every row's name already matches an existing university for this destination — nothing new to import." };
  }

  const { error } = await supabase.from("universities").insert(toInsert);
  if (error) return { error: error.message };

  revalidatePath("/setup/universities");
  revalidateTag("universities", { expire: 0 });
  return { success: true, count: toInsert.length, skipped };
}

// One cell holding a programme's intake rounds, for the bulk import:
//
//   Round 1|2026-09-01|2026-01-15; Round 2|2027-02-01|2026-09-15
//
// Semicolons between rounds (the convention the other multi-value columns in
// this file already use, since commas are the CSV delimiter) and pipes between
// label, course start and apply-by. A round needs at least one of the two dates
// or there is nothing to record; the label may be left empty and is numbered.
function parseRoundsCell(cell: string | undefined): ProgramRound[] {
  const rounds: ProgramRound[] = [];

  for (const entry of splitList(cell)) {
    const [label, start, deadline] = entry.split("|").map((s) => s.trim());
    const start_date = start || null;
    const application_deadline = deadline || null;
    if (!start_date && !application_deadline) continue;
    rounds.push({
      label: label || `Round ${rounds.length + 1}`,
      start_date,
      application_deadline,
      sort_order: rounds.length + 1,
    });
  }

  return rounds;
}

// Program bulk import — one university per file. Expected CSV columns
// (header row required): level, name, core_field, sub_field, page_link,
// interview_required, interview_details, admission_test_required,
// admission_test_type, application_portal_name, application_portal_link,
// intake_dates (semicolon-separated), rounds (see parseRoundsCell),
// start_date (YYYY-MM-DD), application_deadline (YYYY-MM-DD), tuition_fee,
// duration, language_requirement. Only `level` and `name` are required;
// `level` must be bachelors/masters/phd.
//
// start_date and application_deadline are still accepted — they are the
// documented single-intake columns — and become the programme's first round.
// `rounds` takes precedence where both are given.
export async function importPrograms(universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (file) {
    const tooLarge = fileSizeError(file.size, MAX_UPLOAD_BYTES, "file");
    if (tooLarge) return { error: `${tooLarge} A spreadsheet this large is usually a mistake — split it and import in batches.` };
  }
  if (!file || file.size === 0) return { error: "Choose a CSV file first." };

  const text = await file.text();
  const rows = parseCsvWithHeader(text);
  if (rows.length === 0) return { error: "The file has no data rows." };

  const records = rows
    .filter((r) => r.name && ["bachelors", "masters", "phd"].includes(r.level))
    .map((r) => {
      // `rounds` wins where it is given; otherwise the single-intake columns
      // become the first round. Either way the dates end up in
      // program_intake_rounds, never on the programme row — start_date and
      // application_deadline there are a trigger-maintained mirror now.
      const rounds = parseRoundsCell(r.rounds);
      if (rounds.length === 0 && (r.start_date || r.application_deadline)) {
        rounds.push({
          label: "Round 1",
          start_date: r.start_date || null,
          application_deadline: r.application_deadline || null,
          sort_order: 1,
        });
      }

      return {
        rounds,
        program: {
          university_id: universityId,
          level: r.level,
          name: r.name,
          core_field: r.core_field || null,
          sub_field: r.sub_field || null,
          page_link: r.page_link || null,
          interview_required: parseBool(r.interview_required),
          interview_details: r.interview_details || null,
          admission_test_required: parseBool(r.admission_test_required),
          admission_test_type: r.admission_test_type || null,
          application_portal_name: r.application_portal_name || null,
          application_portal_link: r.application_portal_link || null,
          intake_dates: splitList(r.intake_dates),
          tuition_fee: r.tuition_fee ? Number(r.tuition_fee) : null,
          duration: r.duration || null,
          language_requirement: r.language_requirement || null,
        },
      };
    });

  if (records.length === 0) return { error: "No rows had valid 'name' and 'level' (bachelors/masters/phd) columns." };

  const keyOf = (name: string, level: string) => `${name.trim().toLowerCase()}__${level}`;

  // programs has no unique constraint on (name, level) — without this
  // check, re-uploading the same (or an overlapping) file would silently
  // create duplicate program rows every time.
  const { data: existing } = await supabase.from("programs").select("name, level").eq("university_id", universityId);
  const seen = new Set((existing ?? []).map((p) => keyOf(p.name, p.level)));

  // Duplicates *within* one file were not caught before, only duplicates
  // against what was already stored — so a spreadsheet that listed the same
  // programme twice created it twice. Adding the key to the same set as it
  // passes closes that, and makes name+level unique among the inserted rows,
  // which is what lets the rounds below be matched back to their programme.
  const toInsert: typeof records = [];
  for (const record of records) {
    const key = keyOf(record.program.name, record.program.level);
    if (seen.has(key)) continue;
    seen.add(key);
    toInsert.push(record);
  }
  const skipped = records.length - toInsert.length;

  if (toInsert.length === 0) {
    return { error: "Every row's name+level already matches an existing program — nothing new to import." };
  }

  const { data: inserted, error } = await supabase
    .from("programs")
    .insert(toInsert.map((r) => r.program))
    .select("id, name, level");
  if (error) return { error: error.message };

  const idByKey = new Map((inserted ?? []).map((p) => [keyOf(p.name, p.level), p.id]));
  const roundRows = toInsert.flatMap((record) => {
    const programId = idByKey.get(keyOf(record.program.name, record.program.level));
    if (!programId) return [];
    return record.rounds.map((round) => ({
      program_id: programId,
      label: round.label,
      start_date: round.start_date,
      application_deadline: round.application_deadline,
      sort_order: round.sort_order ?? 0,
    }));
  });

  if (roundRows.length > 0) {
    const { error: roundsError } = await supabase.from("program_intake_rounds").insert(roundRows);
    // The programmes are already in. Reporting the import as a failure would
    // be wrong and would invite a re-upload that the dedupe then rejects
    // wholesale, so this names what is missing instead.
    if (roundsError) {
      revalidatePath(`/setup/universities/${universityId}`);
      return { error: `Imported ${toInsert.length} programme(s), but their intake dates could not be saved: ${roundsError.message}` };
    }
  }

  revalidatePath(`/setup/universities/${universityId}`);
  return { success: true, count: toInsert.length, skipped };
}

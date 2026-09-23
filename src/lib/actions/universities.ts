"use server";

import { createHash } from "node:crypto";
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
  findNearMisses,
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
  resolveDestination,
  roundsFromRow,
  mergeRounds,
  roundSpecFromRow,
  programInsertValues,
  universityFromRow,
  universityInsertValues,
  type CatalogueRound,
  type DestinationRef,
  type IncomingRound,
  type RoundLike,
  type RoundSpec,
  type ProgramInput,
  type UniversityInput,
} from "@/lib/catalogueRows";
import { readAllIn } from "@/lib/catalogueReads";
import { EXAMPLE_UNIVERSITY, ROUNDS_SHEET, isExampleRow } from "@/lib/catalogueSheet";

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
// Three sheets reach the catalogue: universities, programmes for one
// university, and the combined sheet that carries both. All three ADD OR
// UPDATE rather than skipping whatever already exists, and all three follow
// the same rules, settled in src/lib/importMerge.ts and src/lib/catalogueRows.ts
// — read those two before changing anything here:
//
//   - a row identical to what is stored is left alone;
//   - a filled cell that differs overwrites; a filled cell where nothing was
//     stored adds; an EMPTY cell changes nothing, so a partial sheet can never
//     blank a column;
//   - a name nearly matching exactly one stored record updates that record
//     (keeping its stored name), and a name near two is held back;
//   - anything new is created.
//
// **Every import is previewed first.** The action runs twice: once with
// `intent=preview`, which does all the matching and writes nothing, and again
// with `intent=apply` once the person has read the preview and confirmed. Both
// passes run the SAME code with one flag, `dryRun`, deciding whether the
// writes are sent — so what the preview says is what applying does, rather
// than a second implementation that could drift from the first. The apply pass
// must carry the preview's fingerprint, and is refused if the file or the
// fallback destination is not the one that was previewed.
//
// **Only a Super Admin may import at all.** Checked up front, before the file
// is read. Migration 0039 also restricts UPDATE on these tables to
// super_admin, and an UPDATE that RLS refuses raises nothing — it matches no
// rows — so every update here also asks for the row back and reports a
// failure when none comes, rather than trusting a silent success.
//
// Writes are batched where they can be: one insert for all new universities,
// one for all new programmes, one for all their rounds. Updates stay
// row-at-a-time because each carries a different patch.

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** One import in progress: where it writes, what it has found, and whether it may write. */
type ImportRun = { supabase: Supabase; report: ImportReport; dryRun: boolean };

const SUPER_ADMIN_ONLY = "Only a Super Admin can import universities and programmes.";

/**
 * Selects "role, roles" rather than "role": hasRole falls back to the primary
 * role when the array is absent, so asking for the primary alone would ignore
 * a Super Admin role somebody holds as their second.
 */
async function isSuperAdmin(supabase: Supabase) {
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

/** A Rounds sheet is told apart by its singular `round` column; the catalogue's own was `rounds`. */
const isRoundsSheet = (name: string, headers: string[]) =>
  name === ROUNDS_SHEET || (headers.includes("round") && headers.includes("university_name"));

/**
 * Reads an uploaded sheet, .xlsx or .csv, into header-keyed rows, and
 * fingerprints it.
 *
 * With `withRounds`, the rows of a Rounds sheet come back separately: from the
 * workbook's own Rounds sheet, or from a CSV that is one. Either may be
 * missing — a workbook of nothing but rounds is a legitimate upload.
 */
async function readImportRows(
  file: File | null,
  options: { sheet: string; knownHeaders: string[]; withRounds?: boolean }
): Promise<{ rows: Record<string, string>[]; roundRows: Record<string, string>[]; digest: string } | { error: string }> {
  if (file) {
    const tooLarge = fileSizeError(file.size, MAX_UPLOAD_BYTES, "file");
    if (tooLarge) return { error: `${tooLarge} A spreadsheet this large is usually a mistake — split it and import in batches.` };
  }
  if (!file || file.size === 0) return { error: "Choose a spreadsheet first — .xlsx or .csv." };

  const { isXlsx, parseXlsx, parseXlsxSheets } = await import("@/lib/spreadsheet");
  let rows: Record<string, string>[] = [];
  let roundRows: Record<string, string>[] = [];

  if (!options.withRounds) {
    rows = isXlsx(file) ? await parseXlsx(file, options) : parseCsvWithHeader(await file.text());
  } else if (isXlsx(file)) {
    const sheets = await parseXlsxSheets(file);
    const rounds = sheets.find((sh) => isRoundsSheet(sh.name, sh.headers));
    const main =
      sheets.find((sh) => sh.name === options.sheet) ??
      sheets.find((sh) => sh !== rounds && options.knownHeaders.some((h) => sh.headers.includes(h)));
    rows = main?.rows ?? [];
    roundRows = rounds?.rows ?? [];
  } else {
    const parsed = parseCsvWithHeader(await file.text());
    if (parsed.length > 0 && isRoundsSheet("", Object.keys(parsed[0]))) roundRows = parsed;
    else rows = parsed;
  }
  if (rows.length === 0 && roundRows.length === 0) return { error: "The file has no data rows." };

  const digest = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  return { rows, roundRows, digest };
}

/**
 * Preview or apply, and on apply whether it is the preview that was shown.
 *
 * The fingerprint covers the file's bytes and everything else in the form
 * that changes the outcome, so choosing a different fallback destination after
 * previewing is refused just like a different file.
 */
function importIntent(
  formData: FormData,
  digest: string,
  ...context: string[]
): { dryRun: boolean; fingerprint: string } | { error: string } {
  const fingerprint = createHash("sha256")
    .update([digest, ...context].join("|"))
    .digest("hex")
    .slice(0, 32);
  if (formData.get("intent") !== "apply") return { dryRun: true, fingerprint };
  if (String(formData.get("fingerprint") ?? "") !== fingerprint) {
    return { error: "This is not the file that was previewed, or the destination has changed since. Preview it again, then apply." };
  }
  return { dryRun: false, fingerprint };
}

/** The pending id a university gets in a preview, where nothing is inserted. */
const PENDING = "pending:";
const isPending = (id: string) => id.startsWith(PENDING);

// --------------------------------------------------------------- universities

const UNIVERSITY_COLUMNS = "id, destination_id, name, city, region, type, levels_offered, fields_offered, contact_email";

type StoredUniversity = {
  id: string;
  destination_id: string;
  name: string;
  city: string | null;
  region: string | null;
  type: string;
  levels_offered: string[];
  fields_offered: string[];
  contact_email: string | null;
};

type UniversityEntry = {
  input: UniversityInput;
  destination: DestinationRef;
  /**
   * Named only on the Rounds sheet. Such a row is a lookup — which university
   * do these rounds belong to — never an instruction to create or change one,
   * so it is neither counted nor able to create a university without a city.
   */
  roundsOnly?: boolean;
};

/** A university is one name within one destination; the same name elsewhere is another university. */
const universityKey = (destinationId: string, name: string) => `${destinationId}::${normalizeName(name)}`;

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

function sameCell(a: Cell, b: Cell) {
  return Array.isArray(a)
    ? Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
    : a === b;
}

/**
 * Folds a later mention of a university into the first one.
 *
 * A later row that fills in a blank adds to it; one that disagrees outright is
 * reported rather than quietly overwriting, because one of the two is a typo
 * and picking a winner would hide it.
 */
function absorbUniversity(first: UniversityInput, later: UniversityInput, report: ImportReport) {
  const established = universityPatchFields(first);
  for (const [field, value] of Object.entries(universityPatchFields(later))) {
    if (isBlank(value)) continue;
    const already = established[field];
    if (isBlank(already)) {
      (first as unknown as Record<string, Cell>)[field] = value;
      continue;
    }
    if (sameCell(already, value)) continue;
    report.problems.push(
      `"${later.name}" is listed more than once with a different ${field} — kept ${renderCell(already)}`
    );
  }
}

/**
 * Collapses the repeats a combined sheet necessarily has — one row per
 * programme means the university's own columns are written out again on every
 * one of them. The first mention wins, and is created or updated once.
 */
function collapseUniversities(entries: UniversityEntry[], report: ImportReport): UniversityEntry[] {
  const byKey = new Map<string, UniversityEntry>();
  for (const entry of entries) {
    const key = universityKey(entry.destination.id, entry.input.name);
    const first = byKey.get(key);
    if (!first) byKey.set(key, { ...entry, input: { ...entry.input } });
    else {
      absorbUniversity(first.input, entry.input, report);
      if (!entry.roundsOnly) first.roundsOnly = false;
    }
  }
  return [...byKey.values()];
}

/**
 * Adds or updates every university in the list, and answers with the id each
 * spelling in the sheet resolved to — whether created here, already on file,
 * or matched by a similar name — so the programmes in a combined sheet can be
 * hung off it. In a preview the new ones answer with a pending id.
 */
async function mergeUniversities(run: ImportRun, entries: UniversityEntry[]): Promise<Map<string, string>> {
  const { supabase, report, dryRun } = run;
  const destinationIds = [...new Set(entries.map((e) => e.destination.id))];

  let stored: StoredUniversity[];
  try {
    stored = await readAllIn(destinationIds, (chunk, from, to) =>
      supabase
        .from("universities")
        .select(UNIVERSITY_COLUMNS)
        .in("destination_id", chunk)
        .order("id")
        .range(from, to)
        .returns<StoredUniversity[]>()
    );
  } catch (error) {
    report.failures.push(`Could not read the existing universities: ${(error as Error).message}`);
    return new Map();
  }

  const byKey = new Map(stored.map((u) => [universityKey(u.destination_id, u.name), u]));
  // None today, but the programmes table already holds such pairs, and a
  // university on file twice would have its sheet row paired with an
  // arbitrary copy. Refused by name rather than guessed at.
  const onFileTwice = new Set<string>();
  {
    const seen = new Set<string>();
    for (const u of stored) {
      const key = universityKey(u.destination_id, u.name);
      if (seen.has(key)) onFileTwice.add(key);
      seen.add(key);
    }
  }
  const storedNames = new Map<string, string[]>();
  for (const u of stored) storedNames.set(u.destination_id, [...(storedNames.get(u.destination_id) ?? []), u.name]);

  /** Sheet spelling → the id it resolved to. */
  const idByKey = new Map<string, string>();
  /** Sheet spelling → the key of the new university it was folded into. */
  const aliasToNew = new Map<string, string>();
  const toCreate = new Map<string, UniversityEntry>();
  const newNames = new Map<string, string[]>();

  for (const entry of entries) {
    const { input, destination } = entry;
    const key = universityKey(destination.id, input.name);
    const where = destination.display_name;
    let existing = byKey.get(key);

    if (!existing) {
      const near = findNearMisses(input.name, storedNames.get(destination.id) ?? []);
      if (near.length > 1) {
        report.heldBack.push(
          `${where} · "${input.name}" is close to ${near.map((n) => `"${n}"`).join(" and ")} — make the name match one of them exactly`
        );
        continue;
      }
      if (near.length === 1) {
        existing = byKey.get(universityKey(destination.id, near[0]))!;
        report.similarMatches.push(
          entry.roundsOnly
            ? `Rounds: ${where} · "${input.name}" → "${existing.name}"`
            : `${where} · "${input.name}" → updates "${existing.name}"`
        );
      }
    }

    if (existing && entry.roundsOnly) {
      idByKey.set(key, existing.id);
      continue;
    }

    if (existing && onFileTwice.has(universityKey(destination.id, existing.name))) {
      report.heldBack.push(
        `${where} · "${existing.name}" is on file more than once, so there is no telling which to change — delete the duplicate, then import again`
      );
      continue;
    }

    if (!existing) {
      // Not on file — but two spellings of one new university in the same
      // sheet are still one university, not two.
      const nearNew = findNearMisses(input.name, newNames.get(destination.id) ?? []);
      if (nearNew.length > 1) {
        report.heldBack.push(
          `${where} · "${input.name}" is close to ${nearNew.map((n) => `"${n}"`).join(" and ")}, both new in this sheet`
        );
        continue;
      }
      if (nearNew.length === 1) {
        const target = universityKey(destination.id, nearNew[0]);
        if (!entry.roundsOnly) absorbUniversity(toCreate.get(target)!.input, input, report);
        aliasToNew.set(key, target);
        report.similarMatches.push(`${where} · "${input.name}" → the same new university as "${nearNew[0]}"`);
        continue;
      }
      if (entry.roundsOnly) {
        report.problems.push(
          `Rounds: ${where} · "${input.name}" is not a university on file or on the Catalogue sheet — its rounds were not applied`
        );
        continue;
      }
      if (!input.city) {
        report.problems.push(`${where} · "${input.name}" is new, and a new university needs a city`);
        continue;
      }
      toCreate.set(key, entry);
      newNames.set(destination.id, [...(newNames.get(destination.id) ?? []), input.name]);
      continue;
    }

    idByKey.set(key, existing.id);
    const { patch, changes } = mergeRow(existing as unknown as Record<string, Cell>, universityPatchFields(input));
    if (changes.length === 0) {
      report.universities.unchanged += 1;
      continue;
    }

    if (!dryRun) {
      const { data: updated, error } = await supabase
        .from("universities")
        .update(patch)
        .eq("id", existing.id)
        .select("id");
      if (error || !updated?.length) {
        report.failures.push(`${existing.name}: ${error?.message ?? "the database refused the change"}`);
        continue;
      }
    }
    // Applied to the in-memory row in a preview too, so that a second sheet
    // spelling of the same university is compared against what the first will
    // have left, exactly as it would be on apply.
    Object.assign(existing, patch);
    report.universities.updated += 1;
    for (const change of changes) report.changes.push(`${existing.name} · ${describeChange(change)}`);
  }

  const creating = [...toCreate.entries()];
  for (const [, { input, destination }] of creating) {
    report.additions.push(`${destination.display_name} · ${input.name} — new university`);
  }

  if (creating.length > 0 && dryRun) {
    for (const [key] of creating) idByKey.set(key, `${PENDING}${key}`);
    report.universities.added += creating.length;
  } else if (creating.length > 0) {
    const { data: created, error } = await supabase
      .from("universities")
      .insert(creating.map(([, e]) => universityInsertValues(e.input, e.destination.id, e.destination.track)))
      .select("id, name, destination_id")
      .returns<{ id: string; name: string; destination_id: string }[]>();
    if (error) {
      report.failures.push(
        `Could not create ${creating.length} new universit${creating.length === 1 ? "y" : "ies"}: ${error.message}`
      );
    } else {
      report.universities.added += created?.length ?? 0;
      for (const row of created ?? []) idByKey.set(universityKey(row.destination_id, row.name), row.id);
    }
  }

  for (const [alias, target] of aliasToNew) {
    const id = idByKey.get(target);
    if (id) idByKey.set(alias, id);
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

type StoredRound = RoundLike & { id: string; program_id: string };

type ProgramEntry = {
  input: ProgramInput;
  /** From the old one-cell `rounds` column or the single-intake columns, on the programme's own row. */
  rounds: CatalogueRound[];
  universityId: string;
  universityLabel: string;
};

/** A Rounds-sheet row, resolved to its university. */
type RoundEntry = { spec: RoundSpec; universityId: string; universityLabel: string };

/** Keyed by university as well as name+level: two universities may both teach "Computer Science" at bachelors. */
const programKey = (universityId: string, name: string, level: string) =>
  `${universityId}::${normalizeName(name)}__${level}`;

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
 * A programme that ends up with rounds to merge — one already on file, or one
 * this import creates — and what happened to its own columns on the way.
 */
type RoundTarget = {
  label: string;
  storedId: string | null;
  /** Index into toCreate, for a programme that does not exist yet. */
  newIndex: number | null;
  incoming: IncomingRound[];
  fieldsChanged: boolean;
  /** Listed on the Catalogue sheet, so it belongs in the "already matched" count if nothing changes. */
  inSheet: boolean;
};

/** Today in the office's own calendar, which decides whether a round is still open. */
function officeToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}

/**
 * Adds or updates programmes across any number of universities in one pass,
 * and merges intake rounds into them — from their own rows and from the
 * Rounds sheet.
 *
 * Everything already stored for those universities is read up front rather
 * than per programme, and the new rows and their rounds go in as one insert
 * each. A university that is itself new (a pending id, in a preview) has
 * nothing stored, so all of its programmes are additions.
 *
 * Rounds are merged by name (catalogueRows.mergeRounds): a named round on file
 * has its dates updated, a new one is added, and nothing is ever removed. A
 * stored round keeps its id, so the applications that record it stay linked.
 */
async function mergePrograms(run: ImportRun, entries: ProgramEntry[], roundEntries: RoundEntry[] = []) {
  const { supabase, report, dryRun } = run;
  const universityIds = [
    ...new Set([...entries.map((e) => e.universityId), ...roundEntries.map((r) => r.universityId)]),
  ].filter((id) => !isPending(id));

  let stored: StoredProgram[];
  let storedRounds: StoredRound[];
  try {
    stored = await readAllIn(universityIds, (chunk, from, to) =>
      supabase
        .from("programs")
        .select(PROGRAM_COLUMNS)
        .in("university_id", chunk)
        .order("id")
        .range(from, to)
        .returns<StoredProgram[]>()
    );
    storedRounds = await readAllIn(
      stored.map((p) => p.id),
      (chunk, from, to) =>
        supabase
          .from("program_intake_rounds")
          .select("id, program_id, label, start_date, application_deadline, sort_order")
          .in("program_id", chunk)
          .order("id")
          .range(from, to)
          .returns<StoredRound[]>()
    );
  } catch (error) {
    report.failures.push(`Could not read the existing programmes: ${(error as Error).message}`);
    return;
  }

  const today = officeToday();
  const roundsByProgram = new Map<string, StoredRound[]>();
  for (const round of storedRounds) {
    roundsByProgram.set(round.program_id, [...(roundsByProgram.get(round.program_id) ?? []), round]);
  }
  const roundsWouldChange = (programId: string, incoming: readonly IncomingRound[]) =>
    incoming.length > 0 && mergeRounds(roundsByProgram.get(programId) ?? [], incoming, today).changes.length > 0;

  // A list per key, not one record: the catalogue does hold the same
  // programme twice at some universities (43 such pairs in Germany when this
  // was written), and a map of one would silently pair a sheet row with
  // whichever copy was read last and overwrite it with the other's values.
  const byKey = new Map<string, StoredProgram[]>();
  const storedNames = new Map<string, string[]>();
  for (const program of stored) {
    const key = programKey(program.university_id, program.name, program.level);
    byKey.set(key, [...(byKey.get(key) ?? []), program]);
    const scope = `${program.university_id}::${program.level}`;
    storedNames.set(scope, [...(storedNames.get(scope) ?? []), program.name]);
  }

  const toCreate: ProgramEntry[] = [];
  const newNames = new Map<string, string[]>();
  /** Which sheet row first claimed a record, so a second claim can say which. */
  const claimedBy = new Map<string, string>();
  const targets = new Map<string, RoundTarget>();

  for (const entry of entries) {
    const { input, rounds, universityId, universityLabel } = entry;
    const label = `${universityLabel} · ${input.name} (${input.level})`;
    const scope = `${universityId}::${input.level}`;

    let candidates = byKey.get(programKey(universityId, input.name, input.level)) ?? [];
    let similar = false;
    if (candidates.length === 0) {
      const near = findNearMisses(input.name, storedNames.get(scope) ?? []);
      if (near.length > 1) {
        report.heldBack.push(
          `${label} is close to ${near.map((n) => `"${n}"`).join(" and ")} — make the name match one of them exactly`
        );
        continue;
      }
      if (near.length === 1) {
        candidates = byKey.get(programKey(universityId, near[0], input.level)) ?? [];
        similar = true;
      }
    }

    // The same programme on file more than once. A row identical to one of
    // the copies changes nothing and is fine — that is what an untouched
    // export of it looks like — but a row that would change one cannot say
    // which, so neither is touched.
    if (candidates.length > 1) {
      const same = candidates.find(
        (c) =>
          !claimedBy.has(c.id) &&
          mergeRow(c as unknown as Record<string, Cell>, programPatchFields(input)).changes.length === 0 &&
          !roundsWouldChange(c.id, rounds)
      );
      if (same) {
        claimedBy.set(same.id, input.name);
        report.programs.unchanged += 1;
      } else {
        report.heldBack.push(
          `${label} is on file ${candidates.length} times at this university, so there is no telling which to change — delete the duplicate, then import again`
        );
      }
      continue;
    }
    const existing: StoredProgram | undefined = candidates[0];

    // One record, one row of the sheet. A second row landing on the same
    // programme — repeated, or spelled close enough to match it — would
    // otherwise overwrite the first with whichever came last.
    const claimKey = existing ? existing.id : programKey(universityId, input.name, input.level);
    const firstClaim = claimedBy.get(claimKey);
    if (firstClaim !== undefined) {
      report.problems.push(
        firstClaim === input.name
          ? `${label} appears more than once in the file — only the first was used`
          : `${label} is the same programme as "${firstClaim}" earlier in the file — only the first was used`
      );
      continue;
    }

    if (!existing) {
      const nearNew = findNearMisses(input.name, newNames.get(scope) ?? []);
      if (nearNew.length > 0) {
        report.problems.push(
          `${label} is the same programme as "${nearNew[0]}" earlier in the file — only the first was used`
        );
        continue;
      }
      claimedBy.set(claimKey, input.name);
      targets.set(`new:${toCreate.length}`, {
        label,
        storedId: null,
        newIndex: toCreate.length,
        incoming: [...rounds],
        fieldsChanged: false,
        inSheet: true,
      });
      toCreate.push(entry);
      newNames.set(scope, [...(newNames.get(scope) ?? []), input.name]);
      continue;
    }
    claimedBy.set(claimKey, input.name);
    if (similar) report.similarMatches.push(`${universityLabel} · "${input.name}" (${input.level}) → updates "${existing.name}"`);

    const target = `${universityLabel} · ${existing.name} (${input.level})`;
    const { patch, changes } = mergeRow(existing as unknown as Record<string, Cell>, programPatchFields(input));

    if (changes.length > 0 && !dryRun) {
      const { data: updated, error } = await supabase
        .from("programs")
        .update(patch)
        .eq("id", existing.id)
        .select("id");
      if (error || !updated?.length) {
        report.failures.push(`${target}: ${error?.message ?? "the database refused the change"}`);
        continue;
      }
    }
    Object.assign(existing, patch);
    for (const change of changes) report.changes.push(`${target} · ${describeChange(change)}`);
    targets.set(existing.id, {
      label: target,
      storedId: existing.id,
      newIndex: null,
      incoming: [...rounds],
      fieldsChanged: changes.length > 0,
      inSheet: true,
    });
  }

  // ------------------------------------------------ the Rounds sheet's rows
  //
  // Each reaches every programme in its scope: the one it names, or every
  // programme the university has at that level, or at all — on file or being
  // added by this same upload.
  for (const { spec, universityId, universityLabel } of roundEntries) {
    const pool = [
      ...stored
        .filter((p) => p.university_id === universityId)
        .map((p) => ({ key: p.id, name: p.name, level: p.level, storedId: p.id as string | null, newIndex: null as number | null })),
      ...toCreate
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.universityId === universityId)
        .map(({ e, i }) => ({ key: `new:${i}`, name: e.input.name, level: e.input.level as string, storedId: null, newIndex: i })),
    ].filter((p) => !spec.level || p.level === spec.level);

    const where = `${universityLabel}${spec.level ? ` (${spec.level})` : ""}`;
    const roundName = spec.round.label ? `"${spec.round.label}"` : "an unnamed round";
    let reached = pool;
    if (spec.programName) {
      reached = pool.filter((p) => normalizeName(p.name) === normalizeName(spec.programName!));
      if (reached.length === 0) {
        const near = findNearMisses(spec.programName, pool.map((p) => p.name));
        if (near.length > 1) {
          report.heldBack.push(
            `Rounds: ${where} · "${spec.programName}" is close to ${near.map((n) => `"${n}"`).join(" and ")} — ${roundName} not applied`
          );
          continue;
        }
        if (near.length === 1) {
          reached = pool.filter((p) => normalizeName(p.name) === normalizeName(near[0]));
          report.similarMatches.push(`Rounds: ${where} · "${spec.programName}" → "${near[0]}"`);
        }
      }
      if (reached.length === 0) {
        report.problems.push(`Rounds: ${where} has no programme called "${spec.programName}" — ${roundName} not applied`);
        continue;
      }
      if (!spec.level && new Set(reached.map((p) => p.level)).size > 1) {
        report.problems.push(
          `Rounds: ${universityLabel} teaches "${spec.programName}" at more than one level — fill in the level; ${roundName} not applied`
        );
        continue;
      }
    } else if (reached.length === 0) {
      report.problems.push(`Rounds: ${where} has no programmes on file or in this sheet — ${roundName} not applied`);
      continue;
    }

    for (const p of reached) {
      const target = targets.get(p.key) ?? {
        label: `${universityLabel} · ${p.name} (${p.level})`,
        storedId: p.storedId,
        newIndex: p.newIndex,
        incoming: [],
        fieldsChanged: false,
        inSheet: false,
      };
      target.incoming.push(spec.round);
      targets.set(p.key, target);
    }
  }

  // --------------------------------------------- rounds on file, merged
  const roundsForNew = new Map<number, RoundLike[]>();
  for (const target of targets.values()) {
    const merged = mergeRounds(target.storedId ? (roundsByProgram.get(target.storedId) ?? []) : [], target.incoming, today);
    for (const conflict of merged.conflicts) report.problems.push(`${target.label}: ${conflict}`);

    if (target.newIndex !== null) {
      roundsForNew.set(target.newIndex, merged.rounds);
      continue;
    }

    let roundsChanged = false;
    if (merged.changes.length > 0) {
      const roundsError = dryRun ? null : await saveProgramRounds(supabase, target.storedId!, merged.rounds);
      if (roundsError) {
        report.failures.push(`${target.label}: intake rounds — ${roundsError}`);
      } else {
        roundsChanged = true;
        for (const change of merged.changes) report.changes.push(`${target.label} · ${change}`);
      }
    }
    if (target.fieldsChanged || roundsChanged) report.programs.updated += 1;
    else if (target.inSheet) report.programs.unchanged += 1;
  }

  // --------------------------------------------------- new programmes
  toCreate.forEach(({ input, universityLabel }, index) => {
    const rounds = roundsForNew.get(index) ?? [];
    const withRounds = rounds.length > 0 ? `, rounds ${rounds.map((r) => `"${r.label}"`).join(", ")}` : "";
    report.additions.push(`${universityLabel} · ${input.name} (${input.level}) — new programme${withRounds}`);
  });
  if (toCreate.length === 0) return;
  if (dryRun) {
    report.programs.added += toCreate.length;
    return;
  }

  // In an apply every university id is real: a new university that could not
  // be created has no id at all, and its programmes never reached this list.
  const { data: created, error } = await supabase
    .from("programs")
    .insert(toCreate.map(({ input, universityId }) => programInsertValues(input, universityId)))
    .select("id, university_id, name, level")
    .returns<{ id: string; university_id: string; name: string; level: string }[]>();
  if (error) {
    report.failures.push(`Could not create ${toCreate.length} new programme(s): ${error.message}`);
    return;
  }
  report.programs.added += created?.length ?? 0;

  const idByKey = new Map((created ?? []).map((p) => [programKey(p.university_id, p.name, p.level), p.id]));
  const newRounds = toCreate.flatMap(({ input, universityId }, index) => {
    const programId = idByKey.get(programKey(universityId, input.name, input.level));
    if (!programId) return [];
    return (roundsForNew.get(index) ?? []).map((round) => ({
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
      report.failures.push(`The new programmes were created, but their intake rounds were not: ${roundsError.message}`);
    }
  }
}

// ------------------------------------------------------------- the three forms

/**
 * The universities sheet and the combined sheet: rows of universities, each
 * optionally carrying one programme, across any number of destinations.
 *
 * A row's `destination` cell says where it belongs; a blank one falls back to
 * the destination picked in the form, and a row with neither is reported. So
 * a single-country sheet needs no destination column at all, and a sheet
 * covering several countries needs no picker.
 */
async function importUniversityRows(
  formData: FormData,
  options: { sheet: string; knownHeaders: string[]; universityKey: "name" | "university_name"; withProgrammes: boolean }
): Promise<CatalogueImportResult> {
  const supabase = await createClient();
  if (!(await isSuperAdmin(supabase))) return { error: SUPER_ADMIN_ONLY };

  const read = await readImportRows(formData.get("file") as File | null, {
    ...options,
    withRounds: options.withProgrammes,
  });
  if ("error" in read) return { error: read.error };

  const fallbackId = String(formData.get("destination_id") ?? "");
  const intent = importIntent(formData, read.digest, fallbackId);
  if ("error" in intent) return { error: intent.error };

  const { data: destinations, error: destinationsError } = await supabase
    .from("destinations")
    .select("id, display_name, country, country_code, track")
    .returns<DestinationRef[]>();
  if (destinationsError) return { error: `Could not read the destinations: ${destinationsError.message}` };
  const fallback = fallbackId ? (destinations ?? []).find((d) => d.id === fallbackId) : undefined;
  if (fallbackId && !fallback) return { error: "That destination no longer exists — reload the page." };

  const report = emptyReport();
  const universityEntries: UniversityEntry[] = [];
  const programRows: { key: string; universityName: string; input: ProgramInput; rounds: CatalogueRound[] }[] = [];

  // The template's greyed-out examples, if nobody deleted them. Skipped and
  // said so, rather than imported as a university called "Example University".
  const isExample = (row: Record<string, string>) => options.withProgrammes && isExampleRow(row);
  const examples = [...read.rows, ...read.roundRows].filter(isExample).length;
  if (examples > 0) {
    report.problems.push(`Skipped ${examples} example row(s) from the template (${EXAMPLE_UNIVERSITY}) — delete them from the sheet`);
  }

  /** The row's own destination, else the form's; null with the reason reported. */
  const destinationOf = (row: Record<string, string>, name: string, prefix = "") => {
    const cell = (row.destination ?? "").trim();
    const resolved = cell ? resolveDestination(cell, destinations ?? []) : null;
    const destination = resolved ? resolved.destination : fallback;
    if (!destination) {
      report.problems.push(
        resolved?.error
          ? `${prefix}"${name}": ${resolved.error}`
          : `${prefix}"${name}" has no destination — fill in the destination column, or choose one in the form`
      );
    }
    return destination ?? null;
  };

  for (const row of read.rows) {
    if (isExample(row)) continue;
    const problems: string[] = [];
    const university = universityFromRow(row, options.universityKey, problems);
    if (!university) {
      const orphan = options.withProgrammes ? (row.program_name ?? "").trim() : "";
      if (orphan) report.problems.push(`"${orphan}" has no university_name on its row`);
      continue;
    }

    const destination = destinationOf(row, university.name);
    if (!destination) continue;

    universityEntries.push({ input: university, destination });
    const program = options.withProgrammes ? programFromRow(row, "program_name", problems) : null;
    const rounds = options.withProgrammes ? roundsFromRow(row, problems) : [];
    for (const problem of problems) report.problems.push(`${university.name}: ${problem}`);
    if (program) {
      programRows.push({
        key: universityKey(destination.id, university.name),
        universityName: university.name,
        input: program,
        rounds,
      });
    }
  }

  // The Rounds sheet. Each row's university is looked up exactly as the
  // Catalogue sheet's are, spelling and all, and only then is it known which
  // programmes the round reaches.
  const roundRows: { key: string; universityName: string; spec: RoundSpec }[] = [];
  for (const row of read.roundRows) {
    if (isExample(row)) continue;
    const problems: string[] = [];
    const spec = roundSpecFromRow(row, problems);
    const name = (row.university_name ?? "").trim();
    for (const problem of problems) report.problems.push(`Rounds: ${name}: ${problem}`);
    if (!spec) {
      if (!name) report.problems.push("Rounds: a row has no university_name — ignored");
      continue;
    }
    const destination = destinationOf(row, spec.universityName, "Rounds: ");
    if (!destination) continue;
    universityEntries.push({ input: universityFromRow(row, "university_name", [])!, destination, roundsOnly: true });
    roundRows.push({ key: universityKey(destination.id, spec.universityName), universityName: spec.universityName, spec });
  }

  if (universityEntries.length === 0 && report.problems.length === 0) {
    return { error: `No rows had a '${options.universityKey}' column filled in.` };
  }

  const run: ImportRun = { supabase, report, dryRun: intent.dryRun };
  const idByKey = await mergeUniversities(run, collapseUniversities(universityEntries, report));

  if (options.withProgrammes) {
    const entries: ProgramEntry[] = [];
    for (const { key, universityName, input, rounds } of programRows) {
      const universityId = idByKey.get(key);
      // No id means the university was held back or could not be created. Its
      // programmes are skipped rather than attached to whatever else is lying
      // around; the university's own line already says why.
      if (!universityId) continue;
      entries.push({ input, rounds, universityId, universityLabel: universityName });
    }
    const roundEntries: RoundEntry[] = [];
    for (const { key, universityName, spec } of roundRows) {
      const universityId = idByKey.get(key);
      // No id: the university was not found, and its own line says so.
      if (universityId) roundEntries.push({ spec, universityId, universityLabel: universityName });
    }
    await mergePrograms(run, entries, roundEntries);
  }

  if (!intent.dryRun) {
    revalidatePath("/setup/universities");
    revalidateTag("universities", { expire: 0 });
  }
  return finishReport(report, intent.dryRun ? "preview" : "applied", intent.fingerprint);
}

/**
 * Universities only. Columns: destination, name (required), city (required
 * only for a university that does not exist yet), region, type
 * (public/private — defaults to the destination's own track), levels_offered,
 * fields_offered, contact_email. The list columns are semicolon-separated
 * within the cell, since commas are the CSV delimiter.
 */
export async function importUniversities(_prevState: unknown, formData: FormData): Promise<CatalogueImportResult> {
  return importUniversityRows(formData, {
    sheet: "Universities",
    knownHeaders: ["name", "city", "levels_offered"],
    universityKey: "name",
    withProgrammes: false,
  });
}

/**
 * Universities and their programmes together, one row per programme, across
 * as many destinations as the sheet names.
 *
 * The university columns repeat on every row belonging to that university,
 * which is how a spreadsheet says "these belong together"; the first mention
 * establishes it and later disagreements are reported. A row with a
 * university_name and no programme columns is a university on its own, which
 * is a legitimate thing to import.
 */
export async function importCatalogue(_prevState: unknown, formData: FormData): Promise<CatalogueImportResult> {
  return importUniversityRows(formData, {
    sheet: "Catalogue",
    knownHeaders: ["university_name", "program_name"],
    universityKey: "university_name",
    withProgrammes: true,
  });
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
  if (!(await isSuperAdmin(supabase))) return { error: SUPER_ADMIN_ONLY };

  const read = await readImportRows(formData.get("file") as File | null, {
    sheet: "Programmes",
    knownHeaders: ["level", "core_field", "language_requirement"],
  });
  if ("error" in read) return { error: read.error };

  const intent = importIntent(formData, read.digest, universityId);
  if ("error" in intent) return { error: intent.error };

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

  if (entries.length === 0 && report.problems.length === 0) {
    return { error: "No rows had a valid 'name' and 'level' (bachelors/masters/phd)." };
  }

  await mergePrograms({ supabase, report, dryRun: intent.dryRun }, entries);

  if (!intent.dryRun) {
    revalidatePath(`/setup/universities/${universityId}`);
    revalidateTag("universities", { expire: 0 });
  }
  return finishReport(report, intent.dryRun ? "preview" : "applied", intent.fingerprint);
}

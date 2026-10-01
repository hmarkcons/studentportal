"use server";

import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { hasRole } from "@/lib/auth/roles";
import { parseCsvWithHeader, readCsvFile } from "@/lib/csv";
import { MAX_UPLOAD_BYTES, fileSizeError } from "@/lib/fileSize";
import { uploadedFile } from "@/lib/stagedUpload";
import { fileDigest, importIntent } from "@/lib/importIntent";
import { readAll } from "@/lib/catalogueReads";
import { emptyReport, finishReport, type ImportResult } from "@/lib/importMerge";
import {
  BODY_KNOWN_HEADERS,
  BODY_SHEET,
  normalizeBodyRow,
  unreadBodyColumns,
} from "@/lib/scholarshipBodySheet";
import {
  planBodyImport,
  STORED_BODY_COLUMNS,
  type BodyUpdate,
  type DestinationName,
  type StoredBody,
} from "@/lib/scholarshipBodyRows";

// Importing Setup › Scholarship bodies from a spreadsheet: preview, then
// apply, exactly as the catalogue does (src/lib/actions/universities.ts).
//
// Everything that decides WHAT happens is in src/lib/scholarshipBodyRows.ts,
// pure and unit-tested, and runs identically for the preview and for the real
// thing. This file reads, gates, and sends the writes — each of which asks for
// its rows back, because an UPDATE or DELETE that row-level security refuses
// matches nothing and reports success.
//
// Not translated. The edit form runs every save through
// translateScholarshipValues, which asks the model to put Italian into
// English. An import does not, on purpose:
//   - it is one model call per body that looks non-English, several seconds
//     each — a sheet of forty would outlast the function's time limit, and
//     cost forty calls on every apply;
//   - the preview could not show what would be written without making those
//     calls too, twice over, and the model need not answer the same way the
//     second time — the preview would stop being the promise of the apply;
//   - a translated cell no longer equals the sheet, so re-importing the same
//     sheet would "change" it back each time, and a round trip would never be
//     a no-op.
// The sheet's own guidance says to write in English; a body imported in
// Italian can still be put through the edit form, which translates on save.

/** The staff session's client, which is already made for this request. */
type Supabase = Awaited<ReturnType<typeof getStaffSession>>["supabase"];

const DENIED = "Only Super Admin and the Processing team can import scholarship bodies.";

/**
 * scholarships.manage, and a role the database will let write.
 *
 * The permission can be granted to any role in Setup › Permissions, but the
 * table's write policy is fixed at Processing and Super Admin (0012) — so a
 * Management member given the permission would preview a clean import and
 * then have every row refused. Said up front instead, in words that say why.
 * Selects "role, roles" through the session, so a Processing role held as a
 * second role counts.
 */
async function gate(): Promise<{ error: string } | { supabase: Supabase; userId: string }> {
  const denied = await requirePermission("scholarships.manage", DENIED);
  if (denied) return denied;
  const { supabase, staff, userId } = await getStaffSession();
  if (!staff || !userId) return { error: DENIED };
  if (!hasRole(staff, "processing", "super_admin")) {
    return {
      error:
        "You have been given scholarships.manage, but the database only lets Processing and Super Admin write " +
        "scholarship bodies, so every row of this import would be refused. Ask a Super Admin or the Processing team " +
        "to run it.",
    };
  }
  return { supabase, userId };
}

/** The uploaded sheet as rows keyed the way the importer reads them, with its fingerprint. */
async function readBodySheet(
  file: File | null
): Promise<{ rows: Record<string, string>[]; digest: string; unread: string[] } | { error: string }> {
  if (file) {
    const tooLarge = fileSizeError(file.size, MAX_UPLOAD_BYTES, "file");
    if (tooLarge) return { error: `${tooLarge} A spreadsheet this large is usually a mistake — split it and import in batches.` };
  }
  if (!file || file.size === 0) return { error: "Choose a spreadsheet first — .xlsx or .csv." };

  const { isXlsx, parseXlsx } = await import("@/lib/spreadsheet");
  const raw = isXlsx(file)
    ? await parseXlsx(file, { sheet: BODY_SHEET, knownHeaders: BODY_KNOWN_HEADERS })
    : parseCsvWithHeader(await readCsvFile(file));
  if (raw.length === 0) return { error: "The file has no data rows." };

  // Named the way the sheet spells them, before the keys are normalised, so
  // the preview says which column it means.
  const unread = unreadBodyColumns(Object.keys(raw[0]));
  return { rows: raw.map(normalizeBodyRow), digest: fileDigest(await file.arrayBuffer()), unread };
}

/** Every body with the destinations it serves. Paged: PostgREST stops at 1000 rows without saying so. */
async function readStoredBodies(supabase: Supabase): Promise<StoredBody[]> {
  const [bodies, links] = await Promise.all([
    readAll((from, to) =>
      supabase
        .from("scholarship_bodies")
        .select(STORED_BODY_COLUMNS)
        .order("id")
        .range(from, to)
        .returns<Omit<StoredBody, "destinationIds">[]>()
    ),
    readAll((from, to) =>
      supabase
        .from("scholarship_body_destinations")
        .select("scholarship_body_id, destination_id")
        .order("scholarship_body_id")
        .order("destination_id")
        .range(from, to)
        .returns<{ scholarship_body_id: string; destination_id: string }[]>()
    ),
  ]);
  const served = new Map<string, string[]>();
  for (const l of links) served.set(l.scholarship_body_id, [...(served.get(l.scholarship_body_id) ?? []), l.destination_id]);
  return bodies.map((b) => ({ ...b, destinationIds: served.get(b.id) ?? [] }));
}

/**
 * Moves a body's countries to the new list: adds first, then removes, so it
 * is never left serving nobody — a body with no country is offered to no
 * student and drops out of the directory's country filter.
 */
async function relink(supabase: Supabase, bodyId: string, add: string[], remove: string[]): Promise<string | null> {
  if (add.length > 0) {
    const { data, error } = await supabase
      .from("scholarship_body_destinations")
      .insert(add.map((destination_id) => ({ scholarship_body_id: bodyId, destination_id })))
      .select("destination_id");
    if (error) return error.message;
    if ((data?.length ?? 0) !== add.length) return "the database refused to add a country";
  }
  if (remove.length > 0) {
    const { data, error } = await supabase
      .from("scholarship_body_destinations")
      .delete()
      .eq("scholarship_body_id", bodyId)
      .in("destination_id", remove)
      .select("destination_id");
    if (error) return error.message;
    if ((data?.length ?? 0) !== remove.length) return "the database refused to remove a country";
  }
  return null;
}

/**
 * Upload a sheet of scholarship bodies; preview what it would do; apply it.
 *
 * Matched by name — the same name updates, a close one updates the one body
 * it resembles, a new one is added. A blank cell never erases anything.
 * Columns and rules: src/lib/scholarshipBodySheet.ts (and the How to fill
 * sheet the template carries).
 */
export async function importScholarshipBodies(_prevState: unknown, formData: FormData): Promise<ImportResult> {
  const allowed = await gate();
  if ("error" in allowed) return { error: allowed.error };
  const { supabase, userId } = allowed;

  const read = await readBodySheet(await uploadedFile(formData, "file"));
  if ("error" in read) return { error: read.error };

  const intent = importIntent(
    formData,
    read.digest,
    [],
    "This is not the file that was previewed. Preview it again, then apply."
  );
  if ("error" in intent) return { error: intent.error };

  const { data: destinations, error: destinationsError } = await supabase
    .from("destinations")
    .select("id, display_name, country, country_code")
    .returns<DestinationName[]>();
  if (destinationsError) return { error: `Could not read the destinations: ${destinationsError.message}` };

  let stored: StoredBody[];
  try {
    stored = await readStoredBodies(supabase);
  } catch (error) {
    return { error: `Could not read the scholarship bodies: ${(error as Error).message}` };
  }

  const plan = planBodyImport(read.rows, { stored, destinations: destinations ?? [] });
  if (plan.noNames) {
    return { error: "No row has a Name filled in — is this the scholarship bodies sheet? Start from the blank template or the current bodies." };
  }

  const report = emptyReport([{ one: "scholarship body", many: "scholarship bodies" }]);
  const bodies = report.tallies![0];
  report.problems.push(...read.unread, ...plan.problems);
  report.similarMatches.push(...plan.similarMatches);
  report.heldBack.push(...plan.heldBack);
  bodies.unchanged = plan.unchanged;

  // Stamped on every body the import writes, as the edit form stamps every
  // save: it is what says the guide was last looked at, and by whom.
  const stamp = { guide_updated_at: new Date().toISOString(), guide_updated_by: userId };

  for (const update of plan.updates) {
    const landed = intent.dryRun ? { columns: true, countries: true } : await applyUpdate(supabase, update, stamp, report);
    if (!landed.columns && !landed.countries) continue;
    bodies.updated += 1;
    if (landed.columns) for (const line of update.lines) report.changes.push(`${update.name} · ${line}`);
    if (landed.countries && update.countries) report.changes.push(`${update.name} · ${update.countries.line}`);
  }

  if (plan.creates.length > 0 && intent.dryRun) {
    bodies.added += plan.creates.length;
    report.additions.push(...plan.creates.map((c) => c.line));
  } else if (plan.creates.length > 0) {
    // One insert for every new body, each row carrying every column (see
    // bodyInsertValues); the stamp is two more keys on every row alike.
    const { data: created, error } = await supabase
      .from("scholarship_bodies")
      .insert(plan.creates.map((c) => ({ ...c.values, ...stamp })))
      .select("id, name")
      .returns<{ id: string; name: string }[]>();
    if (error || (created?.length ?? 0) !== plan.creates.length) {
      report.failures.push(
        `Could not add ${plan.creates.length} new scholarship bod${plan.creates.length === 1 ? "y" : "ies"}: ${error?.message ?? "the database refused them"}`
      );
      // One statement is all or nothing, so this should never find anything —
      // but a body that did go in without the rest is taken back out.
      if (created?.length) await supabase.from("scholarship_bodies").delete().in("id", created.map((c) => c.id));
    } else {
      const idByName = new Map(created!.map((c) => [c.name, c.id]));
      const links = plan.creates.flatMap((c) =>
        c.destinationIds.map((destination_id) => ({ scholarship_body_id: idByName.get(c.values.name)!, destination_id }))
      );
      const { data: linked, error: linkError } = await supabase
        .from("scholarship_body_destinations")
        .insert(links)
        .select("scholarship_body_id");
      if (linkError || (linked?.length ?? 0) !== links.length) {
        // Without its countries a body is invisible in the directory, so it is
        // not left behind half-made — as createScholarshipBody does.
        await supabase.from("scholarship_bodies").delete().in("id", created!.map((c) => c.id));
        report.failures.push(
          `Could not give the new scholarship bodies their countries, so none was added: ${linkError?.message ?? "the database refused them"}`
        );
      } else {
        bodies.added += created!.length;
        report.additions.push(...plan.creates.map((c) => c.line));
      }
    }
  }

  if (!intent.dryRun) revalidatePath("/setup/scholarship-bodies");
  return finishReport(report, intent.dryRun ? "preview" : "applied", intent.fingerprint);
}

/**
 * Writes one update, and says which half of it landed — the columns and the
 * countries are two requests, and the report must list only what was written.
 * A half that did not land has its reason in the report's failures.
 */
async function applyUpdate(
  supabase: Supabase,
  update: BodyUpdate,
  stamp: { guide_updated_at: string; guide_updated_by: string },
  report: ReturnType<typeof emptyReport>
): Promise<{ columns: boolean; countries: boolean }> {
  const hasColumns = Object.keys(update.patch).length > 0;
  if (hasColumns) {
    const { data, error } = await supabase
      .from("scholarship_bodies")
      .update({ ...update.patch, ...stamp })
      .eq("id", update.id)
      .select("id");
    if (error || !data?.length) {
      report.failures.push(`${update.name}: ${error?.message ?? "the database refused the change"}`);
      // Nothing about the body was written, so its countries are not touched either.
      return { columns: false, countries: false };
    }
  }
  if (!update.countries) return { columns: hasColumns, countries: false };

  const linkError = await relink(supabase, update.id, update.countries.add, update.countries.remove);
  if (linkError) report.failures.push(`${update.name}: its countries were not changed — ${linkError}`);
  return { columns: hasColumns, countries: linkError === null };
}

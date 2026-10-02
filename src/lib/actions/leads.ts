"use server";

import { hasRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assignProcessingOfficers } from "@/lib/actions/processingHandoffWrite";
import { ensureCommissionForStudent } from "@/lib/actions/commissionAuto";
import { notifyAssignedStaff } from "@/lib/actions/registrationNotice";
import { canSetService, serviceOf, type ServiceType } from "@/lib/serviceType";
import { applyVisaOnlyStages } from "@/lib/actions/visaOnly";
import { getStaffSession } from "@/lib/auth/session";
import { syncStudentFollowUpTask } from "@/lib/actions/studentFollowUp";
import { createClient } from "@/lib/supabase/server";
import { syncStudentStages } from "@/lib/autoStagesSync";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAll, readAllIn } from "@/lib/catalogueReads";
import * as sheet from "@/lib/leadSheet";
import type { LeadInput, StoredLead } from "@/lib/leadSheet";
import { dateOfBirthError } from "@/lib/dateOfBirth";
import { phoneError, phoneChangeError } from "@/lib/phoneNumber";
import { MAX_UPLOAD_BYTES, fileSizeError } from "@/lib/fileSize";
import { removeStoragePrefix } from "@/lib/storageCleanup";
import { uploadedFile } from "@/lib/stagedUpload";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { normalizeRemark, remarkError } from "@/lib/leadRemarks";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Manual single-entry creation (unlike the CSV bulk-import paths, which
// already dedupe by email) had no duplicate check at all — a counselor
// re-entering a lead they forgot they'd already added would silently get a
// second row. Checked by email first (more likely to be unique/typo-free),
// then phone.
async function findDuplicateLead(supabase: SupabaseServerClient, email: string | null, contact_number: string | null) {
  if (email) {
    const { data } = await supabase.from("leads").select("id, full_name, status").ilike("email", email).limit(1).maybeSingle();
    if (data) return data;
  }
  if (contact_number) {
    const { data } = await supabase.from("leads").select("id, full_name, status").eq("contact_number", contact_number).limit(1).maybeSingle();
    if (data) return data;
  }
  return null;
}

function duplicateLeadError(existing: { full_name: string; status: string }) {
  const where = existing.status === "registered" ? "registered students" : "leads";
  return `A matching record already exists in ${where}: ${existing.full_name}. Check for a duplicate before creating a new one.`;
}

// Shared by registerStudentManually/updateRegistrationDetails — reads the
// primary + backup destination fields posted by PrimaryBackupDestinationSelect
// and validates them server-side (the picker's own UI already prevents these,
// but a form can always be resubmitted with stale/tampered fields).
function parseDestinationSelection(formData: FormData) {
  const primaryDestinationId = String(formData.get("destination_id") ?? "") || null;
  const primaryDestinationName = String(formData.get("destination_name") ?? "").trim() || null;
  const backupDestinationIds = formData.getAll("backup_destination_ids").map(String).filter(Boolean);
  const backupDestinationNames = formData.getAll("backup_destination_names").map(String).filter(Boolean);

  if (backupDestinationIds.length > 3) {
    return { error: "You can add at most 3 backup countries." } as const;
  }
  if (primaryDestinationId && backupDestinationIds.includes(primaryDestinationId)) {
    return { error: "A backup country can't be the same as the primary country." } as const;
  }
  if (new Set(backupDestinationIds).size !== backupDestinationIds.length) {
    return { error: "The same backup country was selected twice." } as const;
  }
  // Backups with nothing to back up. The student code is built from the
  // PRIMARY destination (0194), so this state leaves a registered student with
  // countries on file and still no code — and the country column reading as a
  // backup would say the wrong thing about where they are going.
  if (!primaryDestinationId && backupDestinationIds.length > 0) {
    return { error: "Choose the primary country before adding backup countries." } as const;
  }

  return { primaryDestinationId, primaryDestinationName, backupDestinationIds, backupDestinationNames } as const;
}

function destinationSelectionRows(leadId: string, selection: ReturnType<typeof parseDestinationSelection>) {
  if ("error" in selection) return [];
  return [
    ...(selection.primaryDestinationId ? [{ lead_id: leadId, destination_id: selection.primaryDestinationId, is_backup: false }] : []),
    ...selection.backupDestinationIds.map((destination_id) => ({ lead_id: leadId, destination_id, is_backup: true })),
  ];
}

export async function createLead(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  const contact_number = String(formData.get("contact_number") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const platform_source = String(formData.get("platform_source") ?? "").trim() || null;
  const current_qualification = String(formData.get("current_qualification") ?? "").trim() || null;
  const level_applying_for = String(formData.get("level_applying_for") ?? "") || null;
  const course_of_interest = String(formData.get("course_of_interest") ?? "").trim() || null;
  const destination_ids = formData.getAll("destination_ids").map(String).filter(Boolean);
  const destination_names = formData.getAll("destination_names").map(String).filter(Boolean);
  const country_of_interest = destination_names.join(", ") || null;
  const assigned_counselor_id = String(formData.get("assigned_counselor_id") ?? "") || null;
  const remark = normalizeRemark(String(formData.get("remarks") ?? ""));

  if (!full_name) {
    return { error: "Name is required." };
  }
  // Before anything is written, so a remark too long to keep never leaves a
  // lead created without it.
  const remarkInvalid = remarkError(remark);
  if (remarkInvalid) return { error: remarkInvalid };

  const phoneIssue = phoneError(contact_number);
  if (phoneIssue) return { error: phoneIssue };

  const duplicate = await findDuplicateLead(supabase, email, contact_number);
  if (duplicate) return { error: duplicateLeadError(duplicate) };

  // Insert without .select() — chaining .select() makes PostgREST append a
  // RETURNING clause, and Postgres additionally requires the returned row to
  // satisfy the table's SELECT policy. leads_select falls back to
  // staff_can_view_student(), which does its own nested lookup against
  // `leads` — a lookup that can't yet see a row inserted earlier in the same
  // command, so it always evaluates false and the whole insert is rejected
  // for any role that isn't covered by a direct, tuple-local leads_select
  // clause (i.e. every role except the assigned counselor). Generating the
  // id ourselves sidesteps RETURNING entirely.
  const id = crypto.randomUUID();
  const { error } = await supabase.from("leads").insert({
    id,
    full_name,
    contact_number,
    email,
    platform_source,
    current_qualification,
    level_applying_for,
    course_of_interest,
    country_of_interest,
    assigned_counselor_id,
  });

  if (error) return { error: error.message };

  if (destination_ids.length > 0) {
    await supabase.from("lead_destinations").insert(destination_ids.map((destination_id) => ({ lead_id: id, destination_id })));
  }

  // The lead's first remark, as its first version, under whoever added the lead.
  if (remark) {
    const user = await getCurrentUser();
    const { error: remarkSaveError } = await supabase.from("lead_remarks").insert({ lead_id: id, body: remark, written_by: user?.id });
    // The lead is in; saying so beats an error that invites adding it twice.
    if (remarkSaveError) {
      return { error: `The lead was added, but its remark was not saved (${remarkSaveError.message}) — add it from the leads list.` };
    }
  }

  redirect(`/leads/${id}`);
}

export async function updateLead(leadId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Name is required." };

  const contact_number = String(formData.get("contact_number") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const platform_source = String(formData.get("platform_source") ?? "").trim() || null;
  const current_qualification = String(formData.get("current_qualification") ?? "").trim() || null;
  const level_applying_for = String(formData.get("level_applying_for") ?? "") || null;
  const course_of_interest = String(formData.get("course_of_interest") ?? "").trim() || null;
  const date_of_birth = String(formData.get("date_of_birth") ?? "") || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const home_phone = String(formData.get("home_phone") ?? "").trim() || null;

  // date_of_birth is only ever submitted from the registered-student edit
  // form (LeadEditForm's showRegistrationFields — the plain lead-editing
  // form doesn't render this field at all, so formData.has() is false
  // there) — the agreement PDF needs it, so it's required in that context
  // specifically, not for a lead who hasn't registered yet.
  if (formData.has("date_of_birth") && !date_of_birth) return { error: "Date of birth is required." };
  const dobError = dateOfBirthError(date_of_birth);
  if (dobError) return { error: dobError };

  // Only what is actually being changed is checked — see phoneChangeError.
  const { data: storedLead } = await supabase
    .from("leads")
    .select("contact_number, home_phone")
    .eq("id", leadId)
    .maybeSingle();
  const phoneIssue =
    phoneChangeError(contact_number, storedLead?.contact_number, "contact number") ??
    phoneChangeError(home_phone, storedLead?.home_phone, "home phone");
  if (phoneIssue) return { error: phoneIssue };

  const { error } = await supabase
    .from("leads")
    .update({
      full_name,
      contact_number,
      email,
      platform_source,
      current_qualification,
      level_applying_for,
      course_of_interest,
      date_of_birth,
      address,
      home_phone,
    })
    .eq("id", leadId);

  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateLeadDestinations(leadId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const destination_ids = formData.getAll("destination_ids").map(String).filter(Boolean);
  const destination_names = formData.getAll("destination_names").map(String).filter(Boolean);

  await supabase.from("lead_destinations").delete().eq("lead_id", leadId);
  if (destination_ids.length > 0) {
    const { error } = await supabase
      .from("lead_destinations")
      .insert(destination_ids.map((destination_id) => ({ lead_id: leadId, destination_id })));
    if (error) return { error: error.message };
  }

  const { error } = await supabase
    .from("leads")
    .update({ country_of_interest: destination_names.join(", ") || null })
    .eq("id", leadId);
  if (error) return { error: error.message };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/students/${leadId}`);
  return { success: true };
}

export type LeadImportResult =
  | { error: string }
  | { success: true; added: number; updated: number; unchanged: number; notes: string[] };

type MatchLead = {
  id: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  country_of_interest: string | null;
  current_qualification: string | null;
  level_applying_for: string | null;
  course_of_interest: string | null;
  status: string | null;
  assigned_counselor_id: string | null;
  date_of_inquiry: string | null;
  platform_source: string | null;
};

/** The notes shown under an import; past this many the rest are counted, not listed. */
const IMPORT_NOTES_SHOWN = 60;

/**
 * Bulk import from the leads workbook (/api/samples/leads, or an export of the
 * list edited and brought back) or a CSV with the same headings. The columns,
 * and what happens to a lead already on file, are in src/lib/leadSheet.ts:
 * a lead found by its email or phone number is added to and never
 * overwritten, and two rows in the file for one person are read as one.
 *
 * Leads already on file are found through the admin client, so a lead the
 * importer cannot open is still recognised — and left alone, said so, rather
 * than filed a second time. Everything written goes through the importer's own
 * session, so RLS decides what they may change; an update RLS refuses matches
 * no rows and raises nothing, so each one is read back and reported.
 */
export async function importLeads(_prevState: unknown, formData: FormData): Promise<LeadImportResult> {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };
  const file = await uploadedFile(formData, "file");
  if (file) {
    const tooLarge = fileSizeError(file.size, MAX_UPLOAD_BYTES, "file");
    if (tooLarge) return { error: `${tooLarge} A spreadsheet this large is usually a mistake — split it and import in batches.` };
  }
  if (!file || file.size === 0) return { error: "Choose an Excel (.xlsx) or CSV file first." };

  let raw: Record<string, string>[];
  try {
    const { isXlsx, parseXlsx } = await import("@/lib/spreadsheet");
    if (isXlsx(file)) {
      raw = await parseXlsx(file, { sheet: sheet.LEAD_SHEET, knownHeaders: ["name", "full_name", "email", "contact number", "contact_number"] });
    } else {
      const { parseCsvWithHeader, readCsvFile } = await import("@/lib/csv");
      raw = parseCsvWithHeader(await readCsvFile(file));
    }
  } catch {
    return { error: "That file could not be read. Save it as .xlsx or .csv and try again." };
  }
  if (raw.length === 0) return { error: "The file has no data rows." };
  if (!Object.keys(raw[0]).some((h) => sheet.leadHeaderKey(h) === "full_name")) {
    return { error: "The file has no Name column. Start from the template (Download template) or an export of the list." };
  }

  const notes: string[] = [];
  const say = (name: string, message: string) => notes.push(`${name}: ${message}`);

  // ------------------------------------------------------- the rows, as leads
  const inputs: LeadInput[] = [];
  for (const row of raw) {
    const lead = sheet.leadFromRow(row, notes);
    if (!lead || sheet.isExampleLead(lead.full_name)) continue;
    const badPhone = phoneError(lead.contact_number);
    if (badPhone) {
      say(lead.full_name, `${badPhone} Left out.`);
      lead.contact_number = null;
    }
    inputs.push(lead);
  }
  if (inputs.length === 0) return { error: "No leads found — every row needs a Name." };

  // Read fresh rather than from the five-minute cache the dropdowns use: a
  // counsellor added a minute ago is one a sheet may name.
  const admin = createAdminClient();
  const { data: counselorRows } = await admin.from("staff").select("id, full_name").contains("roles", ["counselor"]).eq("status", "active");
  const counselors = counselorRows ?? [];
  const counselorId = (name: string | null, lead: string) => {
    if (!name) return null;
    const found = counselors.find((c) => c.full_name.trim().toLowerCase() === name.trim().toLowerCase());
    if (!found) say(lead, `counselor "${name}" is not an active counsellor — left unassigned.`);
    return found?.id ?? null;
  };

  // --------------------------------------------- the leads already on file
  const onFile = await readAll<MatchLead>((from, to) =>
    admin
      .from("leads")
      .select(
        "id, full_name, contact_number, email, country_of_interest, current_qualification, level_applying_for, course_of_interest, status, assigned_counselor_id, date_of_inquiry, platform_source"
      )
      .order("id")
      .range(from, to)
      .returns<MatchLead[]>()
  );
  const byEmail = new Map<string, MatchLead>();
  const byPhone = new Map<string, MatchLead>();
  for (const l of onFile) {
    if (l.email) byEmail.set(l.email.trim().toLowerCase(), l);
    const p = sheet.phoneKey(l.contact_number);
    if (p.length >= 7) byPhone.set(p, l);
  }
  const findOnFile = (input: LeadInput) =>
    (input.email && byEmail.get(input.email)) || (sheet.phoneKey(input.contact_number).length >= 7 && byPhone.get(sheet.phoneKey(input.contact_number))) || null;

  // ------------------------------------- the file's rows, one per person
  // A person on file collects every row that names them; a new person's
  // rows are folded into their first one by the same rules.
  type NewLead = { stored: StoredLead; status: LeadStatus | null; counselor: string | null; remark: string | null; followUps: { date: string; note: string | null }[] };
  const fresh: NewLead[] = [];
  const freshByEmail = new Map<string, NewLead>();
  const freshByPhone = new Map<string, NewLead>();
  const existing = new Map<string, LeadInput[]>();

  for (const input of inputs) {
    const known = findOnFile(input);
    if (known) {
      existing.set(known.id, [...(existing.get(known.id) ?? []), input]);
      continue;
    }
    const phone = sheet.phoneKey(input.contact_number);
    const twin = (input.email && freshByEmail.get(input.email)) || (phone.length >= 7 && freshByPhone.get(phone)) || null;
    if (twin) {
      const merge = sheet.mergeIntoLead(twin.stored, input);
      Object.assign(twin.stored, merge.patch);
      twin.status ??= merge.status;
      if (merge.counselor && !twin.counselor) twin.counselor = twin.stored.counselorName = merge.counselor;
      if (merge.remark) twin.remark = twin.stored.remark = merge.remark;
      if (merge.followUp) {
        twin.followUps.push(merge.followUp);
        twin.stored.followUpDates.push(merge.followUp.date);
      }
      if (merge.kept.length > 0) say(twin.stored.full_name, `in the file more than once; kept the first row's ${merge.kept.join("; ")}.`);
    } else {
      const entry: NewLead = {
        stored: {
          id: crypto.randomUUID(),
          full_name: input.full_name,
          contact_number: input.contact_number,
          email: input.email,
          country_of_interest: input.country_of_interest,
          current_qualification: input.current_qualification,
          level_applying_for: input.level_applying_for,
          course_of_interest: input.course_of_interest,
          status: input.status,
          counselorName: input.counselor,
          date_of_inquiry: input.date_of_inquiry,
          platform_source: input.platform_source,
          remark: input.remarks,
          followUpDates: input.follow_up_date ? [input.follow_up_date] : [],
        },
        status: input.status,
        counselor: input.counselor,
        remark: input.remarks,
        followUps: input.follow_up_date ? [{ date: input.follow_up_date, note: input.follow_up_note }] : [],
      };
      fresh.push(entry);
      if (input.email) freshByEmail.set(input.email, entry);
      if (phone.length >= 7) freshByPhone.set(phone, entry);
    }
  }

  const followUpNote = (note: string | null) => note || "Follow up (from the leads import)";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());

  // ---------------------------------------------------------- new leads
  // One rectangular insert: every row names every column, so a default never
  // depends on which cells a row happened to fill.
  if (fresh.length > 0) {
    const rows = fresh.map(({ stored: s, status, counselor }) => ({
      id: s.id,
      full_name: s.full_name,
      contact_number: s.contact_number,
      email: s.email,
      country_of_interest: s.country_of_interest,
      current_qualification: s.current_qualification,
      level_applying_for: s.level_applying_for,
      course_of_interest: s.course_of_interest,
      platform_source: s.platform_source,
      status: status ?? "potential",
      assigned_counselor_id: counselorId(counselor, s.full_name),
      date_of_inquiry: s.date_of_inquiry ?? today,
    }));
    const { error } = await supabase.from("leads").insert(rows);
    if (error) return { error: `No leads were imported: ${error.message}` };

    // A remark or follow-up can be added only to a lead the importer can open,
    // and one refused row fails the whole insert — so a lead filed for a
    // counsellor whose leads they cannot see goes in without its own.
    const wanted = fresh.filter((f) => f.remark || f.followUps.length > 0).map((f) => f.stored.id);
    const opens = new Set(
      wanted.length === 0
        ? []
        : (await readAllIn(wanted, (chunk, from, to) => supabase.from("leads").select("id").in("id", chunk).order("id").range(from, to).returns<{ id: string }[]>())).map((r) => r.id)
    );
    for (const f of fresh) {
      if (wanted.includes(f.stored.id) && !opens.has(f.stored.id)) {
        say(f.stored.full_name, "imported, but its remark and follow-up were not — it is assigned to a counsellor whose leads you cannot open.");
      }
    }
    const reachable = fresh.filter((f) => opens.has(f.stored.id));
    const remarks = reachable.flatMap(({ stored, remark }) => (remark ? [{ lead_id: stored.id, body: remark, written_by: staff.id }] : []));
    if (remarks.length > 0) {
      const { error: e } = await supabase.from("lead_remarks").insert(remarks);
      if (e) notes.push(`The new leads' remarks were not saved (${e.message}).`);
    }
    const followUps = reachable.flatMap(({ stored, followUps: list }) =>
      list.map((f) => ({ student_id: stored.id, type: "follow_up", due_date: f.date, due_time: null, note: followUpNote(f.note), created_by: staff.id }))
    );
    if (followUps.length > 0) {
      const { error: e } = await supabase.from("reminders").insert(followUps);
      if (e) notes.push(`The new leads' follow-ups were not saved (${e.message}).`);
    }
  }

  // ------------------------------------------------- leads already on file
  let updated = 0;
  let unchanged = 0;
  if (existing.size > 0) {
    const ids = [...existing.keys()];
    const [visible, remarkRows, pending] = await Promise.all([
      readAllIn(ids, (chunk, from, to) => supabase.from("leads").select("id").in("id", chunk).order("id").range(from, to).returns<{ id: string }[]>()),
      readAllIn(ids, (chunk, from, to) =>
        supabase.from("lead_remark_current").select("lead_id, body").in("lead_id", chunk).order("lead_id").range(from, to).returns<{ lead_id: string; body: string | null }[]>()
      ),
      readAllIn(ids, (chunk, from, to) =>
        supabase
          .from("reminders")
          .select("id, student_id, due_date")
          .eq("type", "follow_up")
          .eq("resolved", false)
          .in("student_id", chunk)
          .order("id")
          .range(from, to)
          .returns<{ id: string; student_id: string; due_date: string }[]>()
      ),
    ]);
    const canOpen = new Set(visible.map((v) => v.id));
    const remarkOf = new Map(remarkRows.map((r) => [r.lead_id, r.body]));
    const onFileById = new Map(onFile.map((l) => [l.id, l]));
    // Whoever each is assigned to, counsellor or not, so the sheet's
    // counsellor is compared with a name rather than an id.
    const assignedIds = [...new Set(ids.map((id) => onFileById.get(id)?.assigned_counselor_id).filter((v): v is string => Boolean(v)))];
    const { data: assigned } = assignedIds.length > 0 ? await admin.from("staff").select("id, full_name").in("id", assignedIds) : { data: [] };
    const nameOf = new Map((assigned ?? []).map((c) => [c.id as string, c.full_name as string]));

    for (const [id, rows] of existing) {
      const lead = onFileById.get(id)!;
      if (!canOpen.has(id)) {
        say(rows[0].full_name, "already on file as a lead you cannot open, so it was left as it is. Ask its counsellor or a manager to add to it.");
        unchanged++;
        continue;
      }
      const stored: StoredLead = {
        ...lead,
        counselorName: lead.assigned_counselor_id ? (nameOf.get(lead.assigned_counselor_id) ?? "someone no longer on staff") : null,
        remark: remarkOf.get(id) ?? null,
        followUpDates: pending.filter((p) => p.student_id === id).map((p) => p.due_date),
      };
      const patch: Record<string, string | null> = {};
      const added: string[] = [];
      const kept = new Set<string>();
      let remark: string | null = null;
      const followUps: { date: string; note: string | null }[] = [];
      for (const input of rows) {
        const merge = sheet.mergeIntoLead(stored, input);
        Object.assign(patch, merge.patch);
        Object.assign(stored, merge.patch);
        if (merge.status) {
          patch.status = stored.status = merge.status;
          added.push(`status ${LEAD_STATUS_LABELS[merge.status]}`);
        }
        if (merge.counselor) {
          const cid = counselorId(merge.counselor, stored.full_name);
          if (cid) {
            patch.assigned_counselor_id = cid;
            stored.counselorName = merge.counselor;
          }
        }
        if (merge.remark) remark = stored.remark = merge.remark;
        if (merge.followUp) {
          followUps.push(merge.followUp);
          stored.followUpDates.push(merge.followUp.date);
        }
        added.push(...merge.added);
        merge.kept.forEach((k) => kept.add(k));
      }
      if (patch.assigned_counselor_id) added.push(`counselor ${stored.counselorName}`);

      let failed = false;
      if (Object.keys(patch).length > 0) {
        const { data, error } = await supabase.from("leads").update(patch).eq("id", id).select("id");
        if (error || !data?.length) {
          say(stored.full_name, error ? `not updated (${error.message}).` : "already on file, but not a lead you can edit, so nothing was added.");
          failed = true;
        }
      }
      if (!failed && remark) {
        const { error } = await supabase.from("lead_remarks").insert({ lead_id: id, body: remark, written_by: staff.id });
        if (error) say(stored.full_name, `the remark was not saved (${error.message}).`);
      }
      if (!failed && followUps.length > 0) {
        const { error } = await supabase
          .from("reminders")
          .insert(followUps.map((f) => ({ student_id: id, type: "follow_up", due_date: f.date, due_time: null, note: followUpNote(f.note), created_by: staff.id })));
        if (error) say(stored.full_name, `the follow-up was not saved (${error.message}).`);
      }

      if (failed) unchanged++;
      else if (added.length > 0) {
        updated++;
        say(stored.full_name, `already on file — added ${added.join(", ")}.`);
      } else unchanged++;
      if (!failed && kept.size > 0) say(stored.full_name, `kept the lead's own ${[...kept].join("; ")}.`);
    }
  }

  revalidatePath("/leads");
  if (fresh.some((f) => f.followUps.length > 0) || updated > 0) revalidatePath("/calendar");
  const shown = notes.slice(0, IMPORT_NOTES_SHOWN);
  if (notes.length > shown.length) shown.push(`…and ${notes.length - shown.length} more.`);
  return { success: true, added: fresh.length, updated, unchanged, notes: shown };
}

// Bulk import for already-registered students — same columns as leads, plus
// date_of_birth, address, home_phone. Inserted with status='registered' so
// the DB trigger stamps registered_at immediately.
/**
 * Bulk import of already-registered students, from the .xlsx template or a CSV.
 *
 * This used to insert lead rows and nothing else, which left two things broken
 * that nobody would notice until they mattered:
 *
 *   * No student code. The code is stamped by a trigger (0194) from the
 *     student's PRIMARY DESTINATION, and the import wrote only the legacy
 *     free-text country_of_interest column — never a lead_destinations row —
 *     so student_primary_country() returned null and the trigger deliberately
 *     left the code unstamped. Every imported student had a blank Student ID
 *     on their profile, their agreement and their receipt.
 *   * No destination. lead_destinations is what the rest of the app reads: the
 *     new-application form offers only countries a student is registered for,
 *     so an imported student could not have an application created for them at
 *     all, and their visa page had nothing to show.
 *
 * Both are the same omission, and both are fixed by resolving the country
 * columns to real destinations and writing the join rows.
 */
export async function importRegisteredStudents(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = await uploadedFile(formData, "file");
  if (file) {
    const tooLarge = fileSizeError(file.size, MAX_UPLOAD_BYTES, "file");
    if (tooLarge) return { error: `${tooLarge} A spreadsheet this large is usually a mistake — split it and import in batches.` };
  }
  if (!file || file.size === 0) return { error: "Choose the filled-in template, or a CSV." };

  const { isXlsx, parseXlsx, isTemplateExampleRow } = await import("@/lib/spreadsheet");
  let rows: Record<string, string>[];
  if (isXlsx(file)) {
    rows = await parseXlsx(file);
  } else {
    const { parseCsvWithHeader, readCsvFile } = await import("@/lib/csv");
    rows = parseCsvWithHeader(await readCsvFile(file));
  }
  if (rows.length === 0) return { error: "The file has no data rows." };

  const exampleRows = rows.filter(isTemplateExampleRow).length;
  rows = rows.filter((r) => !isTemplateExampleRow(r));
  if (rows.length === 0) {
    return { error: "The file holds only the template's example row. Replace it with your students and upload again." };
  }

  const { resolveDestination, splitCountries } = await import("@/lib/destinationMatch");
  const [{ data: destinations }, { data: counselors }] = await Promise.all([
    supabase.from("destinations").select("id, country, display_name, country_code, status"),
    // Active counsellors only, matching the definition the assignment
    // dropdowns already use (getCachedCounselors) — read directly rather than
    // through the cache so a counsellor added minutes ago is not rejected.
    supabase.from("staff").select("id, full_name").contains("roles", ["counselor"]).eq("status", "active"),
  ]);
  const allDestinations = destinations ?? [];
  const counselorByName = new Map<string, string[]>();
  for (const c of counselors ?? []) {
    const key = c.full_name.trim().toLowerCase();
    counselorByName.set(key, [...(counselorByName.get(key) ?? []), c.id]);
  }

  const { byRegistrationDate, karachiToday, registrationDateError, registrationTimestamp } = await import(
    "@/lib/registrationDate"
  );

  type Prepared = {
    lead: Record<string, unknown>;
    primary: string;
    backups: string[];
    /** The registration day, kept out of `lead` so the batch can be ordered by it. */
    day: string;
  };

  const prepared: Prepared[] = [];
  const badCountry: string[] = [];
  // A date that could not be read. Fatal to the row, unlike a bad date of
  // birth, because the registration date fixes the student's place in their
  // intake and their Student ID is composed from it and never renumbered.
  const badDate: string[] = [];
  // Rows that left the column blank and were stamped with today instead.
  let datedToday = 0;
  // Matched a real destination, but one we have paused — a different problem
  // from a typo, and a different fix, so it is reported separately.
  const pausedCountry: string[] = [];
  const noCountry: string[] = [];
  const unknownCounselor: string[] = [];
  const ambiguousCounselor: string[] = [];

  for (const r of rows) {
    const full_name = (r.full_name ?? "").trim();
    if (!full_name) continue;

    // Checked before anything else because it is the one field that cannot be
    // corrected afterwards. The date decides where the student falls in their
    // intake's running order, the Student ID is built from that place, and
    // nothing renumbers an issued ID. A row whose date cannot be read is left
    // out and named, rather than quietly stamped with today.
    const rawDate = (r.registration_date ?? "").trim();
    const dateProblem = registrationDateError(rawDate);
    if (dateProblem) {
      badDate.push(`${full_name}: "${rawDate}" — ${dateProblem}`);
      continue;
    }
    const day = rawDate || karachiToday();
    if (!rawDate) datedToday += 1;

    // The country is required here, unlike in the lead import. A registered
    // student without a destination gets no student code and cannot have an
    // application created — importing them would produce a record that looks
    // fine in the list and fails at every next step.
    const primaryRaw = (r.country_of_interest ?? "").trim();
    if (!primaryRaw) {
      noCountry.push(full_name);
      continue;
    }
    const primary = resolveDestination(primaryRaw, allDestinations);
    if (!primary) {
      badCountry.push(`${full_name}: "${primaryRaw}"`);
      continue;
    }
    if (primary.status === "inactive") {
      pausedCountry.push(`${full_name}: "${primaryRaw}"`);
      continue;
    }

    // Several backups are accepted from a hand-typed cell, though the
    // template's dropdown offers one.
    const backups: string[] = [];
    for (const raw of splitCountries(r.backup_country)) {
      const match = resolveDestination(raw, allDestinations);
      if (!match) {
        badCountry.push(`${full_name}: backup "${raw}"`);
        continue;
      }
      if (match.status === "inactive") {
        pausedCountry.push(`${full_name}: backup "${raw}"`);
        continue;
      }
      if (match.id !== primary.id && !backups.includes(match.id)) backups.push(match.id);
    }

    let assigned_counselor_id: string | null = null;
    const counselorRaw = (r.assigned_counselor ?? "").trim();
    if (counselorRaw) {
      const found = counselorByName.get(counselorRaw.toLowerCase());
      if (!found) {
        // Reported, not fatal: losing the student over a misspelled staff name
        // would be worse than importing them unassigned, which staff can fix
        // in one click from the students list.
        unknownCounselor.push(`${full_name}: "${counselorRaw}"`);
      } else if (found.length > 1) {
        ambiguousCounselor.push(counselorRaw);
      } else {
        assigned_counselor_id = found[0];
      }
    }

    prepared.push({
      primary: primary.id,
      backups,
      day,
      lead: {
        full_name,
        contact_number: phoneError(r.contact_number) ? null : r.contact_number || null,
        email: r.email || null,
        current_qualification: r.current_qualification || null,
        level_applying_for: ["bachelors", "masters", "phd"].includes(r.level_applying_for ?? "")
          ? r.level_applying_for
          : null,
        course_of_interest: r.course_of_interest || null,
        // The legacy free-text column keeps the RESOLVED name, so the students
        // list shows "Italy (Public)" rather than whatever was typed.
        country_of_interest: primary.display_name,
        intake: (r.intake ?? "").trim() || null,
        assigned_counselor_id,
        // A bad DOB in a spreadsheet is dropped rather than failing the whole
        // import — the row still carries a name and contact details worth having.
        date_of_birth: dateOfBirthError(r.date_of_birth) ? null : r.date_of_birth || null,
        address: r.address || null,
        home_phone: phoneError(r.home_phone) ? null : r.home_phone || null,
        status: "registered" as const,
        // See registerStudentManually's comment — handle_lead_registration()
        // only stamps this on UPDATE, not INSERT, so it must be set explicitly
        // or these rows would never satisfy the students view's filter.
        //
        // The day from the sheet, not the day of the import. This is what lets
        // a previous intake be imported with the dates it actually happened
        // on, and what the Month column and the month/year filters on the
        // registered-students table then read.
        registered_at: registrationTimestamp(day),
      },
    });
  }

  if (prepared.length === 0) {
    const reasons = [
      badCountry.length ? `${badCountry.length} with a country that could not be matched` : "",
      pausedCountry.length ? `${pausedCountry.length} for a country we have paused` : "",
      noCountry.length ? `${noCountry.length} with no country` : "",
      badDate.length ? `${badDate.length} with a registration date that could not be read` : "",
    ].filter(Boolean).join(", ");
    return {
      error: `No rows could be imported${reasons ? ` — ${reasons}` : ""}. full_name and country_of_interest are both required.`,
      badDate,
    };
  }

  // No unique constraint on leads.email — without this check, re-uploading
  // the same (or an overlapping) file would silently create duplicate
  // student records every time.
  const { data: existing } = await supabase.from("leads").select("email").not("email", "is", null);
  const existingEmails = new Set((existing ?? []).map((e) => (e.email as string).toLowerCase()));
  const seenInFile = new Set<string>();
  const toInsert: Prepared[] = [];
  let duplicates = 0;
  for (const p of prepared) {
    const email = (p.lead.email as string | null)?.toLowerCase() ?? null;
    if (email && (existingEmails.has(email) || seenInFile.has(email))) {
      duplicates += 1;
      continue;
    }
    if (email) seenInFile.add(email);
    toInsert.push(p);
  }

  if (toInsert.length === 0) {
    return { error: "Every row's email already matches an existing student — nothing new to import." };
  }

  // Earliest registration first. The place in the agency-wide running order is
  // taken row by row as the batch inserts (0260's before-insert trigger), so
  // insertion order IS the order these students are numbered in. A sheet typed
  // in whatever order the files came to hand would otherwise hand out Student
  // IDs in that order rather than by registration date.
  const ordered = byRegistrationDate(toInsert, (p) => p.day);

  const { data: inserted, error } = await supabase
    .from("leads")
    .insert(ordered.map((p) => p.lead))
    .select("id, full_name, email");
  if (error) return { error: error.message };

  // Destinations, which is what makes the student code get stamped.
  //
  // The primaries go in as their own statement, BEFORE any backup. The
  // stamping trigger fires per row and reads whichever destinations exist at
  // that moment, so a backup landing first would have the code built from the
  // backup country. Ordering within one multi-row insert is not something to
  // rely on, hence two statements.
  const byIndex = inserted ?? [];
  const primaries = ordered
    .map((p, i) => (byIndex[i] ? { lead_id: byIndex[i].id, destination_id: p.primary, is_backup: false } : null))
    .filter((r): r is { lead_id: string; destination_id: string; is_backup: boolean } => r !== null);

  let destinationWarning: string | null = null;
  if (primaries.length > 0) {
    const { error: primaryError } = await supabase.from("lead_destinations").insert(primaries);
    if (primaryError) {
      // The students exist; say so rather than implying nothing happened.
      destinationWarning = `the students were created but their countries could not be saved (${primaryError.message}), so no Student IDs were issued`;
    }
  }

  if (!destinationWarning) {
    const backupRows = ordered.flatMap((p, i) =>
      byIndex[i] ? p.backups.map((destination_id) => ({ lead_id: byIndex[i].id, destination_id, is_backup: true })) : []
    );
    if (backupRows.length > 0) {
      const { error: backupError } = await supabase.from("lead_destinations").insert(backupRows);
      if (backupError) destinationWarning = `backup countries could not be saved (${backupError.message})`;
    }
  }

  // Spread the batch across the team rather than giving one officer all of
  // them, which is what assigning each in isolation would do.
  await assignProcessingOfficers(byIndex.map((r) => r.id));

  // Report the codes actually issued rather than assuming the trigger ran.
  const { count: coded } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .in("id", byIndex.map((r) => r.id))
    .not("student_code", "is", null);

  // The rest are registered, hold their place in the running order, and are
  // waiting on an intake before a Student ID can name one. Their portal stays
  // shut until then, so this is not a detail to leave to somebody noticing a
  // blank column later.
  const awaitingIntake = byIndex.length - (coded ?? 0);

  revalidatePath("/students");
  return {
    success: true,
    count: toInsert.length,
    skipped: duplicates,
    coded: coded ?? 0,
    awaitingIntake,
    datedToday,
    badDate,
    exampleRows,
    badCountry,
    pausedCountry,
    noCountry,
    unknownCounselor,
    ambiguousCounselor: [...new Set(ambiguousCounselor)],
    destinationWarning,
  };
}

export async function registerStudentManually(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Name is required." };

  const contact_number = String(formData.get("contact_number") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const current_qualification = String(formData.get("current_qualification") ?? "").trim() || null;
  const level_applying_for = String(formData.get("level_applying_for") ?? "") || null;
  const course_of_interest = String(formData.get("course_of_interest") ?? "").trim() || null;
  const selection = parseDestinationSelection(formData);
  if ("error" in selection) return selection;
  const assigned_counselor_id = String(formData.get("assigned_counselor_id") ?? "") || null;
  const intake = String(formData.get("intake") ?? "").trim() || null;

  // Which service (0279). Only a Super Admin or processing may register a
  // student for the visa service alone; the database refuses anyone else, so
  // this says it in words before the insert rather than after it fails.
  const service_type = serviceOf(formData.get("service_type"));
  if (service_type !== "full") {
    const { staff } = await getStaffSession();
    if (!canSetService(staff)) {
      return { error: "Only a Super Admin or the processing team can register a student for the visa service only." };
    }
  }

  // A registered student needs a country, for the same reason the import now
  // requires one: the student code is stamped from the primary destination, and
  // the new-application form only offers countries the student is registered
  // for. Without it they appear in the students list with a blank Student ID
  // and cannot be applied for — which is how one real record ended up needing
  // repair by hand.
  if (!selection.primaryDestinationId) {
    return { error: "Choose the primary country — it issues the Student ID and is what applications are created against." };
  }

  const phoneIssue = phoneError(contact_number);
  if (phoneIssue) return { error: phoneIssue };

  const duplicate = await findDuplicateLead(supabase, email, contact_number);
  if (duplicate) return { error: duplicateLeadError(duplicate) };

  // See createLead's comment above — inserting without .select() avoids the
  // RETURNING+RLS interaction that otherwise rejects this insert for any
  // role not directly covered by leads_select's tuple-local clauses.
  const id = crypto.randomUUID();
  const { error } = await supabase.from("leads").insert({
    id,
    full_name,
    contact_number,
    email,
    current_qualification,
    level_applying_for,
    course_of_interest,
    // The PRIMARY country only, not a comma-joined list of primary plus
    // backups. The students list already has its own Backup Country column
    // fed from lead_destinations, so including them here duplicated that and
    // turned the Country filter into combined strings — "Italy (Public),
    // Germany (Public)" became its own filter option, matching one student.
    // It also now agrees with what the spreadsheet import writes.
    country_of_interest: selection.primaryDestinationName,
    assigned_counselor_id,
    intake,
    // Only when it is not the default, so a form without the field — and a
    // role the trigger would refuse it from — writes exactly what it did.
    ...(service_type === "full" ? {} : { service_type }),
    status: "registered",
    // handle_lead_registration() only stamps this on UPDATE (status
    // transitioning into 'registered'), not on INSERT — without it here,
    // this row would never satisfy the students view's `registered_at is
    // not null` filter and would silently never appear as a student.
    registered_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };

  const destinationRows = destinationSelectionRows(id, selection);
  if (destinationRows.length > 0) {
    await supabase.from("lead_destinations").insert(destinationRows);
  }

  // A visa-only client already has their admission: its stages are done.
  if (service_type === "visa_only") await applyVisaOnlyStages(id);

  // The counselor keeps the relationship; the Processing Team takes the work.
  // Before the notice, so the mail names the officer it has just assigned.
  await assignProcessingOfficers([id]);
  await ensureCommissionForStudent(id);
  await notifyAssignedStaff(id);

  revalidatePath("/students");
  // Same reasoning as registerLead: this form only captures a handful of
  // lead-level fields, none of the registration-specific ones (DOB,
  // address, home phone, emergency contact, ...) — send staff straight to
  // the Profile tab to finish the rest.
  redirect(`/students/${id}/profile`);
}

export async function updateRegistrationStatus(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const registration_status = String(formData.get("registration_status") ?? "");
  if (!["registered", "withdrawn", "ghost"].includes(registration_status)) {
    return { error: "Choose a valid registration status." };
  }

  const { error } = await supabase.from("leads").update({ registration_status }).eq("id", studentId);
  if (error) return { error: error.message };

  // A registered student earns their counselor a commission. It used to have
  // to be typed in by hand on the Staff Commission page, so a student nobody
  // remembered simply never earned one. Quiet when it cannot be priced yet —
  // Payroll lists those with the reason, which is where they can be acted on.
  if (registration_status === "registered") {
    await assignProcessingOfficers([studentId]);
    await ensureCommissionForStudent(studentId);
  }

  // Stopping used to be a dead end: the status changed, the student left
  // everyone's attention, and nothing prompted anybody to try again. Now a
  // ghosted student puts a chase on their counsellor's list and a withdrawn
  // one a win-back, the two swap over if the status does, and coming back
  // closes whichever was open — so nobody chases a student who is already
  // back, and nobody forgets one who is not.
  await syncStudentFollowUpTask(studentId);

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
  revalidatePath("/calendar");
  return { success: true };
}

export async function updateLeadStatus(leadId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const status = String(formData.get("status") ?? "");
  const remark = String(formData.get("remark") ?? "").trim();

  if (!LEAD_STATUSES.includes(status as never)) {
    return { error: "Choose a valid status." };
  }
  if (!remark) {
    return { error: "A remark is required for every status update (call log)." };
  }

  // Single security-definer RPC — the call log entry and the status change
  // commit or fail together (see migration 0089), rather than as two
  // separate client-side writes that could disagree if the second one failed.
  const { error } = await supabase.rpc("update_lead_status", { p_lead_id: leadId, p_status: status, p_remark: remark });
  if (error) return { error: error.message };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { success: true };
}

export async function reassignLead(leadId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const assigned_counselor_id = String(formData.get("assigned_counselor_id") ?? "") || null;

  const { error } = await supabase.from("leads").update({ assigned_counselor_id }).eq("id", leadId);
  if (error) return { error: error.message };

  // A counselor handed a student is told so. Does nothing for a lead that has
  // not registered, and nothing twice for a person already told about them.
  await notifyAssignedStaff(leadId);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { success: true };
}

export async function updateRegistrationDetails(studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const selection = parseDestinationSelection(formData);
  if ("error" in selection) return selection;
  const assigned_counselor_id = String(formData.get("assigned_counselor_id") ?? "") || null;
  const processing_officer_id = String(formData.get("processing_officer_id") ?? "") || null;
  const intake = String(formData.get("intake") ?? "").trim() || null;
  const discount_amount = formData.get("discount_amount") ? Number(formData.get("discount_amount")) : null;
  const discount_reason = String(formData.get("discount_reason") ?? "").trim() || null;
  const hasNewSelection = Boolean(selection.primaryDestinationId) || selection.backupDestinationIds.length > 0;

  // The registration date, when the form posts one (it always does now; an
  // older form open in a tab does not, and leaves the date alone). Stored at
  // midday Karachi, the same as the import, so the day never slips across a
  // month edge in the students list. Only written when it changed, so saving
  // the card for anything else keeps the exact moment registration was done.
  let registeredAt: string | null = null;
  if (formData.has("registration_date")) {
    const { registrationDateError, registrationTimestamp } = await import("@/lib/registrationDate");
    const day = String(formData.get("registration_date") ?? "").trim();
    if (!day) return { error: "Give the date the student registered." };
    const problem = registrationDateError(day);
    if (problem) return { error: problem };
    const { data: current } = await supabase.from("leads").select("registered_at").eq("id", studentId).maybeSingle();
    const currentDay = current?.registered_at
      ? new Date(current.registered_at as string).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" })
      : null;
    if (day !== currentDay) registeredAt = registrationTimestamp(day);
  }

  // Which service they are registered for (0279) — posted only by the form a
  // Super Admin or processing sees. Checked here as well as by the database,
  // so a refusal is a sentence rather than a Postgres error.
  let serviceChange: ServiceType | null = null;
  if (formData.has("service_type")) {
    const next = serviceOf(formData.get("service_type"));
    const { data: current } = await supabase.from("leads").select("service_type").eq("id", studentId).maybeSingle();
    if (serviceOf(current?.service_type) !== next) {
      const { staff } = await getStaffSession();
      if (!canSetService(staff)) return { error: "Only a Super Admin or the processing team can change which service a student is registered for." };
      serviceChange = next;
    }
  }

  // Older records may predate lead_destinations and only carry the legacy
  // country_of_interest text — the picker then starts with nothing selected.
  // Only touch destinations/country_of_interest when the form actually has a
  // destination selection, or this student already had real lead_destinations
  // rows (an explicit "clear everything" submit) — never silently wipe the
  // legacy text field just because the widget started empty.
  const { data: existingDestinations } = await supabase
    .from("lead_destinations")
    .select("destination_id, dashboard_stage_values")
    .eq("lead_id", studentId);
  const hadExistingDestinations = (existingDestinations?.length ?? 0) > 0;

  if (hasNewSelection || hadExistingDestinations) {
    const { error: delErr } = await supabase.from("lead_destinations").delete().eq("lead_id", studentId);
    if (delErr) return { error: delErr.message };
    // The rows are replaced, so a country that is still selected takes its
    // stage progress with it. Without this, saving this card — to correct an
    // intake or a discount — wiped every country stage processing had
    // recorded. Every row carries the key, so the batch stays rectangular.
    const progress = new Map((existingDestinations ?? []).map((d) => [d.destination_id as string, d.dashboard_stage_values ?? {}]));
    const destinationRows = destinationSelectionRows(studentId, selection).map((row) => ({
      ...row,
      dashboard_stage_values: progress.get(row.destination_id) ?? {},
    }));
    if (destinationRows.length > 0) {
      const { error: destErr } = await supabase.from("lead_destinations").insert(destinationRows);
      if (destErr) return { error: destErr.message };
    }
  }

  const patch: Record<string, unknown> = { assigned_counselor_id, processing_officer_id, intake, discount_amount, discount_reason };
  if (serviceChange) patch.service_type = serviceChange;
  if (registeredAt) patch.registered_at = registeredAt;
  if (hasNewSelection || hadExistingDestinations) {
    // The primary only, matching registerStudentManually and the import. The
    // guard above still decides WHETHER to touch this field at all, so a
    // picker that merely started empty cannot wipe the legacy text.
    patch.country_of_interest = selection.primaryDestinationName;
  }

  const { error } = await supabase.from("leads").update(patch).eq("id", studentId);
  if (error) return { error: error.message };

  // Made visa-only: they already have their admission, so its stages are
  // recorded as done. The checklist drops the admission-only items the next
  // time it is built (ensureStudentDocumentRequirements).
  if (serviceChange === "visa_only") {
    const stages = await applyVisaOnlyStages(studentId);
    if (stages.error) return { error: `Saved, but the admission stages couldn't be marked done: ${stages.error}` };
  }

  // The counselor or the processing officer may have changed in that patch.
  await notifyAssignedStaff(studentId);
  // A country added brings its own steps, which the record may already settle.
  await syncStudentStages(studentId);

  revalidatePath(revalidateTo);
  revalidatePath("/students");
  return { success: true };
}

export async function deleteStudent(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle();
  if (!hasRole(staffRow, "super_admin") && !hasRole(staffRow, "processing"))
    return { error: "Only Super Admin or Processing can delete a lead/student record." };

  const { data: lead } = await supabase.from("leads").select("auth_user_id").eq("id", studentId).maybeSingle();
  const { data: apps } = await supabase.from("applications").select("id").eq("student_id", studentId);
  const appIds = (apps ?? []).map((a) => a.id);

  // partner_document_exchange.student_id has no cascade/FK ON DELETE — detach
  // rather than block the delete, since these files belong to the partner,
  // not the student record being removed.
  await supabase.from("partner_document_exchange").update({ student_id: null }).eq("student_id", studentId);

  // encrypted_credentials has no FK at all (owner_id is generic) — clean up
  // explicitly so deleting the lead doesn't leave orphaned encrypted rows.
  // Must go through the RPC, not a direct delete: the table has no RLS
  // policies of its own by design (see 0012/0076).
  await supabase.rpc("delete_owned_credentials", { p_owner_type: "student", p_owner_id: studentId });
  for (const appId of appIds) {
    await supabase.rpc("delete_owned_credentials", { p_owner_type: "application", p_owner_id: appId });
  }

  const { error } = await supabase.from("leads").delete().eq("id", studentId);
  if (error) return { error: error.message };

  if (lead?.auth_user_id) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(lead.auth_user_id).catch(() => {});
  }

  // Their files, which nothing else was removing.
  //
  // Deleting a student cleaned up the rows, the credentials and the login but
  // left every uploaded document in the bucket for ever — their documents,
  // agreement PDFs and consent recordings, invoice copies, additional-service
  // uploads and profile photo. Production had 47 such folders, 111 files,
  // from students deleted over the project's life. These are passports,
  // transcripts, tax returns and signed agreements, so keeping them after the
  // record has gone is a retention problem rather than just clutter.
  //
  // After the row, never before: if the delete had failed we would have
  // destroyed the files of a student who still existed. Everything a student
  // owns is stored under their id as a prefix, so clearing the prefix catches
  // all of it without having to remember each feature's path column.
  await removeStoragePrefix(supabase, studentId);

  revalidatePath("/students");
  revalidatePath("/leads");
  return { success: true };
}

export async function registerLead(leadId: string, _formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("leads").update({ status: "registered" }).eq("id", leadId);
  if (error) throw new Error(error.message);

  // Registration is what earns the assigned counselor their commission.
  // After the update, not before: registered_at is stamped by
  // handle_lead_registration() on the transition, and the commission is
  // keyed to the month that date falls in.
  await ensureCommissionForStudent(leadId);
  await notifyAssignedStaff(leadId);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/students");
  // Straight to the Profile tab, not the Dashboard — registration only
  // flips status; none of date of birth/address/home phone/emergency
  // contact/passport/etc. get captured by this one-click action, so land
  // staff exactly where those need to be filled in next, not on a
  // Dashboard that still looks empty.
  redirect(`/students/${leadId}/profile`);
}

// Backs the Leads table's "Follow-up" cell. Reuses the existing `reminders`
// table's 'follow_up' type (already in its check constraint) — the Calendar
// page already reads reminders due within the visible range, so adding one
// here surfaces it there automatically with no separate sync step.
//
// Each call inserts a brand-new row rather than overwriting a prior one, so
// a lead can carry a whole log of dated remarks (past and upcoming) instead
// of just the single most-recent one; listLeadFollowUpRemarks below reads
// that whole log back for the "View" panel, and the Calendar shows each row
// as its own reminder (see calendar/page.tsx and ReminderRow.tsx).
export async function addLeadFollowUpRemark(
  leadId: string,
  revalidateTo: string,
  dueDate: string,
  dueTime: string | null,
  note: string
) {
  const supabase = await createClient();

  const trimmedNote = note.trim();
  if (!dueDate) return { error: "A follow-up date is required." };
  if (!trimmedNote) return { error: "A remark is required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("reminders").insert({
    student_id: leadId,
    type: "follow_up",
    due_date: dueDate,
    due_time: dueTime || null,
    note: trimmedNote,
    created_by: user?.id ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  revalidatePath("/calendar");
  return { success: true };
}

export async function listLeadFollowUpRemarks(leadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminders")
    .select("id, due_date, due_time, note, resolved")
    .eq("student_id", leadId)
    .eq("type", "follow_up")
    .order("due_date", { ascending: false });
  if (error) return { error: error.message, remarks: [] };
  return { remarks: data ?? [] };
}

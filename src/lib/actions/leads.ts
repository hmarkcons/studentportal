"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureCommissionForStudent } from "@/lib/actions/commissionAuto";
import { notifyAssignedStaff } from "@/lib/actions/registrationNotice";
import { syncStudentFollowUpTask } from "@/lib/actions/studentFollowUp";
import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUSES } from "@/lib/constants";
import { dateOfBirthError } from "@/lib/dateOfBirth";
import { phoneError, phoneChangeError } from "@/lib/phoneNumber";
import { MAX_UPLOAD_BYTES, fileSizeError } from "@/lib/fileSize";
import { removeStoragePrefix } from "@/lib/storageCleanup";

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

  if (!full_name) {
    return { error: "Name is required." };
  }

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

// Bulk import — CSV columns (header row required): full_name (required),
// contact_number, email, platform_source, current_qualification,
// level_applying_for (bachelors/masters/phd), course_of_interest,
// country_of_interest.
export async function importLeads(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (file) {
    const tooLarge = fileSizeError(file.size, MAX_UPLOAD_BYTES, "file");
    if (tooLarge) return { error: `${tooLarge} A spreadsheet this large is usually a mistake — split it and import in batches.` };
  }
  if (!file || file.size === 0) return { error: "Choose a CSV file first." };

  const { parseCsvWithHeader } = await import("@/lib/csv");
  const text = await file.text();
  const rows = parseCsvWithHeader(text);
  if (rows.length === 0) return { error: "The file has no data rows." };

  const records = rows
    .filter((r) => r.full_name)
    .map((r) => ({
      full_name: r.full_name,
      contact_number: phoneError(r.contact_number) ? null : r.contact_number || null,
      email: r.email || null,
      platform_source: r.platform_source || null,
      current_qualification: r.current_qualification || null,
      level_applying_for: ["bachelors", "masters", "phd"].includes(r.level_applying_for) ? r.level_applying_for : null,
      course_of_interest: r.course_of_interest || null,
      country_of_interest: r.country_of_interest || null,
    }));

  if (records.length === 0) {
    return { error: "No valid rows found — the full_name column is required." };
  }

  const { error } = await supabase.from("leads").insert(records);
  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { success: true, count: records.length };
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
  const file = formData.get("file") as File | null;
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
    const { parseCsvWithHeader } = await import("@/lib/csv");
    rows = parseCsvWithHeader(await file.text());
  }
  if (rows.length === 0) return { error: "The file has no data rows." };

  const exampleRows = rows.filter(isTemplateExampleRow).length;
  rows = rows.filter((r) => !isTemplateExampleRow(r));
  if (rows.length === 0) {
    return { error: "The file holds only the template's example row. Replace it with your students and upload again." };
  }

  const { resolveDestination, splitCountries } = await import("@/lib/destinationMatch");
  const [{ data: destinations }, { data: counselors }] = await Promise.all([
    supabase.from("destinations").select("id, country, display_name, country_code"),
    // Active counsellors only, matching the definition the assignment
    // dropdowns already use (getCachedCounselors) — read directly rather than
    // through the cache so a counsellor added minutes ago is not rejected.
    supabase.from("staff").select("id, full_name").eq("role", "counselor").eq("status", "active"),
  ]);
  const allDestinations = destinations ?? [];
  const counselorByName = new Map<string, string[]>();
  for (const c of counselors ?? []) {
    const key = c.full_name.trim().toLowerCase();
    counselorByName.set(key, [...(counselorByName.get(key) ?? []), c.id]);
  }

  type Prepared = {
    lead: Record<string, unknown>;
    primary: string;
    backups: string[];
  };

  const prepared: Prepared[] = [];
  const badCountry: string[] = [];
  const noCountry: string[] = [];
  const unknownCounselor: string[] = [];
  const ambiguousCounselor: string[] = [];

  for (const r of rows) {
    const full_name = (r.full_name ?? "").trim();
    if (!full_name) continue;

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

    // Several backups are accepted from a hand-typed cell, though the
    // template's dropdown offers one.
    const backups: string[] = [];
    for (const raw of splitCountries(r.backup_country)) {
      const match = resolveDestination(raw, allDestinations);
      if (!match) {
        badCountry.push(`${full_name}: backup "${raw}"`);
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
        registered_at: new Date().toISOString(),
      },
    });
  }

  if (prepared.length === 0) {
    const reasons = [
      badCountry.length ? `${badCountry.length} with a country that could not be matched` : "",
      noCountry.length ? `${noCountry.length} with no country` : "",
    ].filter(Boolean).join(", ");
    return {
      error: `No rows could be imported${reasons ? ` — ${reasons}` : ""}. full_name and country_of_interest are both required.`,
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

  const { data: inserted, error } = await supabase
    .from("leads")
    .insert(toInsert.map((p) => p.lead))
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
  const primaries = toInsert
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
    const backupRows = toInsert.flatMap((p, i) =>
      byIndex[i] ? p.backups.map((destination_id) => ({ lead_id: byIndex[i].id, destination_id, is_backup: true })) : []
    );
    if (backupRows.length > 0) {
      const { error: backupError } = await supabase.from("lead_destinations").insert(backupRows);
      if (backupError) destinationWarning = `backup countries could not be saved (${backupError.message})`;
    }
  }

  // Report the codes actually issued rather than assuming the trigger ran.
  const { count: coded } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .in("id", byIndex.map((r) => r.id))
    .not("student_code", "is", null);

  revalidatePath("/students");
  return {
    success: true,
    count: toInsert.length,
    skipped: duplicates,
    coded: coded ?? 0,
    exampleRows,
    badCountry,
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
    country_of_interest: [selection.primaryDestinationName, ...selection.backupDestinationNames].filter(Boolean).join(", ") || null,
    assigned_counselor_id,
    intake,
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

  // Older records may predate lead_destinations and only carry the legacy
  // country_of_interest text — the picker then starts with nothing selected.
  // Only touch destinations/country_of_interest when the form actually has a
  // destination selection, or this student already had real lead_destinations
  // rows (an explicit "clear everything" submit) — never silently wipe the
  // legacy text field just because the widget started empty.
  const { data: existingDestinations } = await supabase.from("lead_destinations").select("destination_id").eq("lead_id", studentId);
  const hadExistingDestinations = (existingDestinations?.length ?? 0) > 0;

  if (hasNewSelection || hadExistingDestinations) {
    const { error: delErr } = await supabase.from("lead_destinations").delete().eq("lead_id", studentId);
    if (delErr) return { error: delErr.message };
    const destinationRows = destinationSelectionRows(studentId, selection);
    if (destinationRows.length > 0) {
      const { error: destErr } = await supabase.from("lead_destinations").insert(destinationRows);
      if (destErr) return { error: destErr.message };
    }
  }

  const patch: Record<string, unknown> = { assigned_counselor_id, processing_officer_id, intake, discount_amount, discount_reason };
  if (hasNewSelection || hadExistingDestinations) {
    patch.country_of_interest = [selection.primaryDestinationName, ...selection.backupDestinationNames].filter(Boolean).join(", ") || null;
  }

  const { error } = await supabase.from("leads").update(patch).eq("id", studentId);
  if (error) return { error: error.message };

  // The counselor or the processing officer may have changed in that patch.
  await notifyAssignedStaff(studentId);

  revalidatePath(revalidateTo);
  revalidatePath("/students");
  return { success: true };
}

export async function deleteStudent(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  if (staffRow?.role !== "super_admin" && staffRow?.role !== "processing")
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

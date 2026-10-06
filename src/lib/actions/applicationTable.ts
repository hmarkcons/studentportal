"use server";

import { getStaffSession } from "@/lib/auth/session";
import { FEE_TEXT_MAX, parseFeeText } from "@/lib/applicationFee";
import { EMAILS_MAX, normalizeEmails } from "@/lib/catalogueText";
import { clearFinalizedStages, syncStudentStages } from "@/lib/autoStagesSync";
import { refuseFinalizedStageByHand } from "@/lib/finalizedStageGuard";
import { normalizeRemark, remarkChanged, remarkError } from "@/lib/leadRemarks";

/** What a cell of the applications table edits. */
export type ApplicationCell =
  | "stage"
  | "program"
  | "round"
  | "deadline"
  | "intake"
  | "fee"
  | "requirements"
  | "finalized"
  | "portal_link"
  | "page_link"
  | "requirements_link"
  | "coordinator_email"
  | "university_email";

type Result = { success: true } | { error: string };

const PROGRAM_LINK: Partial<Record<ApplicationCell, "application_portal_link" | "page_link" | "requirements_link" | "coordinator_email">> = {
  portal_link: "application_portal_link",
  page_link: "page_link",
  requirements_link: "requirements_link",
  coordinator_email: "coordinator_email",
};

/**
 * Saves one cell of the staff's applications table — one column of one
 * application, so two people editing different cells of the same row do not
 * overwrite each other — under the same rules as the application's own page:
 * a finalised application's programme is fixed, a programme must be its
 * university's, a round its programme's, only one application finalised to an
 * intake, a fee read as an amount or words.
 *
 * Answers without the page: the table shows what was saved and reads itself
 * again behind it (a revalidatePath here would have Next render the whole
 * list into the answer first). Every write is read back, because an update
 * RLS refuses matches nothing and says nothing.
 */
export async function saveApplicationCell(applicationId: string, cell: ApplicationCell, value: string | boolean | null): Promise<Result> {
  const { supabase, staff } = await getStaffSession();
  if (!staff || staff.status !== "active") return { error: "You are signed out — reload the page." };

  const { data: app } = await supabase
    .from("applications")
    .select("id, student_id, university_id, program_id, round_id, is_finalized, cycle_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return { error: "That application is no longer there — reload the page." };
  const text = typeof value === "string" ? value.trim() : "";

  const update = async (patch: Record<string, unknown>): Promise<Result> => {
    const { data, error } = await supabase.from("applications").update(patch).eq("id", applicationId).select("id");
    if (error) {
      if (error.code === "23505") return { error: "This student already has that programme in that intake round at this university." };
      return { error: error.message };
    }
    if (!data?.length) return { error: "Not saved — you may not change this application." };
    return { success: true };
  };

  switch (cell) {
    case "stage": {
      if (!text) return { error: "Choose a stage." };
      const refused = await refuseFinalizedStageByHand(supabase, applicationId, text);
      if (refused) return { error: refused.error };
      const r = await update({ current_stage: text });
      // A submitted application puts the country's Admission in process, and so on.
      if ("success" in r) await syncStudentStages(app.student_id as string);
      return r;
    }

    case "program": {
      const programId = text || null;
      if (programId === app.program_id) return { success: true };
      if (app.is_finalized) return { error: "This application is finalised for the visa, so its programme is fixed. Un-finalise it first." };
      let roundId = app.round_id as string | null;
      if (programId) {
        const { data: program } = await supabase.from("programs").select("university_id").eq("id", programId).maybeSingle();
        if (!program) return { error: "That programme no longer exists — reload the page." };
        if (program.university_id !== app.university_id) return { error: "That programme belongs to a different university. Add a separate application for it." };
      }
      // A round belongs to a programme: the old one's goes with it.
      if (roundId) {
        const { data: round } = await supabase.from("program_intake_rounds").select("program_id").eq("id", roundId).maybeSingle();
        if (!round || round.program_id !== programId) roundId = null;
      }
      return update({ program_id: programId, round_id: roundId });
    }

    case "round": {
      const roundId = text || null;
      if (roundId) {
        if (!app.program_id) return { error: "Choose the programme first — a round belongs to one." };
        const { data: round } = await supabase.from("program_intake_rounds").select("program_id").eq("id", roundId).maybeSingle();
        if (!round || round.program_id !== app.program_id) return { error: "That round is not one of this programme's — reload the page." };
      }
      return update({ round_id: roundId });
    }

    case "deadline": {
      if (text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: "Give the deadline as a date." };
      return update({ deadline: text || null });
    }

    case "intake":
      return update({ intake: text || null });

    case "fee": {
      const fee = parseFeeText(text);
      if (fee.text !== null && fee.text.length > FEE_TEXT_MAX) return { error: `Keep the application fee to ${FEE_TEXT_MAX} characters.` };
      // A currency only beside a fee. "€30" says euros; "30" keeps the currency on file, or the
      // database fills it from the programme, university or country (0287).
      if (fee.text === null) return update({ application_fee: null, application_fee_currency: null });
      return update({ application_fee: fee.text, ...(fee.symbolCurrency ? { application_fee_currency: fee.symbolCurrency } : {}) });
    }

    case "requirements":
      return update({ special_requirements: text || null });

    case "finalized": {
      if (value === true) {
        // One finalised to an intake, enforced by the function (0091, 0116).
        const { error } = await supabase.rpc("finalize_application", { p_application_id: applicationId, p_student_id: app.student_id });
        if (error) return { error: error.message };
        await syncStudentStages(app.student_id as string);
        return { success: true };
      }
      const r = await update({ is_finalized: false });
      if ("success" in r) await clearFinalizedStages(app.student_id as string);
      return r;
    }

    case "university_email": {
      const emails = normalizeEmails(text || null);
      if (emails && emails.length > EMAILS_MAX) return { error: `Keep the university email to ${EMAILS_MAX} characters.` };
      const { data, error } = await supabase.from("universities").update({ contact_email: emails }).eq("id", app.university_id).select("id");
      if (error) return { error: error.message };
      return data?.length ? { success: true } : { error: "Only a Super Admin can change a university's email — it is the university's, for every student." };
    }

    default: {
      const column = PROGRAM_LINK[cell];
      if (!column) return { error: "That column cannot be changed here." };
      if (!app.program_id) return { error: "Choose the programme first — this is the programme's." };
      const cleaned = column === "coordinator_email" ? normalizeEmails(text || null) : text || null;
      if (column === "coordinator_email" && cleaned && cleaned.length > EMAILS_MAX) return { error: `Keep the coordinator email to ${EMAILS_MAX} characters.` };
      const { data, error } = await supabase.from("programs").update({ [column]: cleaned }).eq("id", app.program_id).select("id");
      if (error) return { error: error.message };
      return data?.length ? { success: true } : { error: "Only a Super Admin can change a programme's links — they are the programme's, for every student." };
    }
  }
}

/**
 * Puts one student's applications in an intake in the order given — the
 * table's priority arrows — numbered in tens, as reorderApplications does,
 * without rendering the page into the answer.
 *
 * The ids come from the browser, so they are checked first: every one this
 * student's, and RLS letting this viewer see it.
 */
export async function saveApplicationOrder(studentId: string, orderedIds: string[]): Promise<Result> {
  const { supabase, staff } = await getStaffSession();
  if (!staff || staff.status !== "active") return { error: "You are signed out — reload the page." };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { error: "Nothing to reorder." };
  if (new Set(orderedIds).size !== orderedIds.length) return { error: "That order listed the same application twice." };
  const { data: owned, error } = await supabase.from("applications").select("id").eq("student_id", studentId).in("id", orderedIds);
  if (error) return { error: error.message };
  if ((owned ?? []).length !== orderedIds.length) {
    return { error: "That order refers to an application that isn't this student's — reload and try again." };
  }
  for (const [index, id] of orderedIds.entries()) {
    const { data, error: writeError } = await supabase
      .from("applications")
      .update({ sort_order: (index + 1) * 10 })
      .eq("id", id)
      .eq("student_id", studentId)
      .select("id");
    if (writeError) return { error: writeError.message };
    if (!data?.length) return { error: "Not saved — you may not change these applications." };
  }
  return { success: true };
}

export type ApplicationRemarkVersion = { id: string; body: string; createdAt: string; writtenBy: string | null };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Every version of an application's remark, newest first, with who wrote each (0319). */
export async function listApplicationRemarks(applicationId: string): Promise<{ versions: ApplicationRemarkVersion[] } | { error: string }> {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };
  const { data, error } = await supabase
    .from("application_remarks")
    .select("id, body, created_at, author:staff!application_remarks_written_by_fkey(full_name)")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error) return { error: error.message };
  return {
    versions: (data ?? []).map((v) => ({
      id: v.id as string,
      body: v.body as string,
      createdAt: v.created_at as string,
      writtenBy: (one(v.author as never) as { full_name?: string } | null)?.full_name ?? null,
    })),
  };
}

/**
 * Saves an application's remark as a new version — the old one is kept — and
 * returns it. Empty clears it, as a version of its own; the same words again
 * write nothing. Staff-only: it is not on `applications`, which the student
 * can read (0319).
 */
export async function saveApplicationRemark(
  applicationId: string,
  raw: string
): Promise<{ success: true; remark: string | null; version: ApplicationRemarkVersion | null } | { error: string }> {
  const { supabase, staff } = await getStaffSession();
  if (!staff || staff.status !== "active") return { error: "You are signed out — reload the page." };
  const invalid = remarkError(raw);
  if (invalid) return { error: invalid };
  const body = normalizeRemark(raw);
  const [{ data: app }, { data: current }] = await Promise.all([
    supabase.from("applications").select("id").eq("id", applicationId).maybeSingle(),
    supabase.from("application_remark_current").select("body").eq("application_id", applicationId).maybeSingle(),
  ]);
  if (!app) return { error: "That application is not one you can open." };
  if (!remarkChanged((current?.body as string | null) ?? null, body)) return { success: true, remark: body || null, version: null };
  const { data: saved, error } = await supabase
    .from("application_remarks")
    .insert({ application_id: applicationId, body, written_by: staff.id })
    .select("id, body, created_at")
    .single();
  if (error || !saved) return { error: error?.message ?? "The remark was not saved." };
  return {
    success: true,
    remark: body || null,
    version: { id: saved.id as string, body: saved.body as string, createdAt: saved.created_at as string, writtenBy: staff.full_name ?? null },
  };
}

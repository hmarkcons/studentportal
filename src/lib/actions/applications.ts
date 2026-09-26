"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureCurrentCycleId } from "@/lib/ensureCycle";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * The intake this student is currently working towards.
 *
 * Null for a student with no cycle at all — a lead whose applications predate
 * 0180 — which reads as "the first attempt" everywhere it is used, so nothing
 * has to be backfilled before an application can be added.
 */
async function currentCycleId(supabase: Db, studentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("student_cycles")
    .select("id")
    .eq("student_id", studentId)
    .eq("is_current", true)
    .maybeSingle();
  // Creating it if it does not exist yet, so the very first application a
  // student ever gets is already filed under an intake.
  return data?.id ?? (await ensureCurrentCycleId(studentId));
}

export async function createApplication(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const university_id = String(formData.get("university_id") ?? "");
  const intake = String(formData.get("intake") ?? "").trim() || null;
  const deadline = String(formData.get("deadline") ?? "") || null;

  // Each programme slot on the form carries its own round, so the two lists
  // are paired by index. They have to be zipped BEFORE the empty slots are
  // dropped: filtering program_ids on its own would shift the remaining
  // round_ids up and attach a round to the wrong programme.
  const rawProgramIds = formData.getAll("program_ids").map(String);
  const rawRoundIds = formData.getAll("round_ids").map(String);
  const picks = rawProgramIds
    .map((program_id, i) => ({ program_id, round_id: (rawRoundIds[i] ?? "").trim() || null }))
    .filter((p) => p.program_id);

  if (!university_id) return { error: "Choose a university." };

  const { data: university } = await supabase.from("universities").select("status, destination_id").eq("id", university_id).maybeSingle();
  if (!university || university.status !== "active") {
    return { error: "This university is inactive — applications can't be added for it." };
  }

  // Which attempt this belongs to. A student going round a second time must
  // not have their new applications filed under the intake that ended, or the
  // previous-intake tab starts filling up with this year's work.
  const cycle_id = await currentCycleId(supabase, studentId);

  // Every programme has to actually be one of this university's. The edit form
  // has always checked this and the create path never did — it only checked
  // that the university was active. Worth closing now that the form submits
  // the programme ids explicitly: a stale selection reaches the server as a
  // real id rather than being dropped by the browser.
  if (picks.length > 0) {
    const { data: chosenPrograms } = await supabase
      .from("programs")
      .select("id, university_id")
      .in("id", picks.map((p) => p.program_id));
    const universityByProgram = new Map((chosenPrograms ?? []).map((p) => [p.id, p.university_id]));
    if (picks.some((p) => universityByProgram.get(p.program_id) !== university_id)) {
      return { error: "One of those programmes isn't at the university selected — reload the page and pick again." };
    }
  }

  // A round has to belong to the programme it is filed against. The composite
  // foreign key in 0233 enforces it, but that surfaces as a constraint name, so
  // it is checked here to say something a person can act on. A mismatch means
  // the page was stale, so "reload" is the actionable part.
  const chosenRoundIds = picks.map((p) => p.round_id).filter((id): id is string => Boolean(id));
  if (chosenRoundIds.length > 0) {
    const { data: validRounds } = await supabase
      .from("program_intake_rounds")
      .select("id, program_id")
      .in("id", chosenRoundIds);
    const programByRound = new Map((validRounds ?? []).map((r) => [r.id, r.program_id]));
    const mismatch = picks.find((p) => p.round_id && programByRound.get(p.round_id) !== p.program_id);
    if (mismatch) {
      return { error: "One of the intake rounds doesn't belong to the programme it was chosen for — reload the page and pick again." };
    }
  }

  const rows = (picks.length > 0 ? picks : [{ program_id: null, round_id: null }]).map((pick) => ({
    student_id: studentId,
    university_id,
    program_id: pick.program_id,
    round_id: pick.round_id,
    intake,
    deadline,
    cycle_id,
  }));

  const { data, error } = await supabase.from("applications").insert(rows).select("id");
  if (error) {
    if (error.code === "23505") {
      // Since 0234 the key includes the round, so a clash means the same
      // programme AND the same round — the same programme in a different round
      // is allowed and is the normal way to go again after missing one.
      return {
        error:
          "This student already has an application for one of those programmes in the same intake round. Choose a different round, or a different programme.",
      };
    }
    return { error: error.message };
  }

  // Deliberately seeds nothing.
  //
  // This used to copy the destination's whole document checklist onto every
  // new application, on top of the student-level copy ensureStudentDocumentRequirements
  // already maintains. The same passport and the same transcript were asked
  // for again per university, each row labelled with that university's name,
  // so a student with three applications showed the same document four times
  // over — once properly and three times as university-suffixed noise, in the
  // application checklist and again in the Documents tab.
  //
  // A document is a property of the student, not of the application. The
  // application checklist now carries only what someone deliberately adds to
  // it: a genuine extra that one university asks for, via addDocumentRequirement.
  redirect(`/students/${studentId}/applications/${data[0].id}`);
}

export async function deleteApplication(applicationId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").delete().eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

// Finalizing an application marks it as the one university the student is
// actually pursuing a visa for. Country trackers key their visa fields off it
// (UK's CAS, the US I-20), and it is what the "Finalized for visa" badge
// reports.
export async function finalizeApplication(applicationId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();

  // Single security-definer RPC — clearing every application's flag and
  // setting the target one commit or fail together (see migration 0091),
  // rather than as two separate writes that could leave every application
  // unfinalized if the second one failed.
  //
  // It also enforces "only one finalized at a time" (0116) and surfaces that
  // as the error message below, so the rule can't be sidestepped by calling
  // the RPC directly.
  const { error } = await supabase.rpc("finalize_application", { p_application_id: applicationId, p_student_id: studentId });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function unfinalizeApplication(applicationId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ is_finalized: false }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

/**
 * Edits an existing application.
 *
 * The programme and the intake are editable here as well as the deadline, fee
 * and special requirements. They were not, and a mis-keyed programme could
 * only be corrected by deleting the application and making a new one — which
 * takes its tasks, its document requirements, its interviews and its stage
 * history with it.
 *
 * The university is deliberately not editable. Everything attached to an
 * application — the offer letter, the interviews, the tracker fields — is
 * about that university, and moving the row would silently change what all of
 * it referred to. A different university is a different application.
 */
export async function updateApplicationDetails(applicationId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const deadline = String(formData.get("deadline") ?? "") || null;
  const application_fee = formData.get("application_fee") ? Number(formData.get("application_fee")) : null;
  // Kept only beside a fee. Blank beside one is filled in by the database
  // from the programme, university or country (0287).
  const application_fee_currency =
    application_fee === null ? null : String(formData.get("application_fee_currency") ?? "").trim().toUpperCase() || null;
  const special_requirements = String(formData.get("special_requirements") ?? "").trim() || null;
  const intake = String(formData.get("intake") ?? "").trim() || null;
  // Absent means the field was not offered (a finalised application), which is
  // different from an explicit "no programme chosen".
  const programField = formData.get("program_id");
  const programSubmitted = programField !== null;
  const program_id = String(programField ?? "") || null;
  const roundField = formData.get("round_id");
  const roundSubmitted = roundField !== null;
  const round_id = String(roundField ?? "") || null;

  if (application_fee !== null && (!Number.isFinite(application_fee) || application_fee < 0)) {
    return { error: "An application fee cannot be negative." };
  }
  if (application_fee_currency && !/^[A-Z]{3}$/.test(application_fee_currency)) {
    return { error: `${application_fee_currency} is not a currency code.` };
  }

  const { data: existing } = await supabase
    .from("applications")
    .select("university_id, program_id, round_id, is_finalized")
    .eq("id", applicationId)
    .maybeSingle();
  if (!existing) return { error: "That application no longer exists." };

  const changingProgram = programSubmitted && program_id !== existing.program_id;

  // Finalising is HMARK saying this is the university and programme the visa
  // is being built on, and the country trackers key their visa fields off it.
  // Changing the programme underneath that would leave the visa record
  // describing something else.
  if (changingProgram && existing.is_finalized) {
    return {
      error:
        "This application is finalised for the visa, so its programme is fixed. Un-finalise it first if the programme really has changed.",
    };
  }

  if (changingProgram && program_id) {
    // A programme from another university would make the row describe two
    // different institutions at once.
    const { data: program } = await supabase
      .from("programs")
      .select("university_id")
      .eq("id", program_id)
      .maybeSingle();
    if (!program) return { error: "That programme no longer exists — reload the page." };
    if (program.university_id !== existing.university_id) {
      return { error: "That programme belongs to a different university. Add a separate application for it instead." };
    }
  }

  // The round has to be one of the rounds of whichever programme this
  // application ends up on — the newly chosen one when it is changing, the
  // stored one otherwise.
  const effectiveProgramId = programSubmitted ? program_id : existing.program_id;
  let nextRoundId = roundSubmitted ? round_id : existing.round_id;

  // Losing the programme means losing the round with it: a round belongs to a
  // programme, and the CHECK in 0233 refuses the pair on its own anyway.
  if (!effectiveProgramId) nextRoundId = null;

  if (nextRoundId) {
    const { data: round } = await supabase
      .from("program_intake_rounds")
      .select("program_id")
      .eq("id", nextRoundId)
      .maybeSingle();
    if (!round) {
      // Deleted underneath the open page. Clearing it is right: the round it
      // named genuinely no longer exists, and the database would have nulled
      // it anyway on delete.
      nextRoundId = null;
    } else if (round.program_id !== effectiveProgramId) {
      return {
        error: changingProgram
          ? "That intake round belongs to the previous programme. Reload the page and pick a round for the new one."
          : "That intake round doesn't belong to this application's programme — reload the page and pick again.",
      };
    }
  }

  const { error } = await supabase
    .from("applications")
    .update({
      deadline,
      application_fee,
      application_fee_currency,
      special_requirements,
      intake,
      round_id: nextRoundId,
      ...(programSubmitted ? { program_id } : {}),
    })
    .eq("id", applicationId);
  if (error) {
    // The (student, cycle, university, programme, round) unique index: the
    // student already has this exact application, which is a sentence rather
    // than a constraint name. Round is part of the key since 0234, so this
    // only fires when the round matches too.
    if (error.code === "23505") {
      return {
        error: "This student already has an application for that programme in that intake round at this university.",
      };
    }
    return { error: error.message };
  }

  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
  revalidatePath(`/students/${studentId}/applications`);
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

/**
 * Adds further programmes at the same university as an existing application.
 *
 * The office applies to two or three programmes at one university — a first
 * choice and its backups — and the creation form already handles that with its
 * "+ Add another program" slots, inserting one application row per programme.
 * Afterwards there was no way to add one: you had to go back to New
 * application and re-pick the country and university you were already looking
 * at.
 *
 * The rows are siblings with no ranking, exactly as creation makes them, and
 * they inherit this application's intake and deadline because a backup at the
 * same university is part of the same cycle. Both stay editable per row.
 */
export async function addBackupPrograms(applicationId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  // Zipped by index before anything is dropped, then de-duplicated on the
  // programme. Filtering or de-duplicating program_ids on its own would shift
  // the round_ids beside them and give a programme somebody else's round.
  const rawProgramIds = formData.getAll("program_ids").map(String);
  const rawRoundIds = formData.getAll("round_ids").map(String);
  // De-duplicated on the programme AND the round, not the programme alone.
  // Since 0234 the same programme in two different rounds is two legitimate
  // applications, so collapsing them on the programme would silently drop the
  // second one.
  const seenPair = new Set<string>();
  const picks: { program_id: string; round_id: string | null }[] = [];
  rawProgramIds.forEach((program_id, i) => {
    if (!program_id) return;
    const round_id = (rawRoundIds[i] ?? "").trim() || null;
    const key = `${program_id}__${round_id ?? ""}`;
    if (seenPair.has(key)) return;
    seenPair.add(key);
    picks.push({ program_id, round_id });
  });

  if (picks.length === 0) return { error: "Choose at least one programme to add." };
  const programIds = picks.map((p) => p.program_id);

  const { data: source } = await supabase
    .from("applications")
    .select("university_id, intake, deadline, current_stage, cycle_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!source) return { error: "That application no longer exists." };

  const { data: programs } = await supabase
    .from("programs")
    .select("id, name, university_id")
    .in("id", programIds);
  const wrongUniversity = (programs ?? []).find((p) => p.university_id !== source.university_id);
  if (wrongUniversity) {
    return { error: `${wrongUniversity.name} is at a different university — add it as its own application.` };
  }
  if ((programs ?? []).length !== programIds.length) {
    return { error: "One of those programmes no longer exists — reload the page." };
  }

  // Said plainly before the insert, because a partial failure here would add
  // some rows and report an error about the others.
  //
  // Scoped to this intake. A student re-applying after a refusal is applying
  // to the same programmes again on purpose; last year's row is not a clash.
  const duplicates = supabase
    .from("applications")
    .select("program_id, round_id, program:programs(name), round:program_intake_rounds(label)")
    .eq("student_id", studentId)
    .eq("university_id", source.university_id)
    .in("program_id", programIds);
  const { data: already } = await (source.cycle_id
    ? duplicates.eq("cycle_id", source.cycle_id)
    : duplicates.is("cycle_id", null));

  // Keyed on the pair, matching the index. Flagging on the programme alone
  // would now refuse exactly the thing this is meant to allow: a second
  // application for the same programme in a different round.
  const takenPairs = new Map(
    (already ?? []).map((a) => {
      const name = (one(a.program as never) as { name?: string } | null)?.name ?? "that programme";
      const label = (one(a.round as never) as { label?: string } | null)?.label ?? null;
      return [`${a.program_id}__${a.round_id ?? ""}`, label ? `${name} (${label})` : name];
    })
  );
  const clashes = picks
    .map((p) => takenPairs.get(`${p.program_id}__${p.round_id ?? ""}`))
    .filter((v): v is string => Boolean(v));
  if (clashes.length > 0) {
    return {
      error: `Already applied for ${[...new Set(clashes)].join(", ")} at this university in this intake. The same programme in a different round is fine — pick another round.`,
    };
  }

  // Each round must belong to the programme it was chosen for. Enforced by the
  // composite FK in 0233 too, but that reports a constraint name.
  const roundIds = picks.map((p) => p.round_id).filter((id): id is string => Boolean(id));
  if (roundIds.length > 0) {
    const { data: rounds } = await supabase.from("program_intake_rounds").select("id, program_id").in("id", roundIds);
    const programByRound = new Map((rounds ?? []).map((r) => [r.id, r.program_id]));
    if (picks.some((p) => p.round_id && programByRound.get(p.round_id) !== p.program_id)) {
      return { error: "One of the intake rounds doesn't belong to the programme it was chosen for — reload the page and pick again." };
    }
  }

  const { error } = await supabase.from("applications").insert(
    picks.map(({ program_id, round_id }) => ({
      student_id: studentId,
      university_id: source.university_id,
      program_id,
      round_id,
      intake: source.intake,
      deadline: source.deadline,
      // The same intake as the application it is a backup for.
      cycle_id: source.cycle_id,
      // current_stage is left out on purpose. The stage trigger fills it with
      // the destination's first pipeline stage, which is where a backup starts
      // whatever the first choice has already reached — nobody has submitted
      // it yet.
    }))
  );
  if (error) {
    if (error.code === "23505") {
      return { error: "This student already has an application for one of those programmes in the same intake round." };
    }
    return { error: error.message };
  }

  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
  revalidatePath(`/students/${studentId}/applications`);
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

// The course, requirements and portal links live on the program, and the
// contact address on the university — i.e. in the catalogue, not on this
// application. Editing them here is deliberate (a broken link is noticed while
// working a case, not while browsing Setup) but it is a catalogue edit, and the
// form says so, because the correction lands for every student on that program.
export async function updateApplicationLinks(
  applicationId: string,
  studentId: string,
  programId: string | null,
  universityId: string | null,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();

  const clean = (key: string) => String(formData.get(key) ?? "").trim() || null;
  const page_link = clean("page_link");
  const requirements_link = clean("requirements_link");
  const application_portal_link = clean("application_portal_link");
  const contact_email = clean("contact_email");
  const coordinator_email = clean("coordinator_email");

  // Typing "university.edu/course" and getting a link that resolves against our
  // own domain is worse than no link at all, so require a real scheme.
  for (const [label, value] of [
    ["Course page", page_link],
    ["Requirements", requirements_link],
    ["Application portal", application_portal_link],
  ] as const) {
    if (value && !/^https?:\/\//i.test(value)) return { error: `${label} link must start with http:// or https://` };
  }
  if (contact_email && !contact_email.includes("@")) return { error: "University email doesn't look like an email address." };
  if (coordinator_email && !/^[^@\s]+@[^@\s]+$/.test(coordinator_email)) {
    return { error: "Programme coordinator email doesn't look like an email address." };
  }

  // .select() on each update so a row blocked by RLS comes back as zero rows
  // rather than as a silent success — otherwise a role without catalogue write
  // access is told "Saved." and the old link is still there on reload.
  if (programId) {
    const { data, error } = await supabase
      .from("programs")
      .update({ page_link, requirements_link, application_portal_link, coordinator_email })
      .eq("id", programId)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "You don't have permission to edit this program's links." };
  }

  if (universityId) {
    const { data, error } = await supabase
      .from("universities")
      .update({ contact_email })
      .eq("id", universityId)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "You don't have permission to edit this university's contact email." };
  }

  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
  return { success: true };
}

export async function updateApplicationStage(applicationId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const current_stage = String(formData.get("current_stage") ?? "");
  if (!current_stage) return { error: "Choose a stage." };

  const { error } = await supabase.from("applications").update({ current_stage }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
  return { success: true };
}

export async function addApplicationTask(applicationId: string, studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const description = String(formData.get("description") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "") || null;
  const owner_id = String(formData.get("owner_id") ?? "") || null;
  const priority = String(formData.get("priority") ?? "medium");

  if (!description) return { error: "Description is required." };

  const { error } = await supabase
    .from("application_tasks")
    .insert({ application_id: applicationId, description, due_date, owner_id, priority });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function toggleApplicationTask(taskId: string, revalidateTo: string, done: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("application_tasks").update({ status: done ? "done" : "pending" }).eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateApplicationTask(taskId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const description = String(formData.get("description") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "") || null;
  const priority = String(formData.get("priority") ?? "medium");

  if (!description) return { error: "Description is required." };

  const { error } = await supabase.from("application_tasks").update({ description, due_date, priority }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteApplicationTask(taskId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("application_tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(revalidateTo);
  return { success: true };
}

/**
 * Reorders a student's applications so the list reads in priority order.
 *
 * The list was ordered by created_at, so whichever university happened to be
 * entered first sat at the top forever — the opposite of what staff read it
 * for. Rearranging used to mean deleting an application and making a new one,
 * which takes its tasks, documents, interviews and stage history with it.
 *
 * The ids are client-supplied, so they are checked against this student's own
 * applications before anything is written: a bound argument is not a
 * permission, and a stray id here would renumber somebody else's list.
 */
export async function reorderApplications(studentId: string, orderedIds: string[]) {
  const supabase = await createClient();

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { error: "Nothing to reorder." };
  if (new Set(orderedIds).size !== orderedIds.length) return { error: "That order listed the same application twice." };

  const { data: owned, error: readError } = await supabase
    .from("applications")
    .select("id")
    .eq("student_id", studentId)
    .in("id", orderedIds);
  if (readError) return { error: readError.message };

  // Every id has to be one of this student's, and RLS has to have let us see
  // it. A short list back means one was not ours to move.
  if ((owned ?? []).length !== orderedIds.length) {
    return { error: "That order refers to an application that isn't this student's — reload and try again." };
  }

  // Tens, so a later single move can be written without renumbering the rest.
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await supabase
      .from("applications")
      .update({ sort_order: (index + 1) * 10 })
      .eq("id", id)
      .eq("student_id", studentId);
    if (error) return { error: error.message };
  }

  revalidatePath(`/students/${studentId}/applications`);
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

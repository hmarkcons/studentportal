import { createAdminClient } from "@/lib/supabase/admin";
import { distributeProcessingOfficers, type OfficerLoad } from "@/lib/processingHandoff";

/**
 * Hands newly registered students to the Processing Team.
 *
 * Called from each of the three paths that turn a lead into a registered
 * student — the manual form, the spreadsheet import, and a status change on an
 * existing lead — because a rule that only fires on one of them is a rule that
 * looks implemented and is not.
 *
 * Never overwrites an officer somebody chose. It only fills a gap, so a
 * deliberate assignment always wins over the automatic one, and calling this
 * twice on the same student changes nothing.
 *
 * Runs with the admin client: the counselor doing the registering can read
 * staff rows but has no business reading every officer's caseload, which is
 * what picking the lightest one requires.
 */
export async function assignProcessingOfficers(studentIds: string[]): Promise<{
  assigned: { studentId: string; officerId: string }[];
  reason?: string;
}> {
  if (studentIds.length === 0) return { assigned: [] };
  const admin = createAdminClient();

  // Only those still missing one. Doing this here rather than trusting the
  // caller keeps the "never overwrite" promise true however it is called.
  const { data: unassigned } = await admin
    .from("leads")
    .select("id")
    .in("id", studentIds)
    .is("processing_officer_id", null);
  const needing = (unassigned ?? []).map((r) => r.id as string);
  if (needing.length === 0) return { assigned: [], reason: "all already have an officer" };

  const { data: officers } = await admin
    .from("staff")
    .select("id, full_name")
    .eq("status", "active")
    .contains("roles", ["processing"]);
  if (!officers?.length) {
    // Left unassigned on purpose. The deadline reminders already fall back to
    // the whole team for a student with no officer, so nothing goes unwatched
    // — better than inventing an owner who does not exist.
    return { assigned: [], reason: "no active processing officer to hand to" };
  }

  // Current caseload, counting only registered students: a lead still with a
  // counselor is not yet processing work.
  const { data: held } = await admin
    .from("leads")
    .select("processing_officer_id")
    .not("processing_officer_id", "is", null)
    .eq("registration_status", "registered");

  const counts = new Map<string, number>();
  for (const row of held ?? []) {
    const id = row.processing_officer_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const loads: OfficerLoad[] = officers.map((o) => ({
    id: o.id as string,
    full_name: o.full_name as string,
    students: counts.get(o.id as string) ?? 0,
  }));

  const plan = distributeProcessingOfficers(needing, loads);
  for (const { studentId, officerId } of plan) {
    // Guarded on still being null, so a person assigning by hand at the same
    // moment is not overwritten by this.
    await admin
      .from("leads")
      .update({ processing_officer_id: officerId })
      .eq("id", studentId)
      .is("processing_officer_id", null);
  }

  return { assigned: plan };
}

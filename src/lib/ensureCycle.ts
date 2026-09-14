import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The student's current intake cycle, creating their first one if they have none.
 *
 * Migration 0180 backfilled a cycle for every student who existed when it ran,
 * but nothing creates one at registration — so a student registered after that
 * has no cycle at all. Without this, starting their process again would open
 * sequence 1 and leave the first attempt's applications belonging to no
 * intake, which is precisely the tab that has to hold them.
 *
 * Done lazily rather than in a trigger so it is visible in the code that reads
 * it, and self-healing: any student whose rows predate their cycle is adopted
 * into it the first time anything asks.
 *
 * Runs as the admin client because a student viewing their own portal has no
 * INSERT grant here, and this is bookkeeping rather than user-submitted data —
 * every value it writes is derived from rows the caller can already see.
 */
export type CurrentCycle = { id: string; sequence: number };

/**
 * Returns the cycle, not just its id, because callers must not re-read it.
 *
 * Next.js memoizes identical fetch GETs within one render, and
 * @supabase/supabase-js is built on fetch. A caller that ran this and then
 * issued the same `student_cycles` query got the memoized response from
 * BEFORE the insert — an empty list — and carried on as though the student
 * had no cycle. That is exactly how every document on a re-registering
 * student's first page load ended up stamped with no intake: the cycle was
 * created 0.6s before the documents were inserted, and the insert still saw
 * no cycle. Verified against production.
 */
export async function ensureCurrentCycle(studentId: string): Promise<CurrentCycle | null> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("student_cycles")
    .select("id, sequence, is_current")
    .eq("student_id", studentId)
    .order("sequence");

  const current = (existing ?? []).find((c) => c.is_current) ?? (existing ?? []).at(-1) ?? null;
  if (current) return { id: current.id, sequence: current.sequence };

  // Only a student who is actually in the process. Browsing an unregistered
  // lead should not create bookkeeping for them.
  const [{ data: lead }, { count: appCount }, { count: docCount }] = await Promise.all([
    admin.from("leads").select("registered_at, intake").eq("id", studentId).maybeSingle(),
    admin.from("applications").select("id", { count: "exact", head: true }).eq("student_id", studentId),
    admin.from("student_documents").select("id", { count: "exact", head: true }).eq("student_id", studentId),
  ]);
  if (!lead?.registered_at && (appCount ?? 0) === 0 && (docCount ?? 0) === 0) return null;

  const { data: created, error } = await admin
    .from("student_cycles")
    .insert({
      student_id: studentId,
      sequence: 1,
      intake: lead?.intake ?? null,
      is_current: true,
      decision: "initial",
      started_at: lead?.registered_at ?? new Date().toISOString(),
    })
    .select("id, sequence")
    .single();

  // 23505 is two page loads racing for the same first cycle; the partial
  // unique index on is_current settles it and the other one won.
  if (error) {
    if (error.code !== "23505") throw error;
    const { data: raced } = await admin
      .from("student_cycles")
      .select("id, sequence")
      .eq("student_id", studentId)
      .eq("is_current", true)
      .maybeSingle();
    return raced ? { id: raced.id, sequence: raced.sequence } : null;
  }

  // Adopt anything raised before the cycle existed, so the first intake's tab
  // actually holds the first intake's work.
  await Promise.all([
    admin.from("applications").update({ cycle_id: created.id }).eq("student_id", studentId).is("cycle_id", null),
    admin.from("student_documents").update({ cycle_id: created.id }).eq("student_id", studentId).is("cycle_id", null),
    admin.from("student_scholarships").update({ cycle_id: created.id }).eq("student_id", studentId).is("cycle_id", null),
  ]);

  return { id: created.id, sequence: created.sequence };
}

/** The id alone, for callers that need nothing else. */
export async function ensureCurrentCycleId(studentId: string): Promise<string | null> {
  return (await ensureCurrentCycle(studentId))?.id ?? null;
}

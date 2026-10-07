import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Names for the ids an audit event holds — who did it, whose it is, which
// university, programme, country or template it points at — so the audit log
// reads "Counsellor: Ayesha Khan" rather than a uuid. Each lookup is by id, all
// at once, and an id nothing names is shown as it is.

const NAMED: { table: string; column: string; name: string }[] = [
  { table: "staff", column: "id", name: "full_name" },
  { table: "leads", column: "id", name: "full_name" },
  { table: "universities", column: "id", name: "name" },
  { table: "programs", column: "id", name: "name" },
  { table: "destinations", column: "id", name: "country" },
  { table: "agreement_templates", column: "id", name: "name" },
  { table: "document_templates", column: "id", name: "name" },
  { table: "fee_products", column: "id", name: "name" },
  { table: "scholarship_bodies", column: "id", name: "name" },
];

/** At most this many ids are named in one go: a single row never holds more. */
const MAX_IDS = 300;

export async function nameIds(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const list = [...new Set(ids)].slice(0, MAX_IDS);
  const names = new Map<string, string>();
  if (list.length === 0) return names;
  const results = await Promise.all(
    NAMED.map((n) => supabase.from(n.table).select(`${n.column}, ${n.name}`).in(n.column, list))
  );
  results.forEach((r, i) => {
    const n = NAMED[i];
    for (const row of (r.data ?? []) as unknown as Record<string, unknown>[]) {
      const id = row[n.column];
      const name = row[n.name];
      if (typeof id === "string" && typeof name === "string" && name.trim() && !names.has(id)) names.set(id, name.trim());
    }
  });
  return names;
}

/**
 * Who did something: a staff member by name, a student or a university's own
 * account marked as such. audit_log.actor_id is a sign-in (auth.users), so a
 * student is found by their leads.auth_user_id. No actor is the system itself.
 */
export async function nameActors(supabase: SupabaseClient, actorIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(actorIds.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const [{ data: staffRows }, { data: studentRows }, { data: partnerRows }] = await Promise.all([
    supabase.from("staff").select("id, full_name").in("id", ids),
    supabase.from("leads").select("auth_user_id, full_name").in("auth_user_id", ids),
    supabase.from("partner_university_accounts").select("id, staff_name").in("id", ids),
  ]);
  for (const s of staffRows ?? []) names.set(s.id, s.full_name);
  for (const s of studentRows ?? []) if (s.auth_user_id) names.set(s.auth_user_id, `${s.full_name} (student)`);
  for (const p of partnerRows ?? []) names.set(p.id, `${p.staff_name} (university)`);
  return names;
}

export function actorLabel(names: Map<string, string>, actorId: string | null): string {
  if (!actorId) return "System";
  return names.get(actorId) ?? "Someone no longer in the portal";
}

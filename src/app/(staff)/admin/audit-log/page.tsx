import { createClient } from "@/lib/supabase/server";

export default async function AuditLogPage() {
  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("audit_log")
    .select("id, actor_id, action_type, entity_type, entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  // audit_log.actor_id references auth.users(id) (0035 — not staff(id)
  // alone), since students/partners can trigger audited actions on their
  // own rows (e.g. self-editing their profile). No single FK-embed can
  // resolve a name across staff/leads/partner_university_accounts, so
  // resolve it manually across all three.
  const actorIds = [...new Set((logs ?? []).map((l) => l.actor_id).filter((id): id is string => Boolean(id)))];
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const [{ data: staffRows }, { data: studentRows }, { data: partnerRows }] = await Promise.all([
      supabase.from("staff").select("id, full_name").in("id", actorIds),
      supabase.from("leads").select("auth_user_id, full_name").in("auth_user_id", actorIds),
      supabase.from("partner_university_accounts").select("id, staff_name").in("id", actorIds),
    ]);
    (staffRows ?? []).forEach((s) => actorNames.set(s.id, s.full_name));
    (studentRows ?? []).forEach((s) => { if (s.auth_user_id) actorNames.set(s.auth_user_id, `${s.full_name} (student)`); });
    (partnerRows ?? []).forEach((p) => actorNames.set(p.id, `${p.staff_name} (partner)`));
  }

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Audit Log</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{(l.actor_id && actorNames.get(l.actor_id)) ?? "System"}</td>
                <td className="px-4 py-3">{l.action_type}</td>
                <td className="px-4 py-3">{l.entity_type}</td>
                <td className="px-4 py-3 text-muted">{new Date(l.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {(!logs || logs.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted">
                  No audit events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

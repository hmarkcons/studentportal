import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/catalogueReads";
import { hasRole } from "@/lib/auth/roles";
import { AEO_COLUMNS, compareRecords, type AeoRecord } from "@/lib/aeoCommissions";

/** Super Admin and Finance — fixed, as the table's policies are (0335). */
export function seesAeo(staff: Parameters<typeof hasRole>[0] | undefined): boolean {
  return Boolean(staff) && hasRole(staff ?? null, "super_admin", "finance");
}

/**
 * Every AEO record, in the sheet's order. Paged, because PostgREST stops at a
 * thousand rows without a word, and a register that silently lost its oldest
 * rows would total wrong and export short.
 */
export async function loadAeoRecords(supabase: SupabaseClient): Promise<AeoRecord[]> {
  const rows = await readAll((from, to) =>
    supabase.from("aeo_ielts_commissions").select(AEO_COLUMNS).order("id").range(from, to).returns<(AeoRecord & { updated_at: string })[]>(),
  );
  return rows.map((r) => ({ ...r, commission_amount: Number(r.commission_amount) })).sort(compareRecords);
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The students whose portal sign-in address contains the words, where it is
 * not the email on their record — that one each list searches itself (0327).
 * Only students the viewer may see; nothing for anyone who is not staff.
 */
export async function loginEmailMatches(supabase: SupabaseClient, term: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("staff_search_login_email", { p_term: term });
  if (error || !Array.isArray(data)) return [];
  return (data as unknown[]).map((v) => (typeof v === "string" ? v : String((v as Record<string, unknown>)?.staff_search_login_email ?? ""))).filter(Boolean);
}

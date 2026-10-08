import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStoredLogin } from "@/lib/portalLink";

/**
 * The login page of each saved login, by credential type — for a page to show
 * beside the login and fill its link field in with. Read through the viewer's
 * own session: read_credential lets through only those who may see the login
 * at all. The usernames and passwords read with them go no further than this.
 */
export async function loadLoginLinks(
  supabase: SupabaseClient,
  ownerType: "student" | "application",
  ownerId: string,
  types: readonly string[]
): Promise<Record<string, string>> {
  const pairs = await Promise.all(
    [...new Set(types)].map(async (credentialType) => {
      const { data, error } = await supabase.rpc("read_credential", { p_owner_type: ownerType, p_owner_id: ownerId, p_credential_type: credentialType });
      if (error || !data) return null;
      const link = parseStoredLogin(data as string).link;
      return link ? ([credentialType, link] as const) : null;
    })
  );
  return Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null));
}

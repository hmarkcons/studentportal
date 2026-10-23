"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

// Connecting runs through the OAuth routes (/api/social/oauth/[platform]/...).
// Disconnecting is an ordinary action: it removes the account, and the token
// goes with it (social_account_secrets cascades on delete). The delete is
// remembered in the audit log, so a Super Admin can restore it.
export async function disconnectSocialAccount(accountId: string) {
  const denied = await requirePermission("social.accounts.manage", "You do not have permission to manage social accounts.");
  if (denied) return { error: denied.error };

  const supabase = await createClient();
  const { data, error } = await supabase.from("social_accounts").delete().eq("id", accountId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That account wasn't found, or you can't manage it." };

  revalidatePath("/social/accounts");
  return { success: true };
}

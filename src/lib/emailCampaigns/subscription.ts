import type { SupabaseClient } from "@supabase/supabase-js";

// An address's subscription, found by the private token its email links
// carry. Shared by the preference page, the unsubscribe page, and the
// one-click unsubscribe a mail client sends (RFC 8058).

/** An address token: 18 random bytes, in hex (0355). */
export const ADDRESS_TOKEN = /^[0-9a-f]{36}$/;

export type Topic = { key: string; label: string };

export async function readEmailTopics(admin: SupabaseClient): Promise<Topic[]> {
  const { data } = await admin.from("email_settings").select("topics").eq("id", true).maybeSingle();
  const raw = Array.isArray(data?.topics) ? (data!.topics as unknown[]) : [];
  return raw
    .map((t) => t as { key?: unknown; label?: unknown })
    .filter((t) => typeof t.key === "string" && typeof t.label === "string")
    .map((t) => ({ key: t.key as string, label: t.label as string }));
}

export type AddressRow = { email: string; status: string; topics: string[]; token: string };

export async function addressByToken(admin: SupabaseClient, token: string): Promise<AddressRow | null> {
  if (!ADDRESS_TOKEN.test(token)) return null;
  const { data } = await admin.from("email_contact_status").select("email, status, topics, token").eq("token", token).maybeSingle();
  return (data as AddressRow | null) ?? null;
}

/**
 * Unsubscribes the address a token names, at once. An address already marked
 * as spam, bounced or invalid stays so — the stronger reason. True when the
 * token named an address.
 */
export async function unsubscribeByToken(admin: SupabaseClient, token: string, reason: string): Promise<boolean> {
  const row = await addressByToken(admin, token);
  if (!row) return false;
  if (row.status === "subscribed" || row.status === "suppressed") {
    await admin
      .from("email_contact_status")
      .update({ status: "unsubscribed", status_reason: reason, status_changed_at: new Date().toISOString() })
      .eq("token", token);
  }
  return true;
}

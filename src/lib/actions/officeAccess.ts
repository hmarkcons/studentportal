"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { clientIp, approvalExpiry, approvalDays, ACCESS_PENDING_PATH } from "@/lib/officeAccess";

const SETUP_PAGE = "/setup/office-network";

/**
 * Asks Management for permission to use the portal from here.
 *
 * Written by the staff member themselves, and RLS only lets them write a
 * pending row with none of the columns that grant access — so somebody
 * cannot approve their own request by posting a crafted form.
 */
export async function requestOffsiteAccess(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are signed out — reload the page." };

  const reason = String(formData.get("reason") ?? "").trim() || null;
  const headerList = await headers();

  const { error } = await supabase.from("staff_offsite_access").insert({
    staff_id: user.id,
    requested_ip: clientIp(headerList),
    // Truncated: a user agent string is long and only the gist is useful to
    // whoever decides.
    requested_user_agent: (headerList.get("user-agent") ?? "").slice(0, 300) || null,
    reason,
  });
  if (error) {
    return {
      error: error.message.includes("staff_offsite_access_one_pending")
        ? "You already have a request waiting. Management will see it."
        : error.message,
    };
  }

  revalidatePath(ACCESS_PENDING_PATH);
  revalidatePath(SETUP_PAGE);
  return { success: true };
}

async function decideGate() {
  const denied = await requirePermission(
    "staff.approve_offsite_access",
    "Only Management and Super Admin can approve access from outside the office."
  );
  return denied ? denied.error : null;
}

/** Lets somebody work from outside the office for a set number of days. */
export async function approveOffsiteAccess(requestId: string, days: number) {
  const error = await decideGate();
  if (error) return { error };

  const { staff } = await getStaffSession();
  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("staff_offsite_access")
    .update({
      status: "approved",
      decided_by: staff?.id ?? null,
      decided_at: new Date().toISOString(),
      expires_at: approvalExpiry(approvalDays(days)).toISOString(),
      revoked_at: null,
    })
    .eq("id", requestId);
  if (updateError) return { error: updateError.message };

  revalidatePath(SETUP_PAGE);
  return { success: true, days: approvalDays(days) };
}

export async function denyOffsiteAccess(requestId: string) {
  const error = await decideGate();
  if (error) return { error };

  const { staff } = await getStaffSession();
  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("staff_offsite_access")
    .update({
      status: "denied",
      decided_by: staff?.id ?? null,
      decided_at: new Date().toISOString(),
      expires_at: null,
    })
    .eq("id", requestId);
  if (updateError) return { error: updateError.message };

  revalidatePath(SETUP_PAGE);
  return { success: true };
}

/**
 * Ends an approval before it lapses.
 *
 * Kept separate from denying: denying answers a request that was never
 * granted, revoking takes back one that was, and the two read differently in
 * the history.
 */
export async function revokeOffsiteAccess(requestId: string) {
  const error = await decideGate();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("staff_offsite_access")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", requestId);
  if (updateError) return { error: updateError.message };

  revalidatePath(SETUP_PAGE);
  return { success: true };
}

/**
 * Adds an address or range to the office network.
 *
 * Super Admin only, and not just by permission: office_networks_write checks
 * is_super_admin() in the database too. Adding a row here hands out access to
 * every record in the system.
 */
export async function addOfficeNetwork(_prevState: unknown, formData: FormData) {
  const denied = await requirePermission(
    "staff.approve_offsite_access",
    "Only a Super Admin can change the office network."
  );
  if (denied) return { error: denied.error };

  const label = String(formData.get("label") ?? "").trim();
  const raw = String(formData.get("network") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!label) return { error: "Give it a name, so somebody can tell later what it was." };
  if (!raw) return { error: "Give an address or a range." };

  const { staff } = await getStaffSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("office_networks")
    .insert({ label, network: raw, note, created_by: staff?.id ?? null });
  if (error) {
    // Postgres rejects anything that is not an address or a range; say so in
    // words rather than passing on "invalid input syntax for type cidr".
    if (/invalid input|cidr|inet/i.test(error.message)) {
      return { error: `"${raw}" is not an address or a range. Try 203.0.113.47 or 203.0.113.0/24.` };
    }
    if (error.message.includes("office_networks_network_key")) {
      return { error: "That address or range is already on the list." };
    }
    return { error: error.message };
  }

  revalidatePath(SETUP_PAGE);
  return { success: true };
}

export async function removeOfficeNetwork(networkId: string) {
  const denied = await requirePermission(
    "staff.approve_offsite_access",
    "Only a Super Admin can change the office network."
  );
  if (denied) return { error: denied.error };

  const supabase = await createClient();

  // Removing the last one turns the gate off for everybody. That is the
  // documented behaviour rather than an accident, but it should not happen by
  // surprise, so it is refused and the caller is told to say so explicitly.
  const { count } = await supabase.from("office_networks").select("id", { count: "exact", head: true });
  if ((count ?? 0) <= 1) {
    return {
      error:
        "That is the only network on the list, and removing it switches the off-network gate off for everyone. Add the replacement first.",
    };
  }

  const { error } = await supabase.from("office_networks").delete().eq("id", networkId);
  if (error) return { error: error.message };

  revalidatePath(SETUP_PAGE);
  return { success: true };
}

/**
 * The address this request came from.
 *
 * Read on the server, because the browser cannot see its own public address
 * and asking a third-party service for it would send the office's IP to
 * somebody else.
 */
export async function currentRequestIp(): Promise<string | null> {
  return clientIp(await headers());
}

/**
 * A staff member's own most recent request, and whether it has run out.
 *
 * The "has it lapsed" arithmetic lives here rather than in the waiting
 * screen: reading the clock inside a component body is impure, and this is
 * the kind of thing that wants to be computed once, on the server, at the
 * moment the page is built.
 */
export async function latestAccessRequest(staffId: string): Promise<{
  status: string;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
  lapsed: boolean;
} | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("staff_offsite_access")
    .select("status, created_at, expires_at, revoked_at")
    .eq("staff_id", staffId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const revoked = Boolean(data.revoked_at);
  const expired = Boolean(data.expires_at && new Date(data.expires_at).getTime() <= Date.now());
  return {
    status: data.status,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
    revoked,
    lapsed: data.status === "approved" && (revoked || expired),
  };
}

/** Who is waiting, and who currently holds an approval. */
export async function listOffsiteAccess() {
  const denied = await requirePermission(
    "staff.approve_offsite_access",
    "Only Management and Super Admin can see access requests."
  );
  if (denied) return { error: denied.error, pending: [], granted: [] };

  // The admin client so the list can name staff who are not otherwise visible
  // to the reader, and so a request from a suspended account still appears.
  const admin = createAdminClient();
  const { data } = await admin
    .from("staff_offsite_access")
    .select("id, staff_id, requested_ip, requested_user_agent, reason, status, decided_at, expires_at, revoked_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const ids = [...new Set((data ?? []).map((r) => r.staff_id))];
  const { data: staffRows } = ids.length
    ? await admin.from("staff").select("id, full_name, role").in("id", ids)
    : { data: [] };
  const byId = new Map((staffRows ?? []).map((s) => [s.id, s]));

  const rows = (data ?? []).map((r) => ({
    ...r,
    staffName: byId.get(r.staff_id)?.full_name ?? "Unknown",
    staffRole: byId.get(r.staff_id)?.role ?? null,
  }));

  const now = Date.now();
  return {
    pending: rows.filter((r) => r.status === "pending"),
    granted: rows.filter(
      (r) => r.status === "approved" && !r.revoked_at && r.expires_at && new Date(r.expires_at).getTime() > now
    ),
    history: rows.filter(
      (r) =>
        r.status === "denied" ||
        (r.status === "approved" && (r.revoked_at || !r.expires_at || new Date(r.expires_at).getTime() <= now))
    ),
  };
}

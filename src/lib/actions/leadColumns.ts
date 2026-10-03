"use server";

import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { ARRANGEABLE_LEAD_COLUMNS, readLeadColumnOrder } from "@/lib/leadSheet";

// The order of the leads columns (0313), arranged by a Super Admin for
// everyone: the list, and the leads Excel template and export with it.

type Result = { success: true } | { error: string };

async function superAdmin() {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { ok: false, error: "You are signed out — reload the page." } as const;
  if (!hasRole(staff, "super_admin")) return { ok: false, error: "Only a Super Admin can arrange the leads columns." } as const;
  return { ok: true, supabase, staff } as const;
}

function refresh() {
  revalidatePath("/leads");
}

/** Saves the order: every column, once. */
export async function saveLeadColumnOrder(keys: string[]): Promise<Result> {
  const auth = await superAdmin();
  if (!auth.ok) return { error: auth.error };
  const order = readLeadColumnOrder(keys);
  if (!order || order.length !== ARRANGEABLE_LEAD_COLUMNS.length) {
    return { error: "That order does not name every column once — reload the page and try again." };
  }
  // An upsert RLS refuses writes nothing and says nothing, so it is read back.
  const { data, error } = await auth.supabase
    .from("list_column_orders")
    .upsert({ list_key: "leads", column_keys: order, updated_by: auth.staff.id, updated_at: new Date().toISOString() })
    .select("list_key");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "The order was not saved." };
  refresh();
  return { success: true };
}

/** Puts the columns back in their default order. */
export async function resetLeadColumnOrder(): Promise<Result> {
  const auth = await superAdmin();
  if (!auth.ok) return { error: auth.error };
  const { error } = await auth.supabase.from("list_column_orders").delete().eq("list_key", "leads");
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { ARRANGEABLE_LEAD_COLUMNS, readLeadColumnOrder } from "@/lib/leadSheet";
import { APPLICATION_COLUMNS, readApplicationColumnOrder } from "@/lib/applicationTable";

// The order of a list's columns (0313, 0319), arranged by a Super Admin for
// everyone: the leads list, with the leads Excel template and export, and the
// applications table, with its export.

type Result = { success: true } | { error: string };
export type ArrangeableList = "leads" | "applications";

const LISTS: Record<ArrangeableList, { read: (keys: unknown) => string[] | null; count: number; paths: string[]; name: string }> = {
  leads: { read: readLeadColumnOrder, count: ARRANGEABLE_LEAD_COLUMNS.length, paths: ["/leads"], name: "leads" },
  applications: { read: readApplicationColumnOrder, count: APPLICATION_COLUMNS.length, paths: ["/applications"], name: "applications" },
};

async function superAdmin(list: ArrangeableList) {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { ok: false, error: "You are signed out — reload the page." } as const;
  if (!hasRole(staff, "super_admin")) return { ok: false, error: `Only a Super Admin can arrange the ${LISTS[list].name} columns.` } as const;
  return { ok: true, supabase, staff } as const;
}

function refresh(list: ArrangeableList) {
  for (const path of LISTS[list].paths) revalidatePath(path);
}

/** Saves a list's order: every column, once. */
export async function saveColumnOrder(list: ArrangeableList, keys: string[]): Promise<Result> {
  if (!(list in LISTS)) return { error: "That is not a list whose columns can be arranged." };
  const auth = await superAdmin(list);
  if (!auth.ok) return { error: auth.error };
  const order = LISTS[list].read(keys);
  if (!order || order.length !== LISTS[list].count) {
    return { error: "That order does not name every column once — reload the page and try again." };
  }
  // An upsert RLS refuses writes nothing and says nothing, so it is read back.
  const { data, error } = await auth.supabase
    .from("list_column_orders")
    .upsert({ list_key: list, column_keys: order, updated_by: auth.staff.id, updated_at: new Date().toISOString() })
    .select("list_key");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "The order was not saved." };
  refresh(list);
  return { success: true };
}

/** Puts a list's columns back in their default order. */
export async function resetColumnOrder(list: ArrangeableList): Promise<Result> {
  if (!(list in LISTS)) return { error: "That is not a list whose columns can be arranged." };
  const auth = await superAdmin(list);
  if (!auth.ok) return { error: auth.error };
  const { error } = await auth.supabase.from("list_column_orders").delete().eq("list_key", list);
  if (error) return { error: error.message };
  refresh(list);
  return { success: true };
}


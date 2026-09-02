"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

export async function createInventoryItem(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("inventory.manage", "Only Management/Super Admin can add inventory items.");
  if (denied) return { error: denied.error };

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const quantity_on_hand = formData.get("quantity_on_hand") ? Number(formData.get("quantity_on_hand")) : 0;
  const low_stock_threshold = formData.get("low_stock_threshold") ? Number(formData.get("low_stock_threshold")) : null;

  if (!name) return { error: "Name is required." };

  const { error } = await supabase.from("inventory_items").insert({ name, category, unit, quantity_on_hand, low_stock_threshold });
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function updateInventoryItem(itemId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("inventory.manage", "Only Management/Super Admin can edit inventory items.");
  if (denied) return { error: denied.error };

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const quantity_on_hand = formData.get("quantity_on_hand") ? Number(formData.get("quantity_on_hand")) : 0;
  const low_stock_threshold = formData.get("low_stock_threshold") ? Number(formData.get("low_stock_threshold")) : null;

  if (!name) return { error: "Name is required." };

  const { error } = await supabase
    .from("inventory_items")
    .update({ name, category, unit, quantity_on_hand, low_stock_threshold })
    .eq("id", itemId);
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function deleteInventoryItem(itemId: string) {
  const supabase = await createClient();
  const denied = await requirePermission("inventory.manage", "Only Management/Super Admin can delete inventory items.");
  if (denied) return { error: denied.error };

  const { error } = await supabase.from("inventory_items").delete().eq("id", itemId);
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function requestInventoryItem(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const item_id = String(formData.get("item_id") ?? "") || null;
  const quantity = Number(formData.get("quantity") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!item_id || !quantity) return { error: "Choose an item and quantity." };

  const { error } = await supabase.from("inventory_requests").insert({ item_id, requested_by: user?.id, quantity, notes });
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function updateInventoryRequestStatus(requestId: string, status: "fulfilled" | "rejected") {
  const supabase = await createClient();

  // Single security-definer RPC — the status change and (for a fulfillment)
  // the stock decrement commit or fail together, with the request row
  // locked for the duration (see migration 0092), closing a race where two
  // concurrent "fulfill" clicks on the same request could both pass the
  // pending-check before either write landed.
  const { error } = await supabase.rpc("fulfill_inventory_request", { p_request_id: requestId, p_status: status });
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

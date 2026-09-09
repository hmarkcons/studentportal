"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { requestQuantityError, stockQuantityError, thresholdError } from "@/lib/inventory";

// Read and validated together, so add and edit cannot drift apart on what
// counts as a sensible quantity.
function readItemFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || null,
    unit: String(formData.get("unit") ?? "").trim() || null,
    quantity_on_hand: formData.get("quantity_on_hand") ? Number(formData.get("quantity_on_hand")) : 0,
    low_stock_threshold: formData.get("low_stock_threshold") ? Number(formData.get("low_stock_threshold")) : null,
  };
}

function validateItem(formData: FormData, fields: ReturnType<typeof readItemFields>) {
  if (!fields.name) return "Name is required.";
  return stockQuantityError(formData.get("quantity_on_hand")) ?? thresholdError(formData.get("low_stock_threshold"));
}

export async function createInventoryItem(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("inventory.manage", "Only Management/Super Admin can add inventory items.");
  if (denied) return { error: denied.error };

  const fields = readItemFields(formData);
  const invalid = validateItem(formData, fields);
  if (invalid) return { error: invalid };

  const { error } = await supabase.from("inventory_items").insert(fields);
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function updateInventoryItem(itemId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("inventory.manage", "Only Management/Super Admin can edit inventory items.");
  if (denied) return { error: denied.error };

  const fields = readItemFields(formData);
  const invalid = validateItem(formData, fields);
  if (invalid) return { error: invalid };

  const { error } = await supabase.from("inventory_items").update(fields).eq("id", itemId);
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

  // Requesting stays open to any active staff member — that is the point of a
  // request queue — but it has to be attributable. inventory_requests_select
  // shows a requester their own rows via requested_by = auth.uid(), so a row
  // with nobody against it would be invisible to the person who raised it and
  // unanswerable by anyone.
  if (!user) return { error: "Sign in again — your session has expired." };

  const item_id = String(formData.get("item_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!item_id) return { error: "Choose an item." };
  const quantityInvalid = requestQuantityError(formData.get("quantity"));
  if (quantityInvalid) return { error: quantityInvalid };
  const quantity = Number(formData.get("quantity"));

  // The name is snapshotted, because item_id is ON DELETE SET NULL: without it
  // a request whose item was later deleted renders as "Item × 5". It also
  // keeps the record honest if the item is renamed — a request should say what
  // was asked for at the time.
  const { data: item } = await supabase.from("inventory_items").select("name").eq("id", item_id).maybeSingle();
  if (!item) return { error: "That item no longer exists — reload the page." };

  const { error } = await supabase
    .from("inventory_requests")
    .insert({ item_id, item_name: item.name, requested_by: user.id, quantity, notes });
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

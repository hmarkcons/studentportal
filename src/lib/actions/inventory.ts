"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireManagement(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  return staffRow?.role === "super_admin" || staffRow?.role === "management";
}

export async function createInventoryItem(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireManagement(supabase))) return { error: "Only Management/Super Admin can add inventory items." };

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
  if (!(await requireManagement(supabase))) return { error: "Only Management/Super Admin can edit inventory items." };

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
  if (!(await requireManagement(supabase))) return { error: "Only Management/Super Admin can delete inventory items." };

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
  if (!(await requireManagement(supabase))) return { error: "Only Management/Super Admin can update requests." };

  const { data: request } = await supabase.from("inventory_requests").select("status, item_id, quantity").eq("id", requestId).maybeSingle();
  if (!request) return { error: "Request not found." };
  if (request.status !== "pending") return { error: "This request has already been decided." };

  const { error } = await supabase.from("inventory_requests").update({ status }).eq("id", requestId);
  if (error) return { error: error.message };

  // Fulfilling a request never actually reduced the tracked stock count —
  // the whole point of a request→fulfillment flow tied to quantity_on_hand
  // was defeated, since nothing else ever decrements it from real usage.
  if (status === "fulfilled" && request.item_id) {
    const { data: item } = await supabase.from("inventory_items").select("quantity_on_hand").eq("id", request.item_id).maybeSingle();
    if (item) {
      await supabase
        .from("inventory_items")
        .update({ quantity_on_hand: item.quantity_on_hand - request.quantity })
        .eq("id", request.item_id);
    }
  }

  revalidatePath("/inventory");
  return { success: true };
}

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

  const { error } = await supabase.from("inventory_requests").update({ status }).eq("id", requestId);
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

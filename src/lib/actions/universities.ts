"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createUniversity(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const destination_id = String(formData.get("destination_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");

  if (!destination_id || !name || !["public", "private"].includes(type)) {
    return { error: "Fill in all required fields." };
  }

  const { data, error } = await supabase.from("universities").insert({ destination_id, name, type }).select("id").single();
  if (error) return { error: error.message };

  redirect(`/setup/universities/${data.id}`);
}

export async function addProgram(universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const level = String(formData.get("level") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const core_field = String(formData.get("core_field") ?? "").trim() || null;
  const sub_field = String(formData.get("sub_field") ?? "").trim() || null;
  const tuition_fee = formData.get("tuition_fee") ? Number(formData.get("tuition_fee")) : null;

  if (!level || !name) return { error: "Level and name are required." };

  const { error } = await supabase.from("programs").insert({ university_id: universityId, level, name, core_field, sub_field, tuition_fee });
  if (error) return { error: error.message };

  revalidatePath(`/setup/universities/${universityId}`);
  return { success: true };
}

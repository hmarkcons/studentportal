"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function slugifyStages(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
}

export async function createDestination(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const country = String(formData.get("country") ?? "").trim();
  const country_code = String(formData.get("country_code") ?? "").trim().toUpperCase();
  const track = String(formData.get("track") ?? "");
  const currency = String(formData.get("currency") ?? "").trim();
  const display_name = String(formData.get("display_name") ?? "").trim() || `${country} (${track})`;
  const admin_charge = Number(formData.get("admin_charge") ?? 0);
  const consultancy_fee = Number(formData.get("consultancy_fee") ?? 0);
  const consultancy_fee_currency = String(formData.get("consultancy_fee_currency") ?? "EUR");
  const stagesRaw = String(formData.get("pipeline_stages") ?? "");

  if (!country || !country_code || !["public", "private"].includes(track) || !currency) {
    return { error: "Fill in all required fields." };
  }

  const pipeline_stages = stagesRaw ? slugifyStages(stagesRaw) : undefined;

  const { data, error } = await supabase
    .from("destinations")
    .insert({
      country,
      country_code,
      track,
      currency,
      display_name,
      admin_charge,
      consultancy_fee,
      consultancy_fee_currency,
      ...(pipeline_stages ? { pipeline_stages } : {}),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  redirect(`/setup/destinations/${data.id}`);
}

export async function updateDestinationStages(destinationId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const stagesRaw = String(formData.get("pipeline_stages") ?? "");
  const pipeline_stages = slugifyStages(stagesRaw);

  if (pipeline_stages.length === 0) return { error: "Enter at least one stage." };

  const { error } = await supabase.from("destinations").update({ pipeline_stages }).eq("id", destinationId);
  if (error) return { error: error.message };

  revalidatePath(`/setup/destinations/${destinationId}`);
  return { success: true };
}

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

export async function updateDestination(destinationId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const country = String(formData.get("country") ?? "").trim();
  const country_code = String(formData.get("country_code") ?? "").trim().toUpperCase();
  const track = String(formData.get("track") ?? "");
  const currency = String(formData.get("currency") ?? "").trim();
  const display_name = String(formData.get("display_name") ?? "").trim();
  const visa_type = String(formData.get("visa_type") ?? "").trim() || null;
  const admin_charge = Number(formData.get("admin_charge") ?? 0);
  const consultancy_fee = Number(formData.get("consultancy_fee") ?? 0);
  const consultancy_fee_currency = String(formData.get("consultancy_fee_currency") ?? "EUR");
  const status = String(formData.get("status") ?? "active");

  if (!country || !country_code || !["public", "private"].includes(track) || !currency || !display_name) {
    return { error: "Fill in all required fields." };
  }

  const { error } = await supabase
    .from("destinations")
    .update({ country, country_code, track, currency, display_name, visa_type, admin_charge, consultancy_fee, consultancy_fee_currency, status })
    .eq("id", destinationId);

  if (error) return { error: error.message };

  revalidatePath(`/setup/destinations/${destinationId}`);
  revalidatePath("/setup/destinations");
  return { success: true };
}

export async function deleteDestination(destinationId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("destinations").delete().eq("id", destinationId);
  if (error) return { error: error.message };
  redirect("/setup/destinations");
}

// Bulk import — CSV columns (header row required): country, country_code,
// track (public/private), display_name, currency, visa_type, admin_charge,
// consultancy_fee, consultancy_fee_currency. Only country/country_code/
// track/currency are required; everything else falls back to a sane
// default the same way createDestination does.
export async function importDestinations(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a CSV file first." };

  const { parseCsvWithHeader } = await import("@/lib/csv");
  const text = await file.text();
  const rows = parseCsvWithHeader(text);
  if (rows.length === 0) return { error: "The file has no data rows." };

  const records = rows
    .filter((r) => r.country && r.country_code && ["public", "private"].includes(r.track) && r.currency)
    .map((r) => ({
      country: r.country,
      country_code: r.country_code.toUpperCase(),
      track: r.track,
      currency: r.currency,
      display_name: r.display_name || `${r.country} (${r.track === "public" ? "Public" : "Private"})`,
      visa_type: r.visa_type || null,
      admin_charge: r.admin_charge ? Number(r.admin_charge) : 0,
      consultancy_fee: r.consultancy_fee ? Number(r.consultancy_fee) : 0,
      consultancy_fee_currency: r.consultancy_fee_currency || "EUR",
    }));

  if (records.length === 0) {
    return { error: "No valid rows found — check country, country_code, track (public/private), and currency columns." };
  }

  const { error } = await supabase.from("destinations").insert(records);
  if (error) return { error: error.message };

  revalidatePath("/setup/destinations");
  return { success: true, count: records.length };
}

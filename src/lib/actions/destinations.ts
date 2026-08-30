"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MANUAL_APPLICATION_STATUSES } from "@/lib/constants";

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
  const installment_plan = String(formData.get("installment_plan") ?? "").trim() || null;
  const stagesRaw = String(formData.get("pipeline_stages") ?? "");

  if (!country || !country_code || !["public", "private"].includes(track) || !currency) {
    return { error: "Fill in all required fields." };
  }
  if (admin_charge < 0 || consultancy_fee < 0) {
    return { error: "Admin charge and consultancy fee can't be negative." };
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
      installment_plan,
      ...(pipeline_stages ? { pipeline_stages } : {}),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidateTag("destinations", { expire: 0 });
  redirect(`/setup/destinations/${data.id}`);
}

export async function updateDestinationStages(destinationId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const stagesRaw = String(formData.get("pipeline_stages") ?? "");
  const pipeline_stages = slugifyStages(stagesRaw);

  if (pipeline_stages.length === 0) return { error: "Enter at least one stage." };

  // Removing a stage some existing application currently sits at would
  // silently leave that application's current_stage pointing at a value
  // no longer in the pipeline — validate_application_stage() (0080) then
  // rejects the NEXT edit to that application with a confusing error that
  // gives staff no link back to this pipeline change as the actual cause.
  const { data: universities } = await supabase.from("universities").select("id").eq("destination_id", destinationId);
  const universityIds = (universities ?? []).map((u) => u.id);
  if (universityIds.length > 0) {
    const { data: applications } = await supabase.from("applications").select("current_stage").in("university_id", universityIds);
    const allowedStages = new Set<string>([...pipeline_stages, ...MANUAL_APPLICATION_STATUSES]);
    const affected = (applications ?? []).filter((a) => !allowedStages.has(a.current_stage));
    if (affected.length > 0) {
      const orphanedStages = [...new Set(affected.map((a) => a.current_stage))];
      return {
        error: `Can't save — ${affected.length} existing application(s) are currently at a stage this pipeline no longer includes: ${orphanedStages.join(", ")}. Add those stages back, or move those applications first.`,
      };
    }
  }

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
  const installment_plan = String(formData.get("installment_plan") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "active");

  if (!country || !country_code || !["public", "private"].includes(track) || !currency || !display_name) {
    return { error: "Fill in all required fields." };
  }
  if (admin_charge < 0 || consultancy_fee < 0) {
    return { error: "Admin charge and consultancy fee can't be negative." };
  }

  const { error } = await supabase
    .from("destinations")
    .update({
      country,
      country_code,
      track,
      currency,
      display_name,
      visa_type,
      admin_charge,
      consultancy_fee,
      consultancy_fee_currency,
      installment_plan,
      status,
    })
    .eq("id", destinationId);

  if (error) return { error: error.message };

  revalidatePath(`/setup/destinations/${destinationId}`);
  revalidatePath("/setup/destinations");
  revalidateTag("destinations", { expire: 0 });
  return { success: true };
}

export async function deleteDestination(destinationId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("destinations").delete().eq("id", destinationId);
  if (error) return { error: error.message };
  revalidateTag("destinations", { expire: 0 });
  redirect("/setup/destinations");
}

// Bulk import — CSV columns (header row required): country, country_code,
// track (public/private), display_name, currency, visa_type, admin_charge,
// consultancy_fee, consultancy_fee_currency, installment_plan. Only
// country/country_code/track/currency are required; everything else falls
// back to a sane default the same way createDestination does.
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
      installment_plan: r.installment_plan || null,
    }));

  if (records.length === 0) {
    return { error: "No valid rows found — check country, country_code, track (public/private), and currency columns." };
  }

  // destinations has a real unique(country_code, track) constraint — without
  // this check, re-uploading a file containing even one row that already
  // exists would fail the entire batch insert with a unique-violation error,
  // importing none of the file's rows, including genuinely new ones.
  const { data: existing } = await supabase.from("destinations").select("country_code, track");
  const existingKeys = new Set((existing ?? []).map((d) => `${d.country_code}__${d.track}`));
  const toInsert = records.filter((r) => !existingKeys.has(`${r.country_code}__${r.track}`));
  const skipped = records.length - toInsert.length;

  if (toInsert.length === 0) {
    return { error: "Every row already matches an existing destination (same country + track) — nothing new to import." };
  }

  const { error } = await supabase.from("destinations").insert(toInsert);
  if (error) return { error: error.message };

  revalidatePath("/setup/destinations");
  revalidateTag("destinations", { expire: 0 });
  return { success: true, count: toInsert.length, skipped };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

const PAGE = "/setup/visa-offices";

const KINDS = ["embassy", "high_commission", "consulate", "visa_centre"] as const;

async function gate() {
  // The same permission that guards the rest of Setup's directories. A wrong
  // address here sends a student to the wrong city on the morning of their
  // appointment, so this is not a counselor's to edit.
  const denied = await requirePermission(
    "settings.visa_offices",
    "Only Management and Super Admin can edit the visa office directory."
  );
  return denied ? denied.error : null;
}

function readForm(formData: FormData) {
  const text = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const kindRaw = String(formData.get("kind") ?? "");
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? kindRaw : null;

  return {
    kind,
    payload: {
      kind,
      name: String(formData.get("name") ?? "").trim(),
      city: text("city"),
      operator: text("operator"),
      address: text("address"),
      phone: text("phone"),
      email: text("email"),
      website: text("website"),
      appointment_url: text("appointment_url"),
      office_hours: text("office_hours"),
      jurisdiction: text("jurisdiction"),
      submits_applications: formData.get("submits_applications") === "on",
      notes: text("notes"),
      internal_notes: text("internal_notes"),
      source_url: text("source_url"),
      // Ticking "confirmed" stamps the moment somebody took responsibility for
      // it; unticking clears it, so an entry that turns out to be wrong can be
      // put back into doubt rather than silently corrected.
      verified_at: formData.get("verified") === "on" ? new Date().toISOString() : null,
      sort_order: Number(formData.get("sort_order") ?? 0) || 0,
    },
  };
}

export async function createVisaOffice(destinationId: string, _prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };

  const { kind, payload } = readForm(formData);
  if (!kind) return { error: "Choose what kind of office this is." };
  if (!payload.name) return { error: "Give the office a name." };

  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from("visa_offices")
    .insert({ ...payload, destination_id: destinationId });
  if (insertError) {
    return {
      error: insertError.message.includes("visa_offices_one_per_city")
        ? "There is already an office of that kind in that city for this country. Edit that one instead."
        : insertError.message,
    };
  }

  revalidatePath(PAGE);
  return { success: true };
}

export async function updateVisaOffice(officeId: string, _prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };

  const { kind, payload } = readForm(formData);
  if (!kind) return { error: "Choose what kind of office this is." };
  if (!payload.name) return { error: "Give the office a name." };

  const supabase = await createClient();
  const { error: updateError } = await supabase.from("visa_offices").update(payload).eq("id", officeId);
  if (updateError) {
    return {
      error: updateError.message.includes("visa_offices_one_per_city")
        ? "There is already an office of that kind in that city for this country."
        : updateError.message,
    };
  }

  revalidatePath(PAGE);
  return { success: true };
}

/**
 * Archives rather than deletes.
 *
 * A centre that closes is still the place a student went last month, and a
 * deleted row takes that with it. Archived entries drop off every page but
 * stay on file.
 */
export async function archiveVisaOffice(officeId: string) {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase.from("visa_offices").update({ status: "archived" }).eq("id", officeId);
  if (updateError) return { error: updateError.message };

  revalidatePath(PAGE);
  return { success: true };
}

export async function restoreVisaOffice(officeId: string) {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase.from("visa_offices").update({ status: "active" }).eq("id", officeId);
  if (updateError) return { error: updateError.message };

  revalidatePath(PAGE);
  return { success: true };
}

/** Marks an entry as checked today, without opening the form. */
export async function confirmVisaOffice(officeId: string) {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("visa_offices")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", officeId);
  if (updateError) return { error: updateError.message };

  revalidatePath(PAGE);
  return { success: true };
}

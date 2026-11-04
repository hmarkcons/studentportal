"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/auth/roles";
import { AGREEMENT_COMPANY_COLUMNS, companyFromForm, type AgreementCompanyRow } from "@/lib/agreementCompany";
import { parsePkrRate } from "@/lib/receiptPkr";
import { readAgreementRate } from "@/lib/agreementCompanyRead";

/** The saved company details, for the Company details tab. Null when unreadable. */
export async function getAgreementCompanySettings(): Promise<AgreementCompanyRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agreement_settings")
    .select(AGREEMENT_COMPANY_COLUMNS)
    .eq("id", true)
    .maybeSingle<AgreementCompanyRow>();
  return data ?? null;
}

/**
 * Saves the company details every agreement prints. Super Admin only — checked
 * here, and the database agrees (0288). Agreements already generated keep what
 * they say; the details apply the next time one is generated or regenerated.
 */
export async function updateAgreementCompany(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle();
  if (!hasRole(me, "super_admin")) return { error: "Only a Super Admin can change the company details on agreements." };

  const read = companyFromForm((key) => formData.get(key));
  if (read.error !== undefined) return { error: read.error };

  // Selected back: an update the database refuses matches no rows and raises
  // nothing, which would otherwise read as "Saved".
  const { data: written, error } = await supabase
    .from("agreement_settings")
    .update({ ...read.row, updated_by: user?.id ?? null })
    .eq("id", true)
    .select("id");
  if (error) return { error: error.message };
  if (!written?.length) return { error: "The company details weren't saved — only a Super Admin can change them." };

  revalidatePath("/setup/agreement-templates");
  return { success: true };
}

/** The standard rupees per euro for agreements (0351), for the Company details tab. */
export async function getAgreementRate(): Promise<number> {
  return readAgreementRate(await createClient());
}

/**
 * Saves the rupees per euro an agreement in the other currency than its
 * country's fees is converted at, as standard (0351). Super Admin only, as the
 * rest of what a contract says. Agreements already made keep the rate they
 * were made at; this is what the next one is offered.
 */
export async function updateAgreementRate(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle();
  if (!hasRole(me, "super_admin")) return { error: "Only a Super Admin can change the rate agreements are converted at." };

  const rate = parsePkrRate(formData.get("pkr_per_eur"));
  if (rate === null) return { error: "Give the rupees per euro as a number, e.g. 335." };

  // Selected back: an update the database refuses matches no rows and raises nothing.
  const { data: written, error } = await supabase
    .from("agreement_settings")
    .update({ pkr_per_eur: rate, updated_by: user?.id ?? null })
    .eq("id", true)
    .select("id");
  if (error) return { error: error.message };
  if (!written?.length) return { error: "The rate wasn't saved — only a Super Admin can change it." };

  revalidatePath("/setup/agreement-templates");
  return { success: true };
}

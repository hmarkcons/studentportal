"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type InvoiceBankSettings = {
  bank_name: string | null;
  account_title: string | null;
  account_number: string | null;
  iban: string | null;
  branch: string | null;
  swift_code: string | null;
  payment_note: string | null;
  /** Currency the account itself is held in — drives the conversion note. */
  account_currency: string | null;
  /** Rupees per euro, stamped onto each invoice as it is issued. */
  pkr_per_eur: number | null;
};

/** Read the singleton bank block. Any active staff member may read it — it is
 *  printed on invoices they issue. Returns null when the row is unreachable so
 *  callers render "not configured" rather than a half-filled bank block. */
export async function getInvoiceBankSettings(): Promise<InvoiceBankSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoice_settings")
    .select("bank_name, account_title, account_number, iban, branch, swift_code, payment_note, account_currency, pkr_per_eur")
    .eq("id", true)
    .maybeSingle();
  return data ?? null;
}

const FIELDS = ["bank_name", "account_title", "account_number", "iban", "branch", "swift_code", "payment_note", "account_currency"] as const;

/** A rate has to be a positive number: a zero or a blank would silently strip
 *  the rupee figures off every receipt issued afterwards. */
function parseRate(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export async function updateInvoiceBankSettings(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const patch: Record<string, string | null> = {};
  for (const f of FIELDS) {
    patch[f] = String(formData.get(f) ?? "").trim() || null;
  }

  const rate = parseRate(formData.get("pkr_per_eur"));
  if (rate === null) return { error: "Give a rupees-per-euro rate greater than zero." };

  // Only the RLS policy decides who may write (super_admin) — no role check is
  // duplicated here, so a permission change in the database is authoritative.
  const { error } = await supabase.from("invoice_settings").update({ ...patch, pkr_per_eur: rate }).eq("id", true);
  if (error) return { error: error.message };

  revalidatePath("/setup/invoice-settings");
  revalidatePath("/finance/invoice-generator");
  return { success: true };
}

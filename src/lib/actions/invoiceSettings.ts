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
};

/** Read the singleton bank block. Any active staff member may read it — it is
 *  printed on invoices they issue. Returns null when the row is unreachable so
 *  callers render "not configured" rather than a half-filled bank block. */
export async function getInvoiceBankSettings(): Promise<InvoiceBankSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoice_settings")
    .select("bank_name, account_title, account_number, iban, branch, swift_code, payment_note, account_currency")
    .eq("id", true)
    .maybeSingle();
  return data ?? null;
}

const FIELDS = ["bank_name", "account_title", "account_number", "iban", "branch", "swift_code", "payment_note", "account_currency"] as const;

export async function updateInvoiceBankSettings(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const patch: Record<string, string | null> = {};
  for (const f of FIELDS) {
    patch[f] = String(formData.get(f) ?? "").trim() || null;
  }

  // Only the RLS policy decides who may write (super_admin) — no role check is
  // duplicated here, so a permission change in the database is authoritative.
  const { error } = await supabase.from("invoice_settings").update(patch).eq("id", true);
  if (error) return { error: error.message };

  revalidatePath("/setup/invoice-settings");
  revalidatePath("/finance/invoice-generator");
  return { success: true };
}

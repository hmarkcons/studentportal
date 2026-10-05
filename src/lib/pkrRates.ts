import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PKR_PER_EUR } from "@/lib/receiptPkr";

/** A rupees-per-euro rate as given, from the log (pkr_rates, 0318). */
export type PkrRateEntry = {
  rate: number;
  usedFor: "invoice" | "payment" | "setup";
  setAt: string;
  setBy: string | null;
  invoiceNumber: string | null;
};

type Row = {
  rate: number | string;
  used_for: PkrRateEntry["usedFor"];
  set_at: string;
  staff: { full_name: string } | { full_name: string }[] | null;
  invoice: { invoice_number: string | null } | { invoice_number: string | null }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** The rates given most recently, newest first. */
export async function loadRecentPkrRates(supabase: SupabaseClient, limit = 10): Promise<PkrRateEntry[]> {
  const { data } = await supabase
    .from("pkr_rates")
    .select("rate, used_for, set_at, staff:staff!pkr_rates_set_by_fkey(full_name), invoice:invoices!pkr_rates_invoice_id_fkey(invoice_number)")
    .order("set_at", { ascending: false })
    .limit(limit)
    .returns<Row[]>();
  return (data ?? []).map((r) => ({
    rate: Number(r.rate),
    usedFor: r.used_for,
    setAt: r.set_at,
    setBy: one(r.staff)?.full_name ?? null,
    invoiceNumber: one(r.invoice)?.invoice_number ?? null,
  }));
}

/**
 * The rate the next invoice or payment is offered: the one given last. Before
 * any has been logged, the one in Setup, and before that the old default.
 */
export async function loadLatestPkrRate(supabase: SupabaseClient): Promise<PkrRateEntry> {
  const [latest] = await loadRecentPkrRates(supabase, 1);
  if (latest) return latest;
  const { data } = await supabase.from("invoice_settings").select("pkr_per_eur").eq("id", true).maybeSingle();
  const rate = Number(data?.pkr_per_eur);
  return { rate: rate > 0 ? rate : DEFAULT_PKR_PER_EUR, usedFor: "setup", setAt: "", setBy: null, invoiceNumber: null };
}

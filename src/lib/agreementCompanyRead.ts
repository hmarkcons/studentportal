import type { SupabaseClient } from "@supabase/supabase-js";
import { AGREEMENT_COMPANY_COLUMNS, companyFromSettings, type AgreementCompany, type AgreementCompanyRow } from "@/lib/agreementCompany";
import { STANDARD_AGREEMENT_PKR_PER_EUR } from "@/lib/agreementCurrency";

/**
 * The company details every agreement prints (0288), read through the client
 * the caller already holds — a staff session or the service role alike.
 *
 * A row that cannot be read falls back to what agreements always printed
 * rather than failing the agreement: the details are the company's own, and
 * the old wording is a correct answer, only not the edited one.
 */
export async function readAgreementCompany(supabase: SupabaseClient): Promise<AgreementCompany> {
  const { data } = await supabase
    .from("agreement_settings")
    .select(AGREEMENT_COMPANY_COLUMNS)
    .eq("id", true)
    .maybeSingle<AgreementCompanyRow>();
  return companyFromSettings(data);
}

/**
 * The rupees per euro an agreement in the other currency than its country's
 * fees is converted at, as standard (0351) — offered on the form, where it can
 * be changed for that one agreement. 335 until the Super Admin sets another.
 */
export async function readAgreementRate(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from("agreement_settings").select("pkr_per_eur").eq("id", true).maybeSingle();
  const rate = Number(data?.pkr_per_eur);
  return rate > 0 ? rate : STANDARD_AGREEMENT_PKR_PER_EUR;
}

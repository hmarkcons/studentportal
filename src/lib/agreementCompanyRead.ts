import type { SupabaseClient } from "@supabase/supabase-js";
import { AGREEMENT_COMPANY_COLUMNS, companyFromSettings, type AgreementCompany, type AgreementCompanyRow } from "@/lib/agreementCompany";

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

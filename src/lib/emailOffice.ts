import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_OFFICE, type OfficeDetails } from "@/lib/studentEmail";

// The office's name, address and numbers at the foot of every student email,
// as Setup › Invoice settings has them — the same details the invoice PDF
// carries, so the two cannot disagree.
//
// Read once and cached, because a cron run sends dozens of these and the
// details change a few times a year. Saving Invoice settings revalidates the
// tag (updateInvoiceBankSettings). The key is versioned because Vercel's Data
// Cache outlives a deploy: a change to what is read needs a new key.

export const EMAIL_OFFICE_TAG = "email-office";

const read = unstable_cache(
  async (): Promise<OfficeDetails> => {
    const { data, error } = await createAdminClient()
      .from("invoice_settings")
      .select("company_name, company_address, company_phone, company_mobile, company_email, company_website")
      .eq("id", true)
      .maybeSingle();
    // Thrown, so a failed read is not cached as "no details": the caller falls back for this send only.
    if (error) throw new Error(error.message);
    const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      ...DEFAULT_OFFICE,
      name: text(data?.company_name) ?? DEFAULT_OFFICE.name,
      address: text(data?.company_address),
      phone: text(data?.company_phone),
      mobile: text(data?.company_mobile),
      email: text(data?.company_email),
      website: text(data?.company_website),
    };
  },
  ["email-office-v1"],
  { tags: [EMAIL_OFFICE_TAG], revalidate: 3600 }
);

/** The office's details for an email's footer; the defaults if they cannot be read just now. */
export async function loadEmailOffice(): Promise<OfficeDetails> {
  try {
    return await read();
  } catch {
    return DEFAULT_OFFICE;
  }
}

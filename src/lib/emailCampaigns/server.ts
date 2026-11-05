import type { SupabaseClient } from "@supabase/supabase-js";
import { getSiteUrl } from "@/lib/siteUrl";
import { contactMergeValues, SAMPLE_CONTACT, type MergeValues } from "./mergeTags";

export const EMAIL_ASSETS_BUCKET = "email-assets";

export type EmailSettings = {
  provider: "none" | "ses" | "resend";
  from_name: string;
  from_email: string | null;
  reply_to: string | null;
  physical_address: string;
  max_upload_mb: number;
};

export const EMAIL_SETTINGS_DEFAULTS: EmailSettings = {
  provider: "none",
  from_name: "HMARK Consultants",
  from_email: null,
  reply_to: null,
  physical_address: "Suite 101, Dashtiyar Chambers, University Road, Gulshan-e-Iqbal, Block 13-C, Karachi, Pakistan",
  max_upload_mb: 20,
};

/** The email settings (0354), or the defaults where the row cannot be read. */
export async function readEmailSettings(supabase: SupabaseClient): Promise<EmailSettings> {
  const { data } = await supabase
    .from("email_settings")
    .select("provider, from_name, from_email, reply_to, physical_address, max_upload_mb")
    .eq("id", true)
    .maybeSingle<EmailSettings>();
  return data ? { ...EMAIL_SETTINGS_DEFAULTS, ...data } : EMAIL_SETTINGS_DEFAULTS;
}

/** Where an uploaded file of a template version is stored: its own folder, a numbered safe name. */
export function assetStorageKey(templateId: string, versionId: string, index: number, sourcePath: string): string {
  const name = sourcePath.split("/").pop() ?? "file";
  const safe = name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(-80) || "file";
  return `${templateId}/${versionId}/${String(index).padStart(3, "0")}-${safe}`;
}

/** The page a link in a test email opens: it says the link works in the real email. */
export function testLinkUrl(kind: string): string {
  return `${getSiteUrl()}/email/test-link?link=${encodeURIComponent(kind)}`;
}

/** The links a preview or a test email carries in place of a recipient's own. */
export function testLinks() {
  return {
    unsubscribe_url: testLinkUrl("unsubscribe"),
    preferences_url: testLinkUrl("preferences"),
    web_version_url: testLinkUrl("web-version"),
  };
}

/**
 * The values a preview or a test email is filled with: the chosen lead's, read
 * as the signed-in person (so only a lead they may see), or the sample
 * contact. The links are the test page.
 */
export async function previewValues(supabase: SupabaseClient, leadId: string | null | undefined): Promise<{ values: MergeValues; label: string }> {
  if (leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("full_name, email, country_of_interest, intake, assigned_counselor_id")
      .eq("id", leadId)
      .maybeSingle();
    if (lead) {
      const { data: counsellor } = lead.assigned_counselor_id
        ? await supabase.from("staff").select("full_name").eq("id", lead.assigned_counselor_id).maybeSingle()
        : { data: null };
      return { values: contactMergeValues(lead, counsellor?.full_name ?? null, testLinks()), label: lead.full_name ?? "Contact" };
    }
  }
  return { values: { ...SAMPLE_CONTACT, ...testLinks() }, label: "Sample contact (Ayesha Khan)" };
}

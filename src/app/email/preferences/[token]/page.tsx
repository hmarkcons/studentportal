import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { addressByToken, readEmailTopics } from "@/lib/emailCampaigns/subscription";
import { EmailPublicShell } from "../../EmailPublicShell";
import { PreferencesForm } from "./PreferencesForm";

export const metadata: Metadata = { title: "Email preferences — HMARK Consultants", robots: { index: false, follow: false } };

// The preference centre an email's "Email preferences" link opens: which
// topics the person hears about, or nothing at all. Public — the token in the
// link is the proof — and read through the service role.
export default async function EmailPreferencesPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const admin = createAdminClient();
  const [row, topics] = await Promise.all([addressByToken(admin, token), readEmailTopics(admin)]);
  if (!row) {
    return (
      <EmailPublicShell title="This link has expired">
        <p className="text-sm text-muted">Use the “Email preferences” link in a more recent email from HMARK Consultants.</p>
      </EmailPublicShell>
    );
  }
  return (
    <EmailPublicShell title="Your email preferences">
      <PreferencesForm token={token} email={row.email} status={row.status} topics={topics} chosen={row.topics} />
    </EmailPublicShell>
  );
}

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { addressByToken } from "@/lib/emailCampaigns/subscription";
import { EmailPublicShell } from "../../EmailPublicShell";
import { UnsubscribeButton } from "./UnsubscribeButton";

export const metadata: Metadata = { title: "Unsubscribe — HMARK Consultants", robots: { index: false, follow: false } };

// The page an email's "Unsubscribe" link opens. Opening it changes nothing —
// a mail scanner opens every link — the person confirms with a button. Their
// mail client's own one-click unsubscribe posts to /api/email/unsubscribe/…
// instead, which acts at once (RFC 8058).
export default async function UnsubscribePage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ r?: string }> }) {
  const { token } = await props.params;
  const { r } = await props.searchParams;
  const row = await addressByToken(createAdminClient(), token);
  if (!row) {
    return (
      <EmailPublicShell title="This link has expired">
        <p className="text-sm text-muted">Use the “Unsubscribe” link in a more recent email from HMARK Consultants.</p>
      </EmailPublicShell>
    );
  }
  const already = row.status !== "subscribed" && row.status !== "suppressed";
  return (
    <EmailPublicShell title={already ? "You are unsubscribed" : "Unsubscribe from HMARK emails"}>
      {already ? (
        <p className="text-sm text-muted">{row.email} won&rsquo;t receive HMARK&rsquo;s marketing emails.</p>
      ) : (
        <UnsubscribeButton token={token} email={row.email} recipientToken={r ?? null} />
      )}
      <p className="mt-4 text-xs text-muted">
        <a href={`/email/preferences/${token}`} className="text-primary hover:underline">
          Choose topics instead
        </a>{" "}
        — hear only about what interests you.
      </p>
    </EmailPublicShell>
  );
}

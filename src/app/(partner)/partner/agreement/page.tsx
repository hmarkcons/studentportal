import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function PartnerAgreementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: account } = await supabase.from("partner_university_accounts").select("university_id").eq("id", user?.id ?? "").maybeSingle();
  if (!account) return null;

  const { data: agreement } = await supabase
    .from("partner_agreements")
    .select("file_path, expiry_date, commission_terms")
    .eq("university_id", account.university_id)
    .maybeSingle();

  if (!agreement) {
    return (
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 text-lg font-semibold text-ink">Partnership Agreement</h2>
        <EmptyState>No agreement on file yet.</EmptyState>
      </div>
    );
  }

  const { data } = await supabase.storage.from("documents").createSignedUrl(agreement.file_path, 3600);

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Partnership Agreement</h2>
      <Card>
        {agreement.expiry_date && <p className="text-sm text-muted">Expires: {new Date(agreement.expiry_date).toLocaleDateString()}</p>}
        {data?.signedUrl && (
          <a href={data.signedUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-primary underline">
            View agreement
          </a>
        )}
      </Card>
    </div>
  );
}

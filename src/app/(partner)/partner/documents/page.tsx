import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { UploadExchangeForm } from "./UploadExchangeForm";

export default async function PartnerDocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: account } = await supabase.from("partner_university_accounts").select("university_id").eq("id", user?.id ?? "").maybeSingle();
  if (!account) return null;

  const { data: docs } = await supabase
    .from("partner_document_exchange")
    .select("id, file_path, description, created_at")
    .eq("university_id", account.university_id)
    .order("created_at", { ascending: false });

  const links = new Map<string, string>();
  await Promise.all(
    (docs ?? []).map(async (d) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      if (data?.signedUrl) links.set(d.id, data.signedUrl);
    })
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Document Exchange</h2>
      <Card className="mb-6">
        <UploadExchangeForm universityId={account.university_id} />
      </Card>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(docs ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-ink">{d.description ?? "Document"}</span>
            <a href={links.get(d.id)} target="_blank" rel="noreferrer" className="text-primary underline">
              View
            </a>
          </div>
        ))}
        {(!docs || docs.length === 0) && <p className="px-4 py-6 text-sm text-muted">No documents shared yet.</p>}
      </div>
    </div>
  );
}

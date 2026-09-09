import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { UploadExchangeForm } from "./UploadExchangeForm";
import { uploadedLine } from "@/lib/activityStamp";

export default async function PartnerDocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: account } = await supabase.from("partner_university_accounts").select("university_id").eq("id", user?.id ?? "").maybeSingle();
  if (!account) return null;

  const { data: docs } = await supabase
    .from("partner_document_exchange")
    .select("id, file_path, description, created_at, uploaded_by_partner, uploaded_by_staff")
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
          <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="min-w-0">
              <span className="block text-ink">{d.description ?? "Document"}</span>
              {/* created_at was selected all along and never rendered, so
                  neither side could tell when a document had been shared or
                  which of them had shared it. */}
              <span className="block text-xs text-muted">
                {uploadedLine({
                  at: d.created_at,
                  byRole: d.uploaded_by_partner ? "partner" : d.uploaded_by_staff ? "staff" : null,
                  audience: "partner",
                })}
              </span>
            </span>
            <a href={links.get(d.id)} target="_blank" rel="noreferrer" className="shrink-0 text-primary underline">
              View
            </a>
          </div>
        ))}
        {(!docs || docs.length === 0) && <p className="px-4 py-6 text-sm text-muted">No documents shared yet.</p>}
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { EditAgreementTemplateForm } from "./EditAgreementTemplateForm";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function AgreementTemplateDetailPage(props: PageProps<"/setup/agreement-templates/[id]">) {
  const { id } = await props.params;
  const { supabase, staff } = await getStaffSession();
  const isSuperAdmin = staff?.role === "super_admin";

  const [{ data: template }, { data: destinations }] = await Promise.all([
    supabase
      .from("agreement_templates")
      .select("id, name, signatory_name, wording, file_path, destination_id, destination:destinations(display_name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("destinations").select("id, display_name").order("display_name"),
  ]);

  if (!template) notFound();
  const destination = one(template.destination as never) as { display_name?: string } | null;

  return (
    <div className="w-full max-w-3xl">
      <Link href="/setup/agreement-templates" className="text-sm text-muted hover:text-ink">
        &larr; Back to agreement templates
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold text-ink">
        {template.name} <span className="text-muted">· {destination?.display_name ?? "—"}</span>
      </h2>

      <Card>
        {isSuperAdmin ? (
          <EditAgreementTemplateForm template={template} destinations={destinations ?? []} />
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <span className="text-muted">Destination:</span> {destination?.display_name ?? "—"}
            </p>
            <p>
              <span className="text-muted">Signatory:</span> {template.signatory_name}
            </p>
            <div>
              <p className="mb-1 text-muted">Wording:</p>
              <pre className="whitespace-pre-wrap rounded-md border border-border bg-bg p-3 text-xs text-ink">
                {template.wording || "(no wording configured — falls back to legacy default wording for this destination, if any)"}
              </pre>
            </div>
            <p className="text-xs text-muted">Only Super Admin can edit or delete agreement templates.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

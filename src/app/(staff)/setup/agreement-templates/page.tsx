import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { NewAgreementTemplateForm } from "./NewAgreementTemplateForm";
import { DeleteTemplateButton } from "./DeleteTemplateButton";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function AgreementTemplatesPage() {
  const { supabase, staff } = await getStaffSession();
  const isSuperAdmin = staff?.role === "super_admin";

  const { data: destinations } = await supabase.from("destinations").select("id, display_name").order("display_name");
  const { data: templates } = await supabase
    .from("agreement_templates")
    .select("id, name, signatory_name, destination:destinations(display_name)")
    .order("created_at", { ascending: false });

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Agreement Templates</h2>
      <p className="mb-4 text-sm text-muted">
        Staff pick from these when generating a student&apos;s agreement. Multiple templates per destination are supported —
        {isSuperAdmin ? " open one to edit its wording." : " only Super Admin can edit or delete them."}
      </p>
      {isSuperAdmin && (
        <Card className="mb-6">
          <NewAgreementTemplateForm destinations={destinations ?? []} />
        </Card>
      )}

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(templates ?? []).map((t) => {
          const destination = one(t.destination as never) as { display_name?: string } | null;
          return (
            <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <Link href={`/setup/agreement-templates/${t.id}`} className="text-ink hover:underline">
                {t.name} <span className="text-muted">· {destination?.display_name ?? "—"} · {t.signatory_name}</span>
              </Link>
              {isSuperAdmin && <DeleteTemplateButton id={t.id} />}
            </div>
          );
        })}
        {(!templates || templates.length === 0) && <p className="px-4 py-6 text-sm text-muted">No agreement templates yet.</p>}
      </div>
    </div>
  );
}
